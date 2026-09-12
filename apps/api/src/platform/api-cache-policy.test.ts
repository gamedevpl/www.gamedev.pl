import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_DEFAULT_CACHE_CONTROL, SHARED_READ_CACHE_CONTROL } from './api-cache-policy.js';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { InMemoryStore } from './store.js';
import { PUBLISHED_GAME_CACHE_CONTROL } from '../catalog/game-play-route.js';
import type { GitHubClient } from '../catalog/github-client.js';

const sessionSecret = 'dev-session-secret-change-me';
const uid = 'g:cache-policy';

// A published game the play route can answer with 200.
async function publishedGameApp(options: { betaAllowedUids?: string; publicPlaySlugs?: string }) {
  const store = new InMemoryStore();
  await store.upsertUser({ uid });
  const githubClient = {
    getCatalog: async () => [
      { slug: 'promo-game', title: 'Promo', genre: 'arcade', controls: 'arrows', status: 'published', media: null },
    ],
    getGameSources: async () => ({ indexHtml: '<canvas></canvas>', gameJs: 'x', styleCss: '', title: 'Promo' }),
  } as unknown as GitHubClient;
  return buildApp({
    store,
    sessionSecret,
    ...options,
    submissionRoutes: { githubToken: 'token', submissionTokenSecret: 's', githubClient, snapshotReader: null },
  });
}

function isPubliclyCacheable(header: string | undefined): boolean {
  if (!header) return true;
  const directives = header
    .toLowerCase()
    .split(',')
    .map((d) => d.trim());
  return !directives.includes('private') && !directives.includes('no-store');
}

describe('api cache policy', () => {
  let app: FastifyInstance;
  let cookie: string;

  beforeAll(async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid });
    app = await buildApp({ store, sessionSecret, betaAllowedUids: uid });
    cookie = `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('pins a per-user default on API responses that set nothing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/version' });
    expect(res.headers['cache-control']).toBe(API_DEFAULT_CACHE_CONTROL);
  });

  it('never lets a game document become publicly cacheable', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/games/some-slug', headers: { cookie } });
    expect(res.statusCode).not.toBe(401);
    expect(isPubliclyCacheable(res.headers['cache-control'] as string | undefined)).toBe(false);
  });

  it('shares a published game at the edge once the beta is open', async () => {
    const open = await publishedGameApp({});
    const res = await open.inject({ method: 'GET', url: '/api/games/promo-game' });
    await open.close();
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe(PUBLISHED_GAME_CACHE_CONTROL);
  });

  it('shares a promotional game during the beta, since the wall lets anyone play it', async () => {
    const walled = await publishedGameApp({ betaAllowedUids: uid, publicPlaySlugs: 'promo-game' });
    const res = await walled.inject({ method: 'GET', url: '/api/games/promo-game' });
    await walled.close();
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe(PUBLISHED_GAME_CACHE_CONTROL);
  });

  it('keeps a walled game private even for a signed-in reader', async () => {
    const walled = await publishedGameApp({ betaAllowedUids: uid });
    const res = await walled.inject({ method: 'GET', url: '/api/games/promo-game', headers: { cookie } });
    await walled.close();
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe(API_DEFAULT_CACHE_CONTROL);
  });

  it('keeps a session-bearing document out of shared caches', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(isPubliclyCacheable(res.headers['cache-control'] as string | undefined)).toBe(false);
  });

  it('applies to refusals too, which carry the same fragmentation', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['cache-control']).toBe(API_DEFAULT_CACHE_CONTROL);
  });

  it('leaves a route alone once it has chosen its own header', async () => {
    const probe = await buildApp({ store: new InMemoryStore(), sessionSecret });
    probe.get('/api/cache-policy-probe', async (_request, reply) => {
      return reply.header('cache-control', 'public, max-age=60').send({ ok: true });
    });
    const res = await probe.inject({ method: 'GET', url: '/api/cache-policy-probe' });
    await probe.close();
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });

  it('does not touch the well-known documents outside /api', async () => {
    const res = await app.inject({ method: 'GET', url: '/.well-known/oauth-authorization-server' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).not.toBe(API_DEFAULT_CACHE_CONTROL);
  });
});

describe('shared reads', () => {
  it('lets an edge hold the catalog once the site is open', async () => {
    const open = await publishedGameApp({});
    const res = await open.inject({ method: 'GET', url: '/api/catalog' });
    await open.close();
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe(SHARED_READ_CACHE_CONTROL);
  });

  it('keeps the catalog private while the site is walled', async () => {
    const walled = await publishedGameApp({ betaAllowedUids: uid });
    const res = await walled.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` },
    });
    await walled.close();
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe(API_DEFAULT_CACHE_CONTROL);
  });

  it('closes the catalog to caches again when the last rung is pulled', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ anonymousPaused: true }, 'test');
    const app = await buildApp({ store, sessionSecret });
    const res = await app.inject({ method: 'GET', url: '/api/catalog' });
    await app.close();
    // Walled at runtime: the wall answers first, and nothing shareable is produced.
    expect(res.statusCode).toBe(401);
    expect(isPubliclyCacheable(res.headers['cache-control'] as string | undefined)).toBe(false);
  });

  it('never shares a bad answer, which would outlive the outage', async () => {
    // No GitHub client: the catalog route answers 503.
    const app = await buildApp({ store: new InMemoryStore(), sessionSecret });
    const res = await app.inject({ method: 'GET', url: '/api/catalog' });
    await app.close();
    expect(res.statusCode).not.toBe(200);
    expect(res.headers['cache-control']).toBe(API_DEFAULT_CACHE_CONTROL);
  });

  it('leaves personal reads per-user even on an open site', async () => {
    const open = await publishedGameApp({});
    const res = await open.inject({ method: 'GET', url: '/api/notifications' });
    await open.close();
    expect(isPubliclyCacheable(res.headers['cache-control'] as string | undefined)).toBe(false);
  });
});
