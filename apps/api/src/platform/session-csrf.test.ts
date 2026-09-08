import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mintAccessTokenFor } from './access-token-service.js';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { InMemoryStore } from './store.js';

const secret = 'local-csrf-regression-secret';
const cookie = `${SESSION_COOKIE_NAME}=${mintSessionToken('g:alice', secret)}`;
const mintBody = { name: 'ci', expiresInDays: 1 };

describe('cookie-authenticated write CSRF protection', () => {
  let app: FastifyInstance;
  let store: InMemoryStore;
  let writes: number;

  beforeEach(async () => {
    vi.stubEnv('APP_BASE_URL', 'https://www.gamedev.pl');
    vi.stubEnv('CANONICAL_HOST', 'www.gamedev.pl');
    vi.stubEnv('WEB_ORIGIN', 'https://www.gamedev.pl');
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:alice' });
    app = await buildApp({ store, sessionSecret: secret });
    writes = 0;
    app.route({
      method: ['POST', 'PUT', 'PATCH', 'DELETE'],
      url: '/csrf-probe',
      handler: async () => ({ writes: ++writes }),
    });
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it.each([
    'https://attacker.invalid',
    'https://evil.gamedev.pl',
    'https://www.gamedev.pl.attacker.invalid',
    'http://www.gamedev.pl',
    'null',
    'https://www.gamedev.pl/path',
    'https://www.gamedev.pl, https://attacker.invalid',
  ])('refuses a foreign/invalid origin without minting a PAT: %s', async (origin) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/me/access-tokens',
      headers: { cookie, origin, 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'name=forged&expiresInDays=1',
    });
    expect(res.statusCode).toBe(403);
    expect(await store.listAccessTokens('g:alice')).toHaveLength(0);
  });

  it.each(['application/x-www-form-urlencoded', 'text/plain'])(
    'requires JSON even without Origin: %s',
    async (type) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/me/access-tokens',
        headers: { cookie, 'content-type': type },
        payload: type === 'text/plain' ? JSON.stringify(mintBody) : 'name=forged&expiresInDays=1',
      });
      expect(res.statusCode).toBe(415);
      expect(await store.listAccessTokens('g:alice')).toHaveLength(0);
    },
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)('guards %s before any handler writes', async (method) => {
    const res = await app.inject({
      method,
      url: '/csrf-probe',
      headers: { cookie, origin: 'https://evil.gamedev.pl' },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(writes).toBe(0);
  });

  it('does not allow token revocation from a sibling origin', async () => {
    const { record } = await mintAccessTokenFor(store, {
      uid: 'g:alice',
      name: 'keep',
      createdByUid: 'g:alice',
      nowMs: Date.now(),
    });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/me/access-tokens/${record.tokenId}`,
      headers: { cookie, origin: 'https://evil.gamedev.pl' },
    });
    expect(res.statusCode).toBe(403);
    expect(await store.listAccessTokens('g:alice')).toHaveLength(1);
  });

  it.each([{ origin: 'https://www.gamedev.pl' }, { referer: 'https://www.gamedev.pl/studio?tab=settings' }, {}])(
    'allows a valid JSON mint from the app or a headerless API client: %j',
    async (headers) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/me/access-tokens',
        headers: { cookie, ...headers, 'content-type': 'application/json; charset=utf-8' },
        payload: mintBody,
      });
      expect(res.statusCode).toBe(201);
      expect(await store.listAccessTokens('g:alice')).toHaveLength(1);
    },
  );

  it('accepts a same-origin candidate without trusting forwarded-host', async () => {
    const headers = {
      cookie,
      host: 'candidate---gamedev-app.run.app',
      'x-forwarded-proto': 'https',
      origin: 'https://candidate---gamedev-app.run.app',
    };
    expect((await app.inject({ method: 'POST', url: '/csrf-probe', headers })).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/csrf-probe',
          headers: { ...headers, origin: 'https://evil.gamedev.pl', 'x-forwarded-host': 'evil.gamedev.pl' },
        })
      ).statusCode,
    ).toBe(403);
    expect(writes).toBe(1);
  });

  it('accepts configured development origins but not arbitrary loopback ports', async () => {
    vi.stubEnv('WEB_ORIGIN', 'http://localhost:5173, http://127.0.0.1:5173');
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
      expect((await app.inject({ method: 'POST', url: '/csrf-probe', headers: { cookie, origin } })).statusCode).toBe(
        200,
      );
    }
    expect(
      (await app.inject({ method: 'POST', url: '/csrf-probe', headers: { cookie, origin: 'http://127.0.0.1:8769' } }))
        .statusCode,
    ).toBe(403);
  });

  it('accepts the default Vite proxy with its original Host and no configured origin', async () => {
    vi.stubEnv('WEB_ORIGIN', '');
    const res = await app.inject({
      method: 'POST',
      url: '/csrf-probe',
      headers: { cookie, host: 'localhost:5173', origin: 'http://localhost:5173' },
    });
    expect(res.statusCode).toBe(200);
    expect(writes).toBe(1);
  });

  it.each([
    { referer: 'https://evil.gamedev.pl/form' },
    { referer: 'not a URL' },
    { 'sec-fetch-site': 'same-site' },
    { 'sec-fetch-site': 'cross-site' },
    { origin: 'null', referer: 'https://www.gamedev.pl/' },
  ])('does not fall back past an untrusted browser signal: %j', async (headers) => {
    const res = await app.inject({ method: 'POST', url: '/csrf-probe', headers: { cookie, ...headers } });
    expect(res.statusCode).toBe(403);
    expect(writes).toBe(0);
  });

  it('protects PAT-derived cookies, including when a Bearer header is added', async () => {
    const tokenCookie = `${SESSION_COOKIE_NAME}=${mintSessionToken('g:alice', secret, 3600, undefined, 'token')}`;
    for (const held of [cookie, tokenCookie]) {
      const res = await app.inject({
        method: 'POST',
        url: '/csrf-probe',
        headers: { cookie: held, authorization: 'Bearer anything', origin: 'https://evil.gamedev.pl' },
      });
      expect(res.statusCode).toBe(403);
    }
    expect(writes).toBe(0);
  });

  it('leaves Bearer-only clients and safe cookie reads unchanged', async () => {
    const { token } = await mintAccessTokenFor(store, {
      uid: 'g:alice',
      name: 'cli',
      createdByUid: 'g:alice',
      nowMs: Date.now(),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/csrf-probe',
      headers: { authorization: `Bearer ${token}`, origin: 'https://client.invalid' },
    });
    expect(res.statusCode).toBe(200);
    expect(writes).toBe(1);
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie, origin: 'https://evil.gamedev.pl' } }))
        .statusCode,
    ).toBe(200);
  });
});
