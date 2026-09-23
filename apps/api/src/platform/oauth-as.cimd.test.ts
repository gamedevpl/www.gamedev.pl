import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import type { CimdFetcher } from './cimd-fetch.js';
import { pkceChallengeS256 } from './oauth-pkce.js';
import { InMemoryStore } from './store.js';

const SESSION_SECRET = 'dev-session-secret-change-me';
function sessionCookie(uid: string): string {
  return `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, SESSION_SECRET)}`;
}
async function buildOAuthApp(store: InMemoryStore, cimdFetcher: CimdFetcher) {
  return buildApp({ store, sessionSecret: SESSION_SECRET, cimdFetcher });
}

async function authorizeCimd(app: FastifyInstance, clientId: string, uid = 'g:creator') {
  return app.inject({
    method: 'GET',
    url: '/oauth/authorize',
    headers: { cookie: sessionCookie(uid) },
    query: {
      response_type: 'code',
      client_id: clientId,
      redirect_uri: 'https://example.com/callback',
      scope: 'mcp',
      code_challenge: pkceChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
      code_challenge_method: 'S256',
    },
  });
}

describe('bounded CIMD clients', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });
  it('caches a failed CIMD lookup for one minute', async () => {
    const fetcher = vi.fn(async () => ({ ok: false as const, reason: 'http_status' as const }));
    app = await buildOAuthApp(new InMemoryStore(), fetcher);
    const url = 'https://example.com/cimd/negative-cache.json';
    expect((await authorizeCimd(app, url)).statusCode).toBe(400);
    expect((await authorizeCimd(app, url)).statusCode).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('evicts older CIMD records beyond 256 URLs', async () => {
    const fetcher = vi.fn(async (url: string) => ({
      ok: true as const,
      body: {
        client_id: url,
        redirect_uris: ['https://example.com/callback'],
      },
    }));
    app = await buildOAuthApp(new InMemoryStore(), fetcher);
    for (let i = 0; i < 257; i += 1) {
      const response = await authorizeCimd(app, `https://example.com/cimd/bound-${i}.json`, `g:bound-${i}`);
      expect(response.statusCode).toBe(200);
    }
    expect((await authorizeCimd(app, 'https://example.com/cimd/bound-0.json', 'g:bound-0')).statusCode).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(258);
  });

  it('shares an in-flight CIMD request', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetcher = vi.fn(async (url: string) => {
      await pending;
      return { ok: true as const, body: { client_id: url, redirect_uris: ['https://example.com/callback'] } };
    });
    app = await buildOAuthApp(new InMemoryStore(), fetcher);
    const url = 'https://example.com/cimd/concurrent.json';
    const first = authorizeCimd(app, url, 'g:concurrent');
    const second = authorizeCimd(app, url, 'g:concurrent');
    release();
    const responses = await Promise.all([first, second]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('limits distinct uncached CIMD URLs per creator', async () => {
    const fetcher = vi.fn(async () => ({ ok: false as const, reason: 'http_status' as const }));
    app = await buildOAuthApp(new InMemoryStore(), fetcher);
    for (let i = 0; i < 11; i += 1) {
      expect((await authorizeCimd(app, `https://example.com/cimd/limit-${i}.json`, 'g:limit')).statusCode).toBe(400);
    }
    expect(fetcher).toHaveBeenCalledTimes(10);
  });

  it('lists CIMD grants without a network request', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    const clientId = 'https://example.com/cimd/grant-without-cache.json';
    await store.createOAuthGrant({
      grantId: 'cimd-grant',
      clientId,
      ownerUid: 'g:creator',
      scope: 'mcp',
      createdAt: new Date().toISOString(),
      refreshFamilyId: 'cimd-grant',
      currentRefreshTokenId: 'refresh',
      currentRefreshHash: 'hash',
      refreshExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const fetcher = vi.fn(async () => ({ ok: false as const, reason: 'http_status' as const }));
    app = await buildOAuthApp(store, fetcher);
    const response = await app.inject({
      method: 'GET',
      url: '/api/me/oauth-grants',
      headers: { cookie: sessionCookie('g:creator') },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()[0].clientLabel).toBe('example.com');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { redirectUris: Array.from({ length: 11 }, () => 'https://example.com/callback') },
    { redirectUris: ['not-a-url'] },
  ])('rejects invalid redirect URI lists', async ({ redirectUris }) => {
    const url = `https://example.com/cimd/bad-list-${redirectUris.length}.json`;
    const fetcher = vi.fn(async () => ({
      ok: true as const,
      body: {
        client_id: url,
        redirect_uris: redirectUris,
      },
    }));
    app = await buildOAuthApp(new InMemoryStore(), fetcher);
    expect((await authorizeCimd(app, url)).json()).toEqual({ error: 'invalid_client' });
  });
});
