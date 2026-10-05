import { beforeEach, describe, expect, it } from 'vitest';
import { mintAccessTokenFor } from './access-token-service.js';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { InMemoryStore } from './store.js';

// A cookie traded for a PAT dies with it, renewal included.

const sessionSecret = 'dev-session-secret-change-me';
const HOUR = 60 * 60 * 1000;

const adminCookie = () => `${SESSION_COOKIE_NAME}=${mintSessionToken('g:boss', sessionSecret)}`;
const derivedCookie = (uid: string, tokenId?: string, lifeSeconds = 60) =>
  `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret, lifeSeconds, undefined, 'token', tokenId)}`;

describe('token-derived session cookies', () => {
  let store: InMemoryStore;
  let app: Awaited<ReturnType<typeof buildApp>>;

  const me = (cookie: string) => app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
  const reissued = (res: Awaited<ReturnType<typeof me>>) =>
    res.cookies.filter((entry) => entry.name === SESSION_COOKIE_NAME && entry.value);

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    app = await buildApp({ store, sessionSecret, adminUids: 'g:boss', betaAllowedUids: 'g:boss' });
  });

  it('stops honouring, and stops renewing, a derived cookie once its token is revoked', async () => {
    const minted = await app.inject({
      method: 'POST',
      url: '/api/admin/access-tokens',
      headers: { cookie: adminCookie() },
      payload: { uid: 'bot:e2e', name: 'agent vm' },
    });
    const { token, tokenId } = minted.json();

    const exchanged = await app.inject({
      method: 'POST',
      url: '/api/auth/session',
      headers: { authorization: `Bearer ${token}` },
    });
    const cookie = String(exchanged.headers['set-cookie']).split(';')[0] as string;
    expect((await me(cookie)).statusCode).toBe(200);
    // Past half-life, so a live one gets renewed.
    expect(reissued(await me(derivedCookie('bot:e2e', tokenId)))).toHaveLength(1);

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/api/admin/access-tokens/${tokenId}`,
      headers: { cookie: adminCookie() },
    });
    expect(revoked.statusCode).toBe(200);

    for (const held of [cookie, derivedCookie('bot:e2e', tokenId)]) {
      const res = await me(held);
      expect(res.statusCode).toBe(401);
      expect(reissued(res)).toHaveLength(0);
    }
  });

  it('stops honouring a derived cookie once its token expires', async () => {
    // A one-day token minted two days ago.
    const { record } = await mintAccessTokenFor(store, {
      uid: 'bot:e2e',
      name: 'short',
      createdByUid: 'g:boss',
      expiresInDays: 1,
      nowMs: Date.now() - 48 * HOUR,
    });

    const res = await me(derivedCookie('bot:e2e', record.tokenId));
    expect(res.statusCode).toBe(401);
    expect(reissued(res)).toHaveLength(0);
  });

  it('refuses a derived cookie that names no token, or another account’s token', async () => {
    const { record } = await mintAccessTokenFor(store, {
      uid: 'bot:other',
      name: 'other',
      createdByUid: 'g:boss',
      nowMs: Date.now(),
    });
    await store.upsertUser({ uid: 'bot:e2e' });

    expect((await me(derivedCookie('bot:e2e', undefined, 3600))).statusCode).toBe(401);
    expect((await me(derivedCookie('bot:e2e', record.tokenId, 3600))).statusCode).toBe(401);
  });

  it('leaves a live token’s derived cookie working', async () => {
    const { record } = await mintAccessTokenFor(store, {
      uid: 'bot:e2e',
      name: 'live',
      createdByUid: 'g:boss',
      nowMs: Date.now(),
    });

    expect((await me(derivedCookie('bot:e2e', record.tokenId, 3600))).statusCode).toBe(200);
  });
});
