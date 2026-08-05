import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { GamesStore, VersionManifest } from './games-store.js';
import { readGameModules, stripSpecFrontmatter } from './game-page-routes.js';
import type { CatalogGameEntry, GitHubClient } from './github-client.js';
import { InMemoryStore, type Scorecard } from './store.js';

const sessionSecret = 'dev-session-secret-change-me';

const SPEC = [
  '---',
  'title: Neon Courier',
  'genre: arcade',
  'controls: arrows',
  '---',
  '',
  '# Neon Courier',
  '',
  'Deliver packages before the last neon goes out.',
].join('\n');

const GAME_JSON = JSON.stringify({
  engine: { modules: ['gameplay', 'collision', 'gfx', 'input'] },
});

function manifest(overrides: Partial<VersionManifest> & { version: string }): VersionManifest {
  return {
    slug: 'neon-courier',
    createdAt: '2026-08-01T12:00:00.000Z',
    issueNumber: 42,
    sourceFiles: ['SPEC.md', 'GAME.json', 'game.ts'],
    ...overrides,
  };
}

function scorecard(slug: string): Scorecard {
  return {
    slug,
    computedAt: '2026-08-04T00:00:00.000Z',
    window: { days: ['2026-08-01', '2026-08-02', '2026-08-03'], truncated: false },
    sessions: { count: 4812, bounces: 12, closes: 480, medianPlaySeconds: 360, totalPlaySeconds: 100000 },
    health: { errors: 0, aliveTicks: 10, stalledTicks: 0, stallRate: 0, medianFps: 60, resumeTicksIgnored: 0 },
    depth: {
      outcomes: { won: 1, lost: 2, quit: 3 },
      sessionsWithEnding: 3,
      finishRate: null,
      winRate: null,
      medianBestScore: null,
    },
    votes: { up: 128, down: 3 },
    feedback: { count: 7 },
    untrusted: { errorSamples: [], progressLabels: [] },
  };
}

function storeGamesStore(overrides: Partial<GamesStore> = {}): GamesStore {
  const sources: Record<string, string> = {
    'SPEC.md': SPEC,
    'GAME.json': GAME_JSON,
    'game.ts': 'x'.repeat(1000),
  };
  return {
    getSourceFile: async (_slug: string, _version: string, path: string) => sources[path] ?? null,
    getManifest: async (_slug: string, version: string) => manifest({ version }),
    getDerivedArtifact: async () => null,
    listVersions: async () => [
      manifest({
        version: 'v3',
        createdAt: '2026-08-03T12:00:00.000Z',
        gate: { green: true, ranAt: '2026-08-03T12:05:00.000Z' },
      }),
      manifest({ version: 'v2', createdAt: '2026-08-02T12:00:00.000Z', deliveryMode: 'preview' }),
      manifest({
        version: 'v1',
        createdAt: '2026-08-01T12:00:00.000Z',
        origin: 'editor',
        gate: { green: false, ranAt: '2026-08-01T12:05:00.000Z' },
      }),
    ],
    ...overrides,
  } as unknown as GamesStore;
}

async function publishStoreGame(store: InMemoryStore, slug = 'neon-courier'): Promise<void> {
  await store.upsertUser({ uid: 'g:creator', name: 'Secret Google' });
  await store.claimHandle('g:creator', 'nightshift', '2026-07-01T00:00:00.000Z');
  await store.createSubmission(42, 'g:creator', 'Neon Courier');
  await store.setSubmissionSlug(42, slug);
  await store.setSubmissionPublishedAt(42, '2026-08-01T12:00:00.000Z');
  await store.setPublication({
    slug,
    state: 'published',
    currentVersion: 'v3',
    publishedAt: '2026-08-01T12:00:00.000Z',
  });
}

