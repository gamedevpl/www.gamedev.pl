import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { GamesStore } from '../delivery/games-store.js';
import { extractSpecDescription } from './game-page-routes.js';
import type { CatalogGameEntry, GitHubClient } from './github-client.js';
import { InMemoryStore } from '../store.js';

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

function storeGamesStore(overrides: Partial<GamesStore> = {}): GamesStore {
  return {
    getSourceFile: async (_slug: string, _version: string, path: string) => (path === 'SPEC.md' ? SPEC : null),
    getDerivedArtifact: async () => null,
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
    expect(body.description).toBe('Deliver packages before the last neon goes out.');
    expect(body).not.toHaveProperty('specMarkdown');
    expect(body).not.toHaveProperty('modules');
    expect(body).not.toHaveProperty('budget');
    expect(body).not.toHaveProperty('releases');
    expect(body).not.toHaveProperty('stats');
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
      gameFiles: { 'SPEC.md': SPEC },
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
    expect(body.description).toBe('Deliver packages before the last neon goes out.');
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

  it('keeps both the game page and play behind the private-beta wall', async () => {
    const store = new InMemoryStore();
    await publishStoreGame(store);
    const app = await appWith(store, storeGamesStore(), { betaAllowedUids: 'g:creator' });

    const page = await app.inject({ method: 'GET', url: '/api/games/neon-courier/page' });
    expect(page.statusCode).toBe(401);

    const play = await app.inject({ method: 'GET', url: '/api/games/neon-courier' });
    expect(play.statusCode).toBe(401);
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
  it('extracts only the first prose paragraph from SPEC.md', () => {
    expect(extractSpecDescription(SPEC)).toBe('Deliver packages before the last neon goes out.');
    expect(extractSpecDescription('# Title\n\n- first\n- second\n\nA wrapped\ndescription.\n\nMore.')).toBe(
      'A wrapped description.',
    );
    expect(extractSpecDescription('# Title\n\n```ts\nconst hidden = true;\n```')).toBeNull();
    expect(extractSpecDescription(null)).toBeNull();
  });
});
