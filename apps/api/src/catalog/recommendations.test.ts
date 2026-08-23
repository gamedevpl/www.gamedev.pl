import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../auth.js';
import type { PublishedSlugGate } from './published-slugs.js';
import type { CatalogGenreSource } from './recommendations.js';
import { InMemoryStore, type Scorecard } from '../store.js';

const sessionSecret = 'dev-session-secret-change-me';

function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

function slugGate(published: string[]): PublishedSlugGate {
  const slugs = new Set(published);
  return { isPublished: async (slug: string) => slugs.has(slug) };
}

function catalogOf(games: Array<{ slug: string; genre: string }>): CatalogGenreSource {
  return { listPublished: async () => games };
}

function scorecard(partial: Partial<Scorecard> & { slug: string }): Scorecard {
  return {
    computedAt: '2026-07-27T03:00:00.000Z',
    window: { days: ['2026-07-27'], truncated: false },
    sessions: { count: 0, bounces: 0, closes: 0, medianPlaySeconds: 0, totalPlaySeconds: 0 },
    health: { errors: 0, aliveTicks: 0, stalledTicks: 0, stallRate: 0, medianFps: null, resumeTicksIgnored: 0 },
    depth: {
      outcomes: { won: 0, lost: 0, quit: 0 },
      sessionsWithEnding: 0,
      finishRate: null,
      winRate: 0,
      medianBestScore: null,
    },
    votes: { up: 0, down: 0 },
    feedback: { count: 0 },
    untrusted: { errorSamples: [], progressLabels: [], feedbackThemes: [] },
    ...partial,
  } as Scorecard;
}

const games = [
  { slug: 'puzzle-one', genre: 'Puzzle' },
  { slug: 'puzzle-two', genre: 'Puzzle' },
  { slug: 'arcade-hit', genre: 'Arcade' },
];

