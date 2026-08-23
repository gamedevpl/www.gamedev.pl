import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import type { GameSnapshotReader, SnapshotGame } from './catalog/game-snapshot.js';
import type { CatalogGameEntry, GameSources, GitHubClient } from './catalog/github-client.js';
import { InMemoryStore } from './store.js';

/**
 * The serve half of the snapshot: when configured, published games are read
 * only from the bucket. Misses and Storage errors fail the request — they do
 * not assemble from GitHub. Unset snapshotReader keeps the GitHub / local path.
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
  const getMedia = vi.fn(async (slug: string, filename: string, width?: number) => {
    if (params.failWith) return fail<{ body: Buffer; contentType: string } | null>();
    const key = width === undefined ? `${slug}/${filename}` : `${slug}/w${width}/${filename}`;
    const body = params.media?.[key];
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
    expect(getGameSources).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 502 when the slug is published but the game object is missing', async () => {
    const { githubClient, getGameSources } = createGithubStub([catalogEntry('bubble-pop')]);
    const snapshot = createSnapshotStub({ catalog: [catalogEntry('bubble-pop')], games: {} });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/games/bubble-pop' });

    expect(response.statusCode).toBe(502);
    expect(response.json().error).toBe('game snapshot incomplete');
    expect(getGameSources).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 503 when the snapshot bucket is unreachable', async () => {
    const { githubClient, getGameSources, getCatalog } = createGithubStub([catalogEntry('bubble-pop')]);
    const snapshot = createSnapshotStub({ failWith: new Error('storage 503') });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/games/bubble-pop' });

    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe('game snapshot unavailable');
    expect(getCatalog).not.toHaveBeenCalled();
    expect(getGameSources).not.toHaveBeenCalled();
    await app.close();
  });

  it('still refuses a slug the catalog does not publish', async () => {
    const { githubClient, getGameSources } = createGithubStub([]);
    const snapshot = createSnapshotStub({
      catalog: [],
      games: { sneaky: { slug: 'sneaky', title: 'Sneaky', html: '<!doctype html>' } },
    });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/games/sneaky' });

    // Publication is decided by the catalog, not by what happens to sit in the
    // bucket — a stale object must never resurrect an unpublished game.
    expect(response.statusCode).toBe(404);
    expect(getGameSources).not.toHaveBeenCalled();
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

  it('returns 503 when no snapshot has been published yet', async () => {
    const { githubClient, getCatalog } = createGithubStub([catalogEntry('from-github')]);
    const snapshot = createSnapshotStub({ catalog: null });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/catalog' });

    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe('catalog snapshot unavailable');
    expect(getCatalog).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 503 when the snapshot read fails', async () => {
    const { githubClient, getCatalog } = createGithubStub([catalogEntry('from-github')]);
    const snapshot = createSnapshotStub({ failWith: new Error('storage 503') });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/catalog' });

    expect(response.statusCode).toBe(503);
    expect(getCatalog).not.toHaveBeenCalled();
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

  /**
   * Size variants. The arcade shows the same screenshot at ~48 CSS px in the moment
   * strip and a few hundred as a card poster; serving the original for both means
   * every near-fold poster (and each moment thumb after engage) pays for a full-size
   * decode.
   */
  it('serves the baked size variant when one is asked for', async () => {
    const { githubClient } = createGithubStub([withMedia]);
    const snapshot = createSnapshotStub({
      catalog: [withMedia],
      media: {
        'bubble-pop/opening.png': Buffer.from('full-size'),
        'bubble-pop/w96/opening.png': Buffer.from('thumb'),
      },
    });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/games/bubble-pop/media/opening.png?w=96' });

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.toString()).toBe('thumb');
    await app.close();
  });

  // Snapshots baked before variants existed have none, and a bake skips a variant it
  // could not produce. Either way the original is the right answer — a 404 here would
  // blank the strip on every game published before this shipped.
  it('falls back to the original when the variant was never baked', async () => {
    const { githubClient } = createGithubStub([withMedia]);
    const snapshot = createSnapshotStub({
      catalog: [withMedia],
      media: { 'bubble-pop/opening.png': Buffer.from('full-size') },
    });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/games/bubble-pop/media/opening.png?w=96' });

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.toString()).toBe('full-size');
    await app.close();
  });

  // An allowlist, not a number: an arbitrary `?w=` would be an invitation to fill the
  // media cache with one entry per width anybody felt like naming.
  it('ignores a width it does not bake and serves the original', async () => {
    const { githubClient } = createGithubStub([withMedia]);
    const snapshot = createSnapshotStub({
      catalog: [withMedia],
      media: {
        'bubble-pop/opening.png': Buffer.from('full-size'),
        'bubble-pop/w97/opening.png': Buffer.from('never-asked-for'),
      },
    });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    for (const query of ['?w=97', '?w=abc', '?w=-96', '?w=']) {
      const response = await app.inject({ method: 'GET', url: `/api/games/bubble-pop/media/opening.png${query}` });
      expect(response.statusCode, query).toBe(200);
      expect(response.rawPayload.toString(), query).toBe('full-size');
    }
    await app.close();
  });

  // The cache is keyed per variant, or the first width asked for would be handed to
  // every other one until the entry expired.
  it('does not serve one width from another width’s cache entry', async () => {
    const { githubClient } = createGithubStub([withMedia]);
    const snapshot = createSnapshotStub({
      catalog: [withMedia],
      media: {
        'bubble-pop/opening.png': Buffer.from('full-size'),
        'bubble-pop/w96/opening.png': Buffer.from('thumb'),
        'bubble-pop/w640/opening.png': Buffer.from('poster'),
      },
    });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const thumb = await app.inject({ method: 'GET', url: '/api/games/bubble-pop/media/opening.png?w=96' });
    const poster = await app.inject({ method: 'GET', url: '/api/games/bubble-pop/media/opening.png?w=640' });
    const full = await app.inject({ method: 'GET', url: '/api/games/bubble-pop/media/opening.png' });

    expect(thumb.rawPayload.toString()).toBe('thumb');
    expect(poster.rawPayload.toString()).toBe('poster');
    expect(full.rawPayload.toString()).toBe('full-size');
    await app.close();
  });

  // Variants are screenshots only. An MP4 with `?w=` must not attempt a variant read
  // or land in a separate cache key — that would multiply video entries for free.
  it('ignores ?w= on video and serves the original once', async () => {
    const withVideo = catalogEntry('bubble-pop', {
      media: { screenshots: [{ name: 'opening', file: 'opening.png' }], video: 'gameplay.mp4' },
    });
    const { githubClient } = createGithubStub([withVideo]);
    const snapshot = createSnapshotStub({
      catalog: [withVideo],
      media: { 'bubble-pop/gameplay.mp4': Buffer.from('video-bytes') },
    });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const withWidth = await app.inject({ method: 'GET', url: '/api/games/bubble-pop/media/gameplay.mp4?w=96' });
    const plain = await app.inject({ method: 'GET', url: '/api/games/bubble-pop/media/gameplay.mp4' });

    expect(withWidth.statusCode).toBe(200);
    expect(withWidth.rawPayload.toString()).toBe('video-bytes');
    expect(plain.rawPayload.toString()).toBe('video-bytes');
    // One read for the first request; the second hits the same `full` cache entry.
    expect(snapshot.getMedia).toHaveBeenCalledTimes(1);
    expect(snapshot.getMedia).toHaveBeenCalledWith('bubble-pop', 'gameplay.mp4');
    await app.close();
  });

  it('returns 404 when the file is allowlisted but missing from the snapshot', async () => {
    const { githubClient, getGameMedia } = createGithubStub([withMedia]);
    const snapshot = createSnapshotStub({ catalog: [withMedia], media: {} });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/games/bubble-pop/media/opening.png' });

    expect(response.statusCode).toBe(404);
    expect(getGameMedia).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 503 when the snapshot media read fails', async () => {
    const { githubClient, getGameMedia } = createGithubStub([withMedia]);
    // Catalog succeeds so the allowlist can run; only the media object read fails.
    const getCatalog = vi.fn(async () => [withMedia]);
    const getMedia = vi.fn(async () => {
      throw new Error('storage 503');
    });
    const reader: GameSnapshotReader = {
      getPointer: vi.fn(async () => null),
      getCatalog,
      getGame: vi.fn(async () => null),
      getMedia,
    };
    const app = await createApp({ githubClient, snapshotReader: reader });

    const response = await app.inject({ method: 'GET', url: '/api/games/bubble-pop/media/opening.png' });

    expect(response.statusCode).toBe(503);
    expect(getGameMedia).not.toHaveBeenCalled();
    await app.close();
  });

  it('still rejects a filename the catalog does not vouch for', async () => {
    const { githubClient, getGameMedia } = createGithubStub([withMedia]);
    const snapshot = createSnapshotStub({
      catalog: [withMedia],
      media: { 'bubble-pop/secret.png': Buffer.from('should-not-be-served') },
    });
    const app = await createApp({ githubClient, snapshotReader: snapshot.reader });

    const response = await app.inject({ method: 'GET', url: '/api/games/bubble-pop/media/secret.png' });

    // The catalog allowlist runs before the snapshot is consulted, so a stray
    // object in the bucket cannot widen what the API will serve.
    expect(response.statusCode).toBe(404);
    expect(getGameMedia).not.toHaveBeenCalled();
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
