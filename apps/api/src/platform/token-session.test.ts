import { beforeEach, describe, expect, it } from 'vitest';
import { mintAccessTokenFor } from './access-token-service.js';
import { buildApp } from './app.js';
import { revokeAccessTokenAndGrants } from './pat-grant-binding.js';
import { mintSessionToken, readSessionToken, SESSION_COOKIE_NAME, TOKEN_SESSION_DURATION_SECONDS } from './auth.js';
import { InMemoryStore } from './store.js';

// A cookie traded for a PAT dies with it, renewal included.

const sessionSecret = 'dev-session-secret-change-me';
const HOUR = 60 * 60 * 1000;

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
    const { token, record } = await mintAccessTokenFor(store, {
      uid: 'bot:e2e',
      name: 'agent vm',
      createdByUid: 'g:boss',
      nowMs: Date.now(),
    });
    const { tokenId } = record;

    const exchanged = await app.inject({
      method: 'POST',
      url: '/api/auth/session',
      headers: { authorization: `Bearer ${token}` },
    });
    const cookie = String(exchanged.headers['set-cookie']).split(';')[0] as string;
    expect((await me(cookie)).statusCode).toBe(200);
    // Past half-life, so a live one gets renewed.
    expect(reissued(await me(derivedCookie('bot:e2e', tokenId)))).toHaveLength(1);

    expect(await revokeAccessTokenAndGrants(store, tokenId)).toBe(true);

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

    // Renewal keeps the short clock and the token provenance.
    const aged = mintSessionToken(
      'bot:e2e',
      sessionSecret,
      TOKEN_SESSION_DURATION_SECONDS,
      Math.floor(Date.now() / 1000) - 7 * 3600,
      'token',
      record.tokenId,
    );
    const renewed = reissued(await me(`${SESSION_COOKIE_NAME}=${aged}`));
    expect(renewed).toHaveLength(1);
    expect(renewed[0]!.maxAge).toBe(TOKEN_SESSION_DURATION_SECONDS);
    expect(readSessionToken(renewed[0]!.value, sessionSecret)).toMatchObject({ src: 'token', tid: record.tokenId });
  });
});
