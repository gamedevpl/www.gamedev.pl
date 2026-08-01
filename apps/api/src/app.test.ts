import type { GameGenerator, GameProject } from '@gamedevpl/game-generator';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import packageJson from '../../../package.json';
import { buildApp } from './app.js';
import { MAX_PROJECT_BYTES } from './assemble.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import type { ContentChecker } from './moderation.js';
import { InMemoryStore } from './store.js';

function stubGenerator(project: Partial<GameProject>): GameGenerator {
  return {
    name: 'stub',
    generate: async () => ({
      title: 'Stub',
      description: '',
      html: '<canvas></canvas>',
      js: 'const x = 1;',
      css: 'body{}',
      ...project,
    }),
  };
}

const sessionSecret = 'dev-session-secret-change-me';

/**
 * A content checker that counts what a real one would *bill* us for.
 *
 * `VertexChecker.checkFields` makes one paid Gemini call per field, so this counts
 * fields rather than invocations — the number these tests assert on is the number of
 * Vertex calls the request would have cost in production.
 */
function countingChecker(verdict: { allowed: boolean; category?: string } = { allowed: true }) {
  const state = {
    calls: 0,
    checker: {
      async check() {
        state.calls += 1;
        return verdict as Awaited<ReturnType<ContentChecker['check']>>;
      },
      async checkFields(fields: string[]) {
        state.calls += fields.length;
        return verdict as Awaited<ReturnType<ContentChecker['checkFields']>>;
      },
    } satisfies ContentChecker,
  };
  return state;
}

function cookieFor(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

async function createAuthenticatedApp(generator?: GameGenerator) {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:test-user' });
  const app = await buildApp({ generator, store, sessionSecret });
  const token = mintSessionToken('g:test-user', sessionSecret);
  const authHeaders = { cookie: `${SESSION_COOKIE_NAME}=${token}` };
  return { app, store, authHeaders };
}

describe('api', () => {
  let app: FastifyInstance;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    const setup = await createAuthenticatedApp();
    app = setup.app;
    authHeaders = setup.authHeaders;
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

  it('rejects /api/generate-game without authentication with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/generate-game',
      payload: { prompt: 'collect coins in space' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns a self-contained playable HTML document for a prompt when authenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/generate-game',
      headers: authHeaders,
      payload: { prompt: 'collect coins in space' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.title).toBeTruthy();
    expect(body.html).toContain('<!doctype html>');
    expect(body.html).toContain('<script>');
    expect(body.html).toContain('<style>');
    expect(body.html).not.toContain('__TITLE__');
  });

  it('rejects an empty prompt with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/generate-game',
      headers: authHeaders,
      payload: { prompt: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a prompt that trips content moderation with 422, before spending quota', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:mod-test' });
    const app = await buildApp({ store, sessionSecret });
    const token = mintSessionToken('g:mod-test', sessionSecret);
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${token}` };

    const res = await app.inject({
      method: 'POST',
      url: '/api/generate-game',
      headers,
      payload: { prompt: 'make a porn game' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: 'content_rejected', category: 'adult' });

    // Quota must not have been spent on a rejected prompt.
    const quota = await store.checkAndIncrementQuota('g:mod-test', new Date().toISOString().slice(0, 10), 20, 'mocks');
    expect(quota.current).toBe(1); // first real increment — the moderated attempt didn't count
    await app.close();
  });

  /**
   * Moderation is a paid Vertex call, so what matters on these paths is not only the
   * status code but whether we were billed to produce it. Each of these used to spend
   * money on every request: the quota capped games created, not dollars, and nothing
   * capped the request rate at all.
   */
  it('spends nothing on moderation once the daily quota is exhausted', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:quota-test' });
    const moderation = countingChecker();
    const app = await buildApp({
      store,
      sessionSecret,
      contentChecker: moderation.checker,
      dailyGenerationQuota: 1,
    });

    const payload = { prompt: 'a cheerful platformer' };
    const first = await app.inject({
      method: 'POST',
      url: '/api/generate-game',
      headers: cookieFor('g:quota-test'),
      payload,
    });
    expect(first.statusCode).toBe(200);
    expect(moderation.calls).toBe(1);

    const second = await app.inject({
      method: 'POST',
      url: '/api/generate-game',
      headers: cookieFor('g:quota-test'),
      payload,
    });
    expect(second.statusCode).toBe(429);
    // The refusal must be free — an out-of-budget account that still bills us on every
    // attempt makes the daily limit a cap on games, not on cost.
    expect(moderation.calls).toBe(1);

    await app.close();
  });

  it('caps generate-game per IP so one account cannot bill us without limit', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:flood' });
    const moderation = countingChecker();
    // Quota deliberately far above the per-IP ceiling, so the limiter is what stops it.
    const app = await buildApp({
      store,
      sessionSecret,
      contentChecker: moderation.checker,
      dailyGenerationQuota: 10_000,
    });

    const send = () =>
      app.inject({
        method: 'POST',
        url: '/api/generate-game',
        headers: cookieFor('g:flood'),
        payload: { prompt: 'another game' },
      });

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 31; attempt += 1) {
      statuses.push((await send()).statusCode);
    }

    expect(statuses.filter((status) => status === 200)).toHaveLength(30);
    expect(statuses.at(-1)).toBe(429);
    // The 31st was refused by the rate-limit hook, which runs before the handler body —
    // so it never reached the paid call.
    expect(moderation.calls).toBe(30);

    await app.close();
  });

  it('returns 502 when the generated project exceeds the size cap', async () => {
    const { app: oversized, authHeaders: headers } = await createAuthenticatedApp(
      stubGenerator({ js: 'x'.repeat(MAX_PROJECT_BYTES + 1) }),
    );
    const res = await oversized.inject({
      method: 'POST',
      url: '/api/generate-game',
      headers,
      payload: { prompt: 'huge game' },
    });
    expect(res.statusCode).toBe(502);
    await oversized.close();
  });

  it('returns 502 when the generated project is empty', async () => {
    const { app: empty, authHeaders: headers } = await createAuthenticatedApp(stubGenerator({ html: '', js: '' }));
    const res = await empty.inject({
      method: 'POST',
      url: '/api/generate-game',
      headers,
      payload: { prompt: 'empty game' },
    });
    expect(res.statusCode).toBe(502);
    await empty.close();
  });

  it('returns non-2xx and redacts response details when generated code contains credential-like strings', async () => {
    const fakeKey = `sk-ant-${'A'.repeat(40)}`;
    const { app: leaky, authHeaders: headers } = await createAuthenticatedApp(
      stubGenerator({ js: `const apiKey = "${fakeKey}";` }),
    );
    const res = await leaky.inject({
      method: 'POST',
      url: '/api/generate-game',
      headers,
      payload: { prompt: 'leaky game' },
    });
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain(fakeKey);
    await leaky.close();
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
    const closedApp = await buildApp({ betaAllowedUids: ownerUid });
    const closedRes = await closedApp.inject({ method: 'GET', url: '/api/health' });
    expect(closedRes.json()).toMatchObject({ privateBeta: true });
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

  it('play telemetry requires a session in private-beta mode', async () => {
    const app = await buildApp({ betaAllowedUids: ownerUid });
    const res = await app.inject({ method: 'POST', url: '/api/telemetry', payload: {} });
    expect(res.statusCode).toBe(401);
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
