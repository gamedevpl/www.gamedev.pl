import type { GameGenerator, GameProject } from '@gamedevpl/game-generator';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import packageJson from '../../../package.json';
import { buildApp } from './app.js';
import { MAX_PROJECT_BYTES } from './assemble.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
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

  it('catalog requires a session in private-beta mode', async () => {
    const app = await buildApp({ betaAllowedUids: ownerUid });
    const res = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(res.statusCode).toBe(401);
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
      verifyIdToken: async () => ({ sub: 'owner-sub-123', email: ownerEmail }),
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
