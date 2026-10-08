import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import {
  AS_ACCESS_TOKEN_TTL_MS,
  generateAsAccessToken,
  generateAsRefreshToken,
  verifyAsAccessToken,
} from './oauth-tokens.js';
import { tokenBindingLive } from './pat-grant-binding.js';
import { InMemoryStore } from './store.js';

const sessionSecret = 'dev-session-secret-change-me';
const uid = 'g:owner-sub-123';

function cookieFor(who: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(who, sessionSecret)}` };
}

async function seedGrant(store: InMemoryStore) {
  const access = generateAsAccessToken();
  const grantId = 'grant-1';
  const nowIso = new Date().toISOString();
  await store.createOAuthGrant({
    grantId,
    clientId: 'client',
    ownerUid: uid,
    scope: 'mcp',
    createdAt: nowIso,
    refreshFamilyId: grantId,
    currentRefreshTokenId: generateAsRefreshToken().tokenId,
    currentRefreshHash: 'abc',
    refreshExpiresAt: new Date(Date.now() + AS_ACCESS_TOKEN_TTL_MS).toISOString(),
  });
  await store.createOAuthAccessToken({
    tokenId: access.tokenId,
    grantId,
    ownerUid: uid,
    secretHash: access.secretHash,
    expiresAt: new Date(Date.now() + AS_ACCESS_TOKEN_TTL_MS).toISOString(),
    createdAt: nowIso,
  });
  return access.token;
}

describe('blocked accounts', () => {
  it('lose beta access and the reviewer door', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid });
    const app = await buildApp({ store, sessionSecret, betaAllowedUids: uid, reviewerUids: uid });
    const before = await app.inject({ method: 'GET', url: '/api/review/queue', headers: cookieFor(uid) });
    expect(before.statusCode).toBe(200);

    await store.upsertUser({ uid, tier: 'blocked' });
    for (const url of ['/api/catalog', '/api/review/queue']) {
      const res = await app.inject({ method: 'GET', url, headers: cookieFor(uid) });
      expect(res.statusCode, url).toBe(403);
    }
    await app.close();

    // With the beta wall down, the role check itself still refuses.
    const openApp = await buildApp({ store, sessionSecret, reviewerUids: uid });
    const res = await openApp.inject({ method: 'GET', url: '/api/review/queue', headers: cookieFor(uid) });
    expect(res.statusCode).toBe(404);
    await openApp.close();
  });

  it('lose OAuth access and refresh, browser-consented grants included', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid });
    const token = await seedGrant(store);
    expect(await verifyAsAccessToken(store, token)).not.toBeNull();
    expect(await tokenBindingLive(store, { ownerUid: uid }, Date.now())).toBe(true);

    await store.upsertUser({ uid, tier: 'blocked' });
    expect(await verifyAsAccessToken(store, token)).toBeNull();
    expect(await tokenBindingLive(store, { ownerUid: uid }, Date.now())).toBe(false);
  });
});
