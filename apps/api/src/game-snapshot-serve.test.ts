import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import type { GameSnapshotReader, SnapshotGame } from './game-snapshot.js';
import type { CatalogGameEntry, GameSources, GitHubClient } from './github-client.js';
import { InMemoryStore } from './store.js';
import { NoopTranslator } from './translate.js';

/**
 * The serve half of the snapshot: published games are read from the bucket, and
 * every way that can fail falls back to the GitHub path the site used before.
 */

const sessionSecret = 'dev-session-secret-change-me';
const repo = 'gamedevpl/www.gamedev.pl-games';

function catalogEntry(slug: string, overrides: Partial<CatalogGameEntry> = {}): CatalogGameEntry {
  return {
    slug,
    title: slug,
    genre: 'arcade',
    controls: 'arrows',
    status: 'published',
    media: null,
    multiplayer: null,
    ...overrides,
  };
}

function gameSources(): GameSources {
  return {
    indexHtml: '<canvas id="game"></canvas>',
    gameJs: 'console.log("from github")',
    styleCss: 'body{margin:0}',
    title: 'From GitHub',
  };
}

function createGithubStub(catalog: CatalogGameEntry[]) {
  const getCatalog = vi.fn(async () => catalog);
  const getGameSources = vi.fn(async () => gameSources());
  const getGameMedia = vi.fn(async () => new Uint8Array([0x67, 0x69, 0x74]));
  const githubClient = {
    createIssue: vi.fn(async () => ({ number: 1 })),
    getIssueState: vi.fn(async () => ({ state: 'open' as const })),
    findLinkedPR: vi.fn(async () => null),
    createIssueComment: vi.fn(async () => ({ id: 1 })),
    updateIssueBody: vi.fn(async () => {}),
    closeIssue: vi.fn(async () => {}),
    closePullRequest: vi.fn(async () => {}),
    getGameSources,
    getGameMedia,
    getCatalog,
    getProgressNotes: vi.fn(async () => null),
  } as unknown as GitHubClient;
  return { githubClient, getCatalog, getGameSources, getGameMedia };
}

function createSnapshotStub(params: {
  catalog?: CatalogGameEntry[] | null;
  games?: Record<string, SnapshotGame>;
  media?: Record<string, Buffer>;
  failWith?: Error;
}) {
  const fail = <T>(): Promise<T> => Promise.reject(params.failWith);
  const getCatalog = vi.fn(async () =>
    params.failWith ? fail<CatalogGameEntry[] | null>() : (params.catalog ?? null),
  );
  const getGame = vi.fn(async (slug: string) =>
    params.failWith ? fail<SnapshotGame | null>() : (params.games?.[slug] ?? null),
  );
  const getMedia = vi.fn(async (slug: string, filename: string) => {
    if (params.failWith) return fail<{ body: Buffer; contentType: string } | null>();
    const body = params.media?.[`${slug}/${filename}`];
    return body ? { body, contentType: 'image/png' } : null;
  });
  const reader: GameSnapshotReader = {
    getPointer: vi.fn(async () => null),
    getCatalog,
    getGame,
    getMedia,
  };
  return { reader, getCatalog, getGame, getMedia };
}