describe('game page routes', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function appWith(
    store: InMemoryStore,
    gamesStore?: GamesStore,
    opts?: { repoCatalog?: CatalogGameEntry[]; gameFiles?: Record<string, string>; betaAllowedUids?: string },
  ) {
    const app = await buildApp({
      store,
      sessionSecret,
      betaAllowedUids: opts?.betaAllowedUids,
      // Fresh cache per app: tests publish, then read, within one tick.
      gamePageRoutes: { cacheTtlMs: 0 },
      submissionRoutes:
        gamesStore || opts?.repoCatalog
          ? {
              agentChannel: { gamesStore },
              ...(opts?.repoCatalog
                ? {
                    githubToken: 'test-github-token',
                    submissionTokenSecret: 'test-submission-secret',
                    snapshotReader: null,
                    githubClient: {
                      getCatalog: async () => opts.repoCatalog,
                      getGameFile: async (_ref: string, _slug: string, path: string) => opts.gameFiles?.[path] ?? null,
                    } as unknown as GitHubClient,
                  }
                : {}),
            }
          : undefined,
    });
    apps.push(app);
    return app;
  }

  it('serves the aggregate page for a store-published game', async () => {
    const store = new InMemoryStore();
    await publishStoreGame(store);
    await store.putScorecard('neon-courier', scorecard('neon-courier'));
    const app = await appWith(store, storeGamesStore());

    const response = await app.inject({ method: 'GET', url: '/api/games/neon-courier/page' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.entry).toMatchObject({
      slug: 'neon-courier',
      title: 'Neon Courier',
      status: 'published',
      submittedBy: 'nightshift',
      creatorHandle: 'nightshift',
    });
    expect(body.creator).toMatchObject({ handle: 'nightshift' });
    // A game with a real creator is never platform-authored.
    expect(body.platformAuthored).toBe(false);
    // Frontmatter is catalog data, not README content.
    expect(body.specMarkdown).toContain('# Neon Courier');
    expect(body.specMarkdown).not.toContain('title:');
    // Canonical GameKit order, regardless of GAME.json order.
    expect(body.modules).toEqual(['input', 'collision', 'gameplay', 'gfx']);
    expect(body.budget.usedBytes).toBe(Buffer.byteLength(SPEC) + Buffer.byteLength(GAME_JSON) + 1000);
    expect(body.budget.limitBytes).toBe(252 * 1024);
    // Preview deliveries are not releases; current is flagged; provenance carried.
    expect(body.releases).toEqual([
      { version: 'v3', createdAt: '2026-08-03T12:00:00.000Z', current: true, gateGreen: true },
      {
        version: 'v1',
        createdAt: '2026-08-01T12:00:00.000Z',
        current: false,
        gateGreen: false,
        origin: 'editor',
      },
    ]);
    expect(body.stats).toEqual({ plays: 4812, medianPlaySeconds: 360, windowDays: 3 });
    // The Google account name must never appear on a public page.
    expect(JSON.stringify(body)).not.toContain('Secret Google');
  });

  it('serves a repo-committed game from the published ref with no store history', async () => {
    const store = new InMemoryStore();
    const repoEntry: CatalogGameEntry = {
      slug: 'sky-dodge',
      title: 'Sky Dodge',
      genre: 'arcade',
      controls: '',
      status: 'published',
      media: null,
      multiplayer: null,
      saves: null,
      world: null,
      sensing: null,
      orientation: 'any',
      submittedBy: 'gamedev-platform',
    };
    const app = await appWith(store, undefined, {
      repoCatalog: [repoEntry],
      gameFiles: { 'SPEC.md': SPEC, 'GAME.json': GAME_JSON },
    });

    const response = await app.inject({ method: 'GET', url: '/api/games/sky-dodge/page' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.entry).toMatchObject({ slug: 'sky-dodge', title: 'Sky Dodge', submittedBy: 'gamedev-platform' });
    expect(body.creator).toBeNull();
    // No creator to name, so it lives in the platform's namespace rather than having
    // no address at all — most of the catalog predates creator profiles.
    expect(body.entry.creatorHandle).toBe('gamedevpl');
    expect(body.platformAuthored).toBe(true);
    expect(body.specMarkdown).toContain('Deliver packages');
    expect(body.modules).toEqual(['input', 'collision', 'gameplay', 'gfx']);
    expect(body.budget).toBeNull();
    expect(body.releases).toEqual([]);
  });

  it('404s for unknown and archived games', async () => {
    const store = new InMemoryStore();
    await store.setPublication({
      slug: 'gone-game',
      state: 'archived',
      currentVersion: 'v1',
      publishedAt: '2026-08-01T12:00:00.000Z',
    });
    const app = await appWith(store, storeGamesStore());

    expect((await app.inject({ method: 'GET', url: '/api/games/never-was/page' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/games/gone-game/page' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/games/Not%20A%20Slug/page' })).statusCode).toBe(400);
  });

  it('stays reachable through the private-beta wall while play stays behind it', async () => {
    const store = new InMemoryStore();
    await publishStoreGame(store);
    const app = await appWith(store, storeGamesStore(), { betaAllowedUids: 'g:creator' });

    const page = await app.inject({ method: 'GET', url: '/api/games/neon-courier/page' });
    expect(page.statusCode).toBe(200);

    const play = await app.inject({ method: 'GET', url: '/api/games/neon-courier' });
    expect(play.statusCode).toBe(401);
  });

  it('degrades when the games store fake has no listVersions and no scorecard exists', async () => {
    const store = new InMemoryStore();
    await publishStoreGame(store);
    const app = await appWith(store, storeGamesStore({ listVersions: undefined }));

    const response = await app.inject({ method: 'GET', url: '/api/games/neon-courier/page' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.releases).toEqual([]);
    expect(body.stats).toBeNull();
  });

  it('deattributes games whose owner deleted their account', async () => {
    const store = new InMemoryStore();
    await publishStoreGame(store);
    await store.deleteAccountIdentity('g:creator', '2026-08-05T00:00:00.000Z');
    const app = await appWith(store, storeGamesStore());

    const response = await app.inject({ method: 'GET', url: '/api/games/neon-courier/page' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.entry.submittedBy).toBe('gamedev-platform');
    // An erased owner leaves the game with nobody to name — it becomes platform-
    // authored rather than losing its page.
    expect(body.entry.creatorHandle).toBe('gamedevpl');
    expect(body.platformAuthored).toBe(true);
    expect(body.creator).toBeNull();
  });
});

describe('game page helpers', () => {
  it('stripSpecFrontmatter removes only the leading block', () => {
    expect(stripSpecFrontmatter(SPEC)).toBe('# Neon Courier\n\nDeliver packages before the last neon goes out.');
    expect(stripSpecFrontmatter('no frontmatter here')).toBe('no frontmatter here');
    // A later `---` is a horizontal rule, not frontmatter.
    expect(stripSpecFrontmatter('intro\n\n---\n\nrest')).toBe('intro\n\n---\n\nrest');
  });

  it('readGameModules tolerates bad manifests and normalises order', () => {
    expect(readGameModules(null)).toBeNull();
    expect(readGameModules('not json')).toBeNull();
    expect(readGameModules('{}')).toBeNull();
    expect(readGameModules(JSON.stringify({ engine: { modules: ['gfx', 'nonsense', 'input'] } }))).toEqual([
      'input',
      'gfx',
    ]);
  });
});
