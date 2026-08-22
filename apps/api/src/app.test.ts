import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import packageJson from '../../../package.json';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { InMemoryStore } from './store.js';

const sessionSecret = 'dev-session-secret-change-me';

function cookieFor(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

async function createAuthenticatedApp() {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:test-user' });
  const app = await buildApp({ store, sessionSecret });
  const token = mintSessionToken('g:test-user', sessionSecret);
  const authHeaders = { cookie: `${SESSION_COOKIE_NAME}=${token}` };
  return { app, store, authHeaders };
}

describe('api', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const setup = await createAuthenticatedApp();
    app = setup.app;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns version info', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/version' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: packageJson.name, version: packageJson.version });
  });

  it('reports health with the active provider', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', provider: 'mock' });
  });
});

describe('private beta gate', () => {
  const ownerUid = 'g:owner-sub-123';
  const ownerEmail = 'owner@example.com';
  const strangerUid = 'g:stranger-sub-456';
  const strangerEmail = 'stranger@example.com';

  it('catalog is open when privateBeta is false (default)', async () => {
    const app = await buildApp({ store: new InMemoryStore() });
    const res = await app.inject({ method: 'GET', url: '/api/catalog' });
    // No session wall — public reads. 503 means GitHub token not configured (no auth gate).
    expect([200, 404, 503]).toContain(res.statusCode);
    await app.close();
  });

  it('health is always open even in private-beta mode', async () => {
    const app = await buildApp({ betaAllowedUids: ownerUid });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('health reports privateBeta so the web client can decide whether to show the splash', async () => {
    const closedApp = await buildApp({ betaAllowedUids: ownerUid, publicPlaySlugs: 'airtime,not-a-valid-slug!' });
    const closedRes = await closedApp.inject({ method: 'GET', url: '/api/health' });
    expect(closedRes.json()).toMatchObject({ privateBeta: true, publicPlaySlugs: ['airtime'] });
    await closedApp.close();

    const openApp = await buildApp({ store: new InMemoryStore() });
    const openRes = await openApp.inject({ method: 'GET', url: '/api/health' });
    expect(openRes.json()).toMatchObject({ privateBeta: false });
    await openApp.close();
  });

  // In private-beta mode catalog, published games, and play telemetry require a session.
  // These assert the *wall*, not the handler — 401 means the wall turned the request away
  // before the route ran.
  it('catalog requires a session in private-beta mode', async () => {
    const app = await buildApp({ betaAllowedUids: ownerUid });
    const res = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('a published game requires a session in private-beta mode', async () => {
    const app = await buildApp({ betaAllowedUids: ownerUid });
    const res = await app.inject({ method: 'GET', url: '/api/games/some-slug' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('an allowlisted promotional game reaches the game handler without a session', async () => {
    const app = await buildApp({ betaAllowedUids: ownerUid, publicPlaySlugs: 'promo-game' });
    const res = await app.inject({ method: 'GET', url: '/api/games/promo-game' });
    // No GitHub client: 503 proves the handler ran, unlike a wall 401.
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('the public game landing page remains walled during private beta', async () => {
    const app = await buildApp({ betaAllowedUids: ownerUid, publicPlaySlugs: 'promo-game' });
    const res = await app.inject({ method: 'GET', url: '/api/games/promo-game/page' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('uses the operator-managed promotional list without a redeploy', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: ownerUid });
    const app = await buildApp({
      store,
      sessionSecret,
      betaAllowedUids: ownerUid,
      adminUids: ownerUid,
      publicPlayTtlMs: 0,
      publicPlaySlugs: 'fallback-game',
    });

    const saved = await app.inject({
      method: 'POST',
      url: '/api/admin/public-play',
      headers: cookieFor(ownerUid),
      payload: { slugs: ['promo-game'] },
    });
    expect(saved.statusCode).toBe(200);

    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.json()).toMatchObject({ publicPlaySlugs: ['promo-game'] });
    const publicGame = await app.inject({ method: 'GET', url: '/api/games/promo-game' });
    expect(publicGame.statusCode).toBe(503);
    await app.close();
  });

  it('published game preview media is reachable without a session in private-beta mode', async () => {
    const app = await buildApp({ betaAllowedUids: ownerUid });
    const res = await app.inject({ method: 'GET', url: '/api/games/some-slug/media/opening.png?w=1280' });
    // No configured GitHub client means the media handler itself returns 503; a 401
    // here would mean the private-beta wall intercepted the public preview asset.
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('play telemetry requires a session in private-beta mode', async () => {
    const app = await buildApp({ betaAllowedUids: ownerUid });
    const res = await app.inject({ method: 'POST', url: '/api/telemetry', payload: {} });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('play telemetry for an allowlisted promotional game accepts anonymous input', async () => {
    const app = await buildApp({ betaAllowedUids: ownerUid, publicPlaySlugs: 'promo-game' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/telemetry',
      payload: {
        slug: 'promo-game',
        sessionId: '00000000-0000-4000-8000-000000000001',
        events: [{ type: 'game_opened' }],
      },
    });
    expect(res.statusCode).toBe(202);
    await app.close();
  });

  it('drafts stay walled — unmerged work is not published content', async () => {
    const app = await buildApp({ betaAllowedUids: ownerUid });
    const res = await app.inject({ method: 'GET', url: '/api/drafts/some-slug' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('creating a game stays walled', async () => {
    const app = await buildApp({ betaAllowedUids: ownerUid });
    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      payload: { title: 'Game idea', concept: 'A concept long enough to pass the schema checks.' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('waitlist works without a session in private-beta mode (rejected sign-ins must reach it)', async () => {
    const app = await buildApp({ betaAllowedUids: ownerUid });
    // No cookie header — this route exists precisely for people who are NOT signed in.
    const res = await app.inject({ method: 'POST', url: '/api/waitlist', payload: {} });
    // 400 (validation) not 401 (wall) — proves the private-beta gate exempts this route.
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('MCP endpoint is exempt from the private-beta wall (agents have no site session)', async () => {
    const app = await buildApp({ betaAllowedUids: ownerUid });
    const res = await app.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: { 'content-type': 'application/json' },
      payload: { jsonrpc: '2.0', id: 1, method: 'ping' },
    });
    // Not 401 from the wall — handler may 503 (unconfigured) or answer JSON-RPC.
    expect(res.statusCode).not.toBe(401);
    await app.close();
  });

  it('non-API paths are never 401 in private-beta mode (shell must be reachable)', async () => {
    const app = await buildApp({ betaAllowedUids: ownerUid });
    const res = await app.inject({ method: 'GET', url: '/some-path' });
    // Static files not present in tests — expect 404 (not found), never 401 (auth wall)
    expect(res.statusCode).not.toBe(401);
    await app.close();
  });

  it('allowed uid can sign in in private-beta mode', async () => {
    const store = new InMemoryStore();
    const mockVerifier = {
      verifyIdToken: async () => ({ sub: 'owner-sub-123', email: ownerEmail }),
    };
    const app = await buildApp({
      store,
      sessionSecret,
      googleAuthVerifier: mockVerifier,
      betaAllowedUids: ownerUid,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'valid-token' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('non-allowlisted uid is rejected with 403 in private-beta mode', async () => {
    const store = new InMemoryStore();
    const mockVerifier = {
      verifyIdToken: async () => ({ sub: 'stranger-sub-456', email: strangerEmail }),
    };
    const app = await buildApp({
      store,
      sessionSecret,
      googleAuthVerifier: mockVerifier,
      betaAllowedUids: ownerUid,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'valid-token' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('private beta');
    await app.close();
  });

  it('allowed email can sign in in private-beta mode (uid not listed)', async () => {
    const store = new InMemoryStore();
    const mockVerifier = {
      verifyIdToken: async () => ({ sub: 'owner-sub-123', email: ownerEmail, emailVerified: true }),
    };
    const app = await buildApp({
      store,
      sessionSecret,
      googleAuthVerifier: mockVerifier,
      betaAllowedEmails: ownerEmail,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'valid-token' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('rejected sign-in leaves no user doc in the store', async () => {
    const store = new InMemoryStore();
    const mockVerifier = {
      verifyIdToken: async () => ({ sub: 'stranger-sub-456', email: strangerEmail }),
    };
    const app = await buildApp({
      store,
      sessionSecret,
      googleAuthVerifier: mockVerifier,
      betaAllowedUids: ownerUid,
    });
    await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'valid-token' },
    });
    const doc = await store.getUser(strangerUid);
    expect(doc).toBeNull();
    await app.close();
  });
});

describe('client IP resolution behind the Cloud Run proxy', () => {
  // Cloud Run appends the real client IP to X-Forwarded-For instead of replacing
  // it, so a caller can prepend anything they like. Everything per-IP in this app
  // (rate limits, abuse controls) depends on that prefix being ignored.
  const realClientIp = '198.51.100.7';

  async function exhaustAuthBucket(app: FastifyInstance, spoofedPrefix: string, attempts: number) {
    let lastStatus = 0;
    for (let i = 0; i < attempts; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/google',
        headers: { 'x-forwarded-for': `${spoofedPrefix}, ${realClientIp}` },
        payload: { idToken: 'not-a-real-token' },
      });
      lastStatus = res.statusCode;
    }
    return lastStatus;
  }

  it('ignores a client-supplied X-Forwarded-For prefix when bucketing by IP', async () => {
    const app = await buildApp({ store: new InMemoryStore(), sessionSecret: 'test-secret' });

    // The auth limiter allows 20 per window. Vary the spoofed prefix every time:
    // if it were trusted, each request would land in its own fresh bucket and
    // none of these would ever be limited.
    await exhaustAuthBucket(app, '1.1.1.1', 20);
    const afterLimit = await exhaustAuthBucket(app, '203.0.113.250', 1);
    expect(afterLimit).toBe(429);

    // A genuinely different client (different rightmost entry, the one Cloud Run
    // wrote) must still be served — otherwise we're back to one global bucket.
    const otherClient = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      headers: { 'x-forwarded-for': '1.1.1.1, 203.0.113.9' },
      payload: { idToken: 'not-a-real-token' },
    });
    expect(otherClient.statusCode).not.toBe(429);

    await app.close();
  });
});
