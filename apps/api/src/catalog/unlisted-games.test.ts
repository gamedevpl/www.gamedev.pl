import { isListedEntry, isPublishedEntry } from '@gamedevpl/contract';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';
import { createCatalogGenreSource } from './catalog-genre-source.js';
import { catalogEntryFromSpec, type CatalogGameEntry, type GitHubClient } from './github-client.js';
import { withSnapshot } from './local-snapshot-reader.js';

const secret = 'dev-session-secret-change-me';

const spec = (extra: string) => `---\ntitle: Hidden Gem\ngenre: Puzzle\ncontrols: mouse\n${extra}---\n\nBody.\n`;

function entry(slug: string, extra: Partial<CatalogGameEntry> = {}): CatalogGameEntry {
  return {
    slug,
    title: slug,
    genre: 'Arcade',
    controls: '',
    status: 'published',
    media: null,
    multiplayer: null,
    saves: null,
    world: null,
    sensing: null,
    editor: null,
    orientation: 'any',
    submittedBy: null,
    ...extra,
  };
}

const CATALOG = [entry('listed-game'), entry('unlisted-game', { listed: false })];

describe('SPEC listed: false', () => {
  it('marks the catalog entry unlisted and leaves it published', () => {
    const parsed = catalogEntryFromSpec('hidden-gem', spec('listed: false\n'), () => null);
    expect(parsed).toMatchObject({ slug: 'hidden-gem', status: 'published', listed: false });
    expect(isPublishedEntry(parsed)).toBe(true);
    expect(isListedEntry(parsed)).toBe(false);
  });

  it('lists a game with no key or any other value', () => {
    for (const extra of ['', 'listed: true\n', 'listed: yes\n']) {
      const parsed = catalogEntryFromSpec('hidden-gem', spec(extra), () => null);
      expect(parsed).not.toHaveProperty('listed');
      expect(isListedEntry(parsed)).toBe(true);
    }
  });

  it('never lists an archived game, unlisted or not', () => {
    expect(isListedEntry({ status: 'archived' })).toBe(false);
  });

  it('keeps unlisted games out of the recommender pool', async () => {
    const source = createCatalogGenreSource({ client: { getCatalog: async () => CATALOG }, now: () => 0 });
    await expect(source.listPublished()).resolves.toEqual([{ slug: 'listed-game', genre: 'Arcade' }]);
  });
});

describe('unlisted games on the API', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function makeApp(options: { privateBeta?: boolean } = {}) {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:owner' });
    const app = await buildApp({
      store,
      sessionSecret: secret,
      ...(options.privateBeta ? { betaAllowedUids: 'g:owner' } : {}),
      submissionRoutes: {
        githubToken: 'token',
        submissionTokenSecret: 'test-submission-secret',
        ...withSnapshot({ getCatalog: async () => CATALOG } as unknown as GitHubClient),
      },
    });
    apps.push(app);
    return app;
  }

  it('leaves an unlisted game out of /api/catalog for a signed-in player', async () => {
    const app = await makeApp({ privateBeta: true });
    const cookie = `${SESSION_COOKIE_NAME}=${mintSessionToken('g:owner', secret)}`;
    const res = await app.inject({ method: 'GET', url: '/api/catalog', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect((res.json() as CatalogGameEntry[]).map((game) => game.slug)).toEqual(['listed-game']);
  });

  it('opens an unlisted game past the closed-beta wall by its link, without naming it', async () => {
    const app = await makeApp({ privateBeta: true });

    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.json()).toMatchObject({ privateBeta: true, publicPlaySlugs: [] });

    // Any non-401 means the wall let the link through.
    const unlisted = await app.inject({ method: 'GET', url: '/api/games/unlisted-game' });
    expect(unlisted.statusCode).not.toBe(401);
    const listed = await app.inject({ method: 'GET', url: '/api/games/listed-game' });
    expect(listed.statusCode).toBe(401);
    const catalog = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(catalog.statusCode).toBe(401);
  });

  it('accepts anonymous play telemetry for an unlisted game in closed beta', async () => {
    const app = await makeApp({ privateBeta: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/telemetry',
      payload: {
        slug: 'unlisted-game',
        sessionId: '00000000-0000-4000-8000-000000000001',
        events: [{ type: 'game_opened' }],
      },
    });
    expect(res.statusCode).not.toBe(401);
  });
});
