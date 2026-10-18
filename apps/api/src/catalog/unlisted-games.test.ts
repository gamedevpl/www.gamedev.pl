import { isListedEntry, isPublishedEntry } from '@gamedevpl/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';
import { createCatalogGenreSource } from './catalog-genre-source.js';
import { catalogEntryFromSpec, type CatalogGameEntry, type GitHubClient } from './github-client.js';
import { withSnapshot } from './local-snapshot-reader.js';
import type { GamesStore } from '../delivery/games-store.js';

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

  async function makeApp(options: { privateBeta?: boolean; store?: InMemoryStore; gamesStore?: GamesStore } = {}) {
    const store = options.store ?? new InMemoryStore();
    await store.upsertUser({ uid: 'g:owner' });
    const app = await buildApp({
      store,
      sessionSecret: secret,
      ...(options.privateBeta ? { betaAllowedUids: 'g:owner' } : {}),
      submissionRoutes: {
        githubToken: 'token',
        submissionTokenSecret: 'test-submission-secret',
        ...(options.gamesStore ? { agentChannel: { gamesStore: options.gamesStore } } : {}),
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

  it('resolves a store-lane unlisted link by its own slug, never scanning publications', async () => {
    const store = new InMemoryStore();
    await store.setPublication({
      slug: 'store-hidden',
      state: 'published',
      currentVersion: 'v1',
      publishedAt: '2026-08-01T12:00:00.000Z',
    });
    const reads: string[] = [];
    const gamesStore = {
      getSourceFile: async (slug: string) => {
        reads.push(slug);
        return '---\ntitle: Store Hidden\ngenre: arcade\nlisted: false\n---\n';
      },
      getDerivedArtifact: async () => null,
    } as unknown as GamesStore;
    const scans = vi.spyOn(store, 'listPublications');
    const app = await makeApp({ privateBeta: true, store, gamesStore });

    const hidden = await app.inject({ method: 'GET', url: '/api/games/store-hidden/votes' });
    expect(hidden.statusCode).not.toBe(401);
    const unknown = await app.inject({ method: 'GET', url: '/api/games/no-such-game/votes' });
    expect(unknown.statusCode).toBe(401);
    expect(scans).not.toHaveBeenCalled();
    expect(reads).toEqual(['store-hidden']);
  });

  it('keeps a store game off the public profile when its SPEC cannot be read', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    await store.claimHandle('g:creator', 'ada', '2026-07-01T00:00:00.000Z');
    await store.createSubmission(42, 'g:creator', 'Lost Spec');
    await store.setSubmissionSlug(42, 'lost-spec');
    await store.setSubmissionPublishedAt(42, '2026-08-01T12:00:00.000Z');
    await store.setPublication({
      slug: 'lost-spec',
      state: 'published',
      currentVersion: 'v1',
      publishedAt: '2026-08-01T12:00:00.000Z',
    });
    const gamesStore = {
      getSourceFile: async () => null,
      getDerivedArtifact: async () => null,
    } as unknown as GamesStore;
    const app = await makeApp({ store, gamesStore });

    const page = await app.inject({ method: 'GET', url: '/api/creators/ada' });
    expect(page.statusCode).toBe(200);
    expect(page.json().games).toEqual([]);
  });
});