describe('recommendation routes', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:alice' });
    await store.upsertUser({ uid: 'bot:agent' });
  });

  async function app() {
    return buildApp({
      store,
      sessionSecret,
      recommendationRoutes: {
        publishedSlugs: slugGate(games.map((g) => g.slug)),
        catalog: catalogOf(games),
      },
    });
  }

  it('records play affinity for signed-in humans and ignores bots and anonymous', async () => {
    const server = await app();

    const anon = await server.inject({ method: 'POST', url: '/api/games/puzzle-one/played' });
    expect(anon.statusCode).toBe(204);
    expect(await store.listPlayAffinity('g:alice')).toEqual([]);

    const bot = await server.inject({
      method: 'POST',
      url: '/api/games/puzzle-one/played',
      headers: authHeaders('bot:agent'),
    });
    expect(bot.statusCode).toBe(204);
    expect(await store.listPlayAffinity('bot:agent')).toEqual([]);

    const human = await server.inject({
      method: 'POST',
      url: '/api/games/puzzle-one/played',
      headers: authHeaders('g:alice'),
    });
    expect(human.statusCode).toBe(204);
    const affinity = await store.listPlayAffinity('g:alice');
    expect(affinity).toHaveLength(1);
    expect(affinity[0]?.slug).toBe('puzzle-one');
    expect(affinity[0]?.openCount).toBe(1);

    await server.inject({
      method: 'POST',
      url: '/api/games/puzzle-one/played',
      headers: authHeaders('g:alice'),
    });
    expect((await store.listPlayAffinity('g:alice'))[0]?.openCount).toBe(2);

    await server.close();
  });

  it('answers 404 when recording play for an unpublished slug', async () => {
    const server = await app();
    const res = await server.inject({
      method: 'POST',
      url: '/api/games/draft-only/played',
      headers: authHeaders('g:alice'),
    });
    expect(res.statusCode).toBe(404);
    await server.close();
  });

  it('records play for a store-published slug with no repo-catalog entry', async () => {
    // No publishedSlugs override: exercises the combined gate wired in app.ts.
    await store.setPublication({
      slug: 'miniature-warfare-2d',
      state: 'published',
      currentVersion: 'v1',
      publishedAt: '2026-07-01T00:00:00.000Z',
    });
    const server = await buildApp({ store, sessionSecret });

    const res = await server.inject({
      method: 'POST',
      url: '/api/games/miniature-warfare-2d/played',
      headers: authHeaders('g:alice'),
    });
    expect(res.statusCode).toBe(204);
    expect((await store.listPlayAffinity('g:alice'))[0]?.slug).toBe('miniature-warfare-2d');
    await server.close();
  });

  it('returns community recommendations without a session', async () => {
    await store.putScorecard(
      'arcade-hit',
      scorecard({
        slug: 'arcade-hit',
        sessions: { count: 40, bounces: 0, closes: 0, medianPlaySeconds: 30, totalPlaySeconds: 1200 },
        votes: { up: 5, down: 0 },
      }),
    );
    await store.putScorecard(
      'puzzle-one',
      scorecard({
        slug: 'puzzle-one',
        sessions: { count: 3, bounces: 0, closes: 0, medianPlaySeconds: 10, totalPlaySeconds: 30 },
      }),
    );

    const server = await app();
    const res = await server.inject({ method: 'GET', url: '/api/recommendations' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{ slug: string; reason: string }>;
      popularity: Array<{ slug: string; sessions: number }>;
      newest: string[];
      lastPlayed: Array<{ slug: string; lastPlayedAt: string }>;
    };
    expect(body.items[0]).toEqual({ slug: 'arcade-hit', reason: 'popular' });
    expect(body.popularity[0]).toEqual({ slug: 'arcade-hit', sessions: 40 });
    expect(body.newest[0]).toBe('arcade-hit'); // reverse catalog when no publish dates
    expect(body.lastPlayed).toEqual([]);
    await server.close();
  });

  it('personalises for a signed-in player from affinity', async () => {
    await store.putScorecard(
      'arcade-hit',
      scorecard({
        slug: 'arcade-hit',
        sessions: { count: 50, bounces: 0, closes: 0, medianPlaySeconds: 20, totalPlaySeconds: 1000 },
      }),
    );
    await store.putScorecard(
      'puzzle-two',
      scorecard({
        slug: 'puzzle-two',
        sessions: { count: 4, bounces: 0, closes: 0, medianPlaySeconds: 40, totalPlaySeconds: 160 },
      }),
    );
    await store.recordPlayAffinity('g:alice', 'puzzle-one', new Date().toISOString());

    const server = await app();
    const res = await server.inject({
      method: 'GET',
      url: '/api/recommendations',
      headers: authHeaders('g:alice'),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{ slug: string; reason: string }>;
      lastPlayed: Array<{ slug: string; lastPlayedAt: string }>;
    };
    expect(body.items[0]).toEqual({ slug: 'puzzle-one', reason: 'continue' });
    expect(body.items.some((item) => item.slug === 'puzzle-two' && item.reason === 'for_you')).toBe(true);
    expect(body.lastPlayed.map((row) => row.slug)).toEqual(['puzzle-one']);
    await server.close();
  });

  it('accepts anonymous recent hints for genre boosting', async () => {
    await store.putScorecard(
      'arcade-hit',
      scorecard({
        slug: 'arcade-hit',
        sessions: { count: 30, bounces: 0, closes: 0, medianPlaySeconds: 10, totalPlaySeconds: 300 },
      }),
    );
    await store.putScorecard(
      'puzzle-two',
      scorecard({
        slug: 'puzzle-two',
        sessions: { count: 2, bounces: 0, closes: 0, medianPlaySeconds: 10, totalPlaySeconds: 20 },
      }),
    );

    const server = await app();
    const res = await server.inject({
      method: 'GET',
      url: '/api/recommendations?recent=puzzle-one,not-a-game',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ slug: string; reason: string }> };
    expect(body.items.some((item) => item.slug === 'puzzle-two' && item.reason === 'for_you')).toBe(true);
    await server.close();
  });

  it('caches shared community signals and still personalises per request', async () => {
    let scorecardReads = 0;
    let recentPublishedReads = 0;
    let clock = 1_000_000;

    const countingStore = new Proxy(store, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop === 'listScorecards') {
          return async (...args: Parameters<InMemoryStore['listScorecards']>) => {
            scorecardReads += 1;
            return target.listScorecards(...args);
          };
        }
        if (prop === 'listRecentlyPublished') {
          return async (...args: Parameters<InMemoryStore['listRecentlyPublished']>) => {
            recentPublishedReads += 1;
            return target.listRecentlyPublished(...args);
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    await store.putScorecard(
      'arcade-hit',
      scorecard({
        slug: 'arcade-hit',
        sessions: { count: 40, bounces: 0, closes: 0, medianPlaySeconds: 30, totalPlaySeconds: 1200 },
        votes: { up: 5, down: 0 },
      }),
    );
    await store.recordPlayAffinity('g:alice', 'puzzle-one', new Date().toISOString());

    const server = await buildApp({
      store: countingStore as InMemoryStore,
      sessionSecret,
      recommendationRoutes: {
        publishedSlugs: slugGate(games.map((g) => g.slug)),
        catalog: catalogOf(games),
        now: () => clock,
        sharedSignalsTtlMs: 60_000,
      },
    });

    const first = await server.inject({ method: 'GET', url: '/api/recommendations' });
    expect(first.statusCode).toBe(200);
    expect(scorecardReads).toBe(1);
    expect(recentPublishedReads).toBe(1);

    const second = await server.inject({ method: 'GET', url: '/api/recommendations' });
    expect(second.statusCode).toBe(200);
    expect(scorecardReads).toBe(1);
    expect(recentPublishedReads).toBe(1);
    expect(second.json()).toEqual(first.json());

    const personal = await server.inject({
      method: 'GET',
      url: '/api/recommendations',
      headers: authHeaders('g:alice'),
    });
    expect(personal.statusCode).toBe(200);
    // Affinity is per-request; community Firestore reads stay cached.
    expect(scorecardReads).toBe(1);
    expect(recentPublishedReads).toBe(1);
    const personalBody = personal.json() as { items: Array<{ slug: string; reason: string }> };
    expect(personalBody.items[0]).toEqual({ slug: 'puzzle-one', reason: 'continue' });

    clock += 60_000 + 1;
    const afterTtl = await server.inject({ method: 'GET', url: '/api/recommendations' });
    expect(afterTtl.statusCode).toBe(200);
    expect(scorecardReads).toBe(2);
    expect(recentPublishedReads).toBe(2);

    await server.close();
  });

  it('coalesces concurrent cold shared-signal refreshes into one store read', async () => {
    let scorecardReads = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const countingStore = new Proxy(store, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop === 'listScorecards') {
          return async (...args: Parameters<InMemoryStore['listScorecards']>) => {
            scorecardReads += 1;
            await gate;
            return target.listScorecards(...args);
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    await store.putScorecard(
      'arcade-hit',
      scorecard({
        slug: 'arcade-hit',
        sessions: { count: 10, bounces: 0, closes: 0, medianPlaySeconds: 10, totalPlaySeconds: 100 },
      }),
    );

    const server = await buildApp({
      store: countingStore as InMemoryStore,
      sessionSecret,
      recommendationRoutes: {
        publishedSlugs: slugGate(games.map((g) => g.slug)),
        catalog: catalogOf(games),
      },
    });

    const pending = Promise.all([
      server.inject({ method: 'GET', url: '/api/recommendations' }),
      server.inject({ method: 'GET', url: '/api/recommendations' }),
      server.inject({ method: 'GET', url: '/api/recommendations' }),
    ]);
    release();
    const responses = await pending;
    expect(responses.every((res) => res.statusCode === 200)).toBe(true);
    expect(scorecardReads).toBe(1);

    await server.close();
  });
});