async function createApp(params: {
  githubClient: GitHubClient;
  snapshotReader?: GameSnapshotReader | null;
}): Promise<FastifyInstance> {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:test-user' });
  return buildApp({
    store,
    sessionSecret,
    submissionRoutes: {
      githubToken: 'token',
      submissionTokenSecret: 'submission-secret',
      gamesRepo: repo,
      githubClient: params.githubClient,
      snapshotReader: params.snapshotReader ?? null,
      translator: new NoopTranslator(),
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('playing a published game', () => {
  it('serves the baked document without touching GitHub', async () => {
    const { githubClient, getGameSources } = createGithubStub([catalogEntry('bubble-pop')]);
    const snapshot = createSnapshotStub({
      catalog: [catalogEntry('bubble-pop')],
      games: { 'bubble-pop': { slug: 'bubble-pop', title: 'Bubble Pop', html: '<!doctype html><p>baked</p>' } },
    });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/games/bubble-pop' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ slug: 'bubble-pop', title: 'Bubble Pop', html: '<!doctype html><p>baked</p>' });
    // The point of the whole change: no source fan-out, no esbuild bundle.
    expect(getGameSources).not.toHaveBeenCalled();
    await app.close();
  });

  it('falls back to GitHub for a game that is not in the snapshot', async () => {
    const { githubClient, getGameSources } = createGithubStub([catalogEntry('bubble-pop')]);
    const snapshot = createSnapshotStub({ catalog: [catalogEntry('bubble-pop')], games: {} });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/games/bubble-pop' });

    expect(response.statusCode).toBe(200);
    expect(response.json().html).toContain('from github');
    expect(getGameSources).toHaveBeenCalledWith('main', 'bubble-pop');
    await app.close();
  });

  it('falls back to GitHub when the snapshot bucket is unreachable', async () => {
    const { githubClient, getGameSources } = createGithubStub([catalogEntry('bubble-pop')]);
    const snapshot = createSnapshotStub({ failWith: new Error('storage 503') });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/games/bubble-pop' });

    // A Storage outage must degrade to the old behaviour, not to a broken site.
    expect(response.statusCode).toBe(200);
    expect(response.json().html).toContain('from github');
    expect(getGameSources).toHaveBeenCalled();
    await app.close();
  });

  it('still refuses a slug the catalog does not publish', async () => {
    const { githubClient } = createGithubStub([]);
    const snapshot = createSnapshotStub({
      catalog: [],
      games: { sneaky: { slug: 'sneaky', title: 'Sneaky', html: '<!doctype html>' } },
    });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/games/sneaky' });

    // Publication is decided by the catalog, not by what happens to sit in the
    // bucket — a stale object must never resurrect an unpublished game.
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('reads a given game from the snapshot once, then from the in-process cache', async () => {
    const { githubClient } = createGithubStub([catalogEntry('bubble-pop')]);
    const snapshot = createSnapshotStub({
      catalog: [catalogEntry('bubble-pop')],
      games: { 'bubble-pop': { slug: 'bubble-pop', title: 'Bubble Pop', html: '<!doctype html>' } },
    });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    await app.inject({ method: 'GET', url: '/api/games/bubble-pop' });
    await app.inject({ method: 'GET', url: '/api/games/bubble-pop' });

    expect(snapshot.getGame).toHaveBeenCalledTimes(1);
    await app.close();
  });
});

describe('the catalog', () => {
  it('comes from the snapshot when one is published', async () => {
    const { githubClient, getCatalog } = createGithubStub([catalogEntry('from-github')]);
    const snapshot = createSnapshotStub({ catalog: [catalogEntry('from-snapshot')] });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/catalog' });

    expect(response.json().map((entry: CatalogGameEntry) => entry.slug)).toEqual(['from-snapshot']);
    expect(getCatalog).not.toHaveBeenCalled();
    await app.close();
  });

  it('falls back to GitHub before any snapshot has been published', async () => {
    const { githubClient, getCatalog } = createGithubStub([catalogEntry('from-github')]);
    const snapshot = createSnapshotStub({ catalog: null });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/catalog' });

    expect(response.json().map((entry: CatalogGameEntry) => entry.slug)).toEqual(['from-github']);
    expect(getCatalog).toHaveBeenCalled();
    await app.close();
  });

  it('falls back to GitHub when the snapshot read fails', async () => {
    const { githubClient, getCatalog } = createGithubStub([catalogEntry('from-github')]);
    const snapshot = createSnapshotStub({ failWith: new Error('storage 503') });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/catalog' });

    expect(response.statusCode).toBe(200);
    expect(getCatalog).toHaveBeenCalled();
    await app.close();
  });

  it('still hides entries the snapshot lists as not published', async () => {
    const { githubClient } = createGithubStub([]);
    const snapshot = createSnapshotStub({
      catalog: [catalogEntry('live'), catalogEntry('archived-game', { status: 'archived' })],
    });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/catalog' });

    expect(response.json().map((entry: CatalogGameEntry) => entry.slug)).toEqual(['live']);
    await app.close();
  });
});

describe('gallery media', () => {
  const withMedia = catalogEntry('bubble-pop', {
    media: { screenshots: [{ name: 'opening', file: 'opening.png' }], video: null },
  });

  it('is served from the snapshot when it is baked', async () => {
    const { githubClient, getGameMedia } = createGithubStub([withMedia]);
    const snapshot = createSnapshotStub({
      catalog: [withMedia],
      media: { 'bubble-pop/opening.png': Buffer.from('baked-bytes') },
    });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/games/bubble-pop/media/opening.png' });

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.toString()).toBe('baked-bytes');
    expect(getGameMedia).not.toHaveBeenCalled();
    await app.close();
  });

  it('falls back to GitHub when the file is not in the snapshot', async () => {
    const { githubClient, getGameMedia } = createGithubStub([withMedia]);
    const snapshot = createSnapshotStub({ catalog: [withMedia], media: {} });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/games/bubble-pop/media/opening.png' });

    expect(response.statusCode).toBe(200);
    expect(getGameMedia).toHaveBeenCalledWith('main', 'bubble-pop', 'opening.png');
    await app.close();
  });

  it('still rejects a filename the catalog does not vouch for', async () => {
    const { githubClient } = createGithubStub([withMedia]);
    const snapshot = createSnapshotStub({
      catalog: [withMedia],
      media: { 'bubble-pop/secret.png': Buffer.from('should-not-be-served') },
    });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/games/bubble-pop/media/secret.png' });

    // The catalog allowlist runs before the snapshot is consulted, so a stray
    // object in the bucket cannot widen what the API will serve.
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe('with no snapshot configured', () => {
  it('serves games and catalog entirely from GitHub', async () => {
    const { githubClient, getCatalog, getGameSources } = createGithubStub([catalogEntry('bubble-pop')]);
    const app = await createApp({ githubClient, snapshotReader: null });

    const catalog = await app.inject({ method: 'GET', url: '/api/catalog' });
    const game = await app.inject({ method: 'GET', url: '/api/games/bubble-pop' });

    expect(catalog.statusCode).toBe(200);
    expect(game.statusCode).toBe(200);
    expect(getCatalog).toHaveBeenCalled();
    expect(getGameSources).toHaveBeenCalled();
    await app.close();
  });
});
