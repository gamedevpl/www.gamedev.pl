import { beforeEach, describe, expect, it } from 'vitest';
import { generateAccessToken } from './access-token.js';
import { DEFAULT_EXPIRY_DAYS, MAX_TOKENS_PER_UID, mintAccessTokenFor } from './access-token-service.js';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { InMemoryStore } from './store.js';

/**
 * Every test here drives the **fully assembled app** (`buildApp`), never the route
 * plugin alone. That is deliberate: this repo has a cross-cutting private-beta wall
 * that lives in `app.ts`, and a previous route shipped green unit tests while the wall
 * 401'd it in production. A credential whose entire purpose is getting through that
 * wall has to be tested against it.
 */

const sessionSecret = 'dev-session-secret-change-me';
const HOUR = 60 * 60 * 1000;

function sessionHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

function appWith(store: InMemoryStore, extra: { betaAllowedUids?: string } = {}) {
  return buildApp({ store, sessionSecret, adminUids: 'g:boss', ...extra });
}

async function mintFor(app: Awaited<ReturnType<typeof buildApp>>, uid: string, name = 'agent vm') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/access-tokens',
    headers: sessionHeaders('g:boss'),
    payload: { uid, name },
  });
  return res;
}

describe('POST /api/admin/access-tokens', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    await store.upsertUser({ uid: 'g:friend' });
  });

  it('mints a token for a new bot account and creates that account', async () => {
    const app = await appWith(store);
    const res = await mintFor(app, 'bot:e2e');

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toMatch(/^gdpl_pat_[0-9a-f]{16}_[A-Za-z0-9_-]{43}$/);
    expect(body.uid).toBe('bot:e2e');
    expect(body.accountCreated).toBe(true);
    expect(body.createdByUid).toBe('g:boss');
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());

    // The account is now an ordinary standard-tier user.
    const user = await store.getUser('bot:e2e');
    expect(user?.tier).toBe('standard');
  });

  it('never returns or stores the secret hash alongside the token', async () => {
    const app = await appWith(store);
    const body = (await mintFor(app, 'bot:e2e')).json();

    expect(body.secretHash).toBeUndefined();
    const stored = await store.getAccessToken(body.tokenId);
    expect(stored?.secretHash).toBeTruthy();
    expect(body.token).not.toContain(stored?.secretHash);
  });

  it('mints for an existing human account without claiming to create it', async () => {
    const app = await appWith(store);
    const res = await mintFor(app, 'g:friend');

    expect(res.statusCode).toBe(201);
    expect(res.json().accountCreated).toBe(false);
  });

  it('refuses to invent a non-bot account, so a mistyped g: uid cannot spring into being', async () => {
    const app = await appWith(store);
    const res = await mintFor(app, 'g:typoed-sub');

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('bot:');
    expect(await store.getUser('g:typoed-sub')).toBeNull();
  });

  it('refuses a blocked account', async () => {
    await store.upsertUser({ uid: 'g:banned', tier: 'blocked' });
    const app = await appWith(store);

    const res = await mintFor(app, 'g:banned');
    expect(res.statusCode).toBe(403);
  });

  it('caps how many tokens one account may hold', async () => {
    const app = await appWith(store);
    for (let i = 0; i < MAX_TOKENS_PER_UID; i++) {
      expect((await mintFor(app, 'bot:e2e', `token ${i}`)).statusCode).toBe(201);
    }

    const res = await mintFor(app, 'bot:e2e', 'one too many');
    expect(res.statusCode).toBe(409);
  });

  it.each([
    ['a non-admin session', () => sessionHeaders('g:friend')],
    ['no credential at all', () => ({})],
  ])('answers 404 for %s', async (_label, headers) => {
    const app = await appWith(store);
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/access-tokens',
      headers: headers(),
      payload: { uid: 'bot:e2e', name: 'nope' },
    });

    // 404, not 403 — the operator surface does not confirm its own existence.
    expect(res.statusCode).toBe(404);
  });

  it.each([
    ['missing name', { uid: 'bot:e2e' }],
    ['empty name', { uid: 'bot:e2e', name: '' }],
    ['invalid uid', { uid: 'bad uid!', name: 'x' }],
    ['expiry beyond the cap', { uid: 'bot:e2e', name: 'x', expiresInDays: 400 }],
  ])('rejects an invalid mint request (%s)', async (_label, payload) => {
    const app = await appWith(store);
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/access-tokens',
      headers: sessionHeaders('g:boss'),
      payload,
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('authenticating with a personal access token', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
  });

  it('authenticates a walled route through the private-beta wall', async () => {
    // The whole point of the feature: an agent with no browser, no Google account and
    // no place on the beta allowlist still reaches an authenticated route — because an
    // admin issued it a credential, which is an admission decision in itself.
    const app = await appWith(store, { betaAllowedUids: 'g:boss' });
    const { token } = (await mintFor(app, 'bot:e2e')).json();

    const res = await app.inject({ method: 'GET', url: '/api/notifications', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
  });

  it('identifies itself as the account it was issued to', async () => {
    const app = await appWith(store);
    const { token } = (await mintFor(app, 'bot:e2e')).json();

    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.uid).toBe('bot:e2e');
    // A user payload must never carry credential material.
    expect(JSON.stringify(res.json())).not.toContain('secretHash');
  });

  it('cannot mint another token — a leaked credential cannot renew itself', async () => {
    const app = await appWith(store);
    // Issued to an account that IS an admin, so only the auth method can be what stops it.
    const { token } = (await mintFor(app, 'g:boss')).json();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/access-tokens',
      headers: bearer(token),
      payload: { uid: 'bot:sneaky', name: 'escalation' },
    });

    expect(res.statusCode).toBe(404);
    expect(await store.getUser('bot:sneaky')).toBeNull();
  });

  it('cannot read operator telemetry even when issued to an admin', async () => {
    const app = await appWith(store);
    const { token } = (await mintFor(app, 'g:boss')).json();

    for (const url of ['/api/admin/telemetry/health', '/api/admin/telemetry/visits', '/api/admin/telemetry/creators']) {
      const res = await app.inject({ method: 'GET', url, headers: bearer(token) });
      expect(res.statusCode, url).toBe(404);
    }
  });

  it('rejects a token whose secret is wrong for a real id', async () => {
    const app = await appWith(store);
    const { tokenId } = (await mintFor(app, 'bot:e2e')).json();
    const forged = `gdpl_pat_${tokenId}_${'A'.repeat(43)}`;

    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer(forged) });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an expired token', async () => {
    const { token, tokenId, secretHash } = generateAccessToken();
    await store.upsertUser({ uid: 'bot:e2e' });
    await store.createAccessToken({
      tokenId,
      uid: 'bot:e2e',
      secretHash,
      name: 'stale',
      createdAt: new Date(Date.now() - 200 * 86_400_000).toISOString(),
      createdByUid: 'g:boss',
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    const app = await appWith(store);

    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer(token) });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a token whose stored expiresAt is unparseable', async () => {
    const { token, tokenId, secretHash } = generateAccessToken();
    await store.upsertUser({ uid: 'bot:e2e' });
    await store.createAccessToken({
      tokenId,
      uid: 'bot:e2e',
      secretHash,
      name: 'corrupt',
      createdAt: new Date().toISOString(),
      createdByUid: 'g:boss',
      expiresAt: 'not-a-date',
    });
    const app = await appWith(store);

    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer(token) });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a revoked token immediately', async () => {
    const app = await appWith(store);
    const { token, tokenId } = (await mintFor(app, 'bot:e2e')).json();
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer(token) })).statusCode).toBe(200);

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/api/admin/access-tokens/${tokenId}`,
      headers: sessionHeaders('g:boss'),
    });
    expect(revoked.statusCode).toBe(200);

    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer(token) });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a token for an account that no longer exists', async () => {
    const { token, tokenId, secretHash } = generateAccessToken();
    await store.createAccessToken({
      tokenId,
      uid: 'bot:ghost',
      secretHash,
      name: 'orphan',
      createdAt: new Date().toISOString(),
      createdByUid: 'g:boss',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const app = await appWith(store);

    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer(token) });
    expect(res.statusCode).toBe(401);
  });

  it.each([
    ['a JWT-shaped bearer', 'eyJhbGciOiJSUzI1NiJ9.body.sig'],
    ['a build-channel token', 'MTIzLmFiYzEyMw'],
    ['garbage', 'not-a-token'],
    ['our prefix but malformed', 'gdpl_pat_short_secret'],
  ])('ignores %s without erroring', async (_label, credential) => {
    const app = await appWith(store);
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer(credential) });

    // Unauthenticated, never a 500 — other bearer schemes on this API must pass through
    // to the handlers that understand them.
    expect(res.statusCode).toBe(401);
  });

  it('reports its own remaining lifetime to the holder', async () => {
    const app = await appWith(store);
    const { token } = (await mintFor(app, 'bot:ci', 'github actions')).json();

    const res = await app.inject({ method: 'GET', url: '/api/auth/token-info', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('github actions');
    // A whole day may or may not have been consumed by the time this reads back.
    expect(res.json().expiresInDays).toBeGreaterThanOrEqual(DEFAULT_EXPIRY_DAYS - 1);
    expect(res.json().expiresInDays).toBeLessThanOrEqual(DEFAULT_EXPIRY_DAYS);
    // The date has to be readable, not just the day count.
    expect(Date.parse(res.json().expiresAt)).toBeGreaterThan(Date.now());
  });

  // Minted off-clock so the half-day remainder is real, not a race.
  it.each([
    [12 * HOUR, 7],
    [-12 * HOUR, 6],
  ])('floors the day count rather than rounding it (offset %i)', async (offsetMs, expected) => {
    const app = await appWith(store);
    const { token } = await mintAccessTokenFor(store, {
      uid: 'bot:ci',
      name: 'clock probe',
      createdByUid: 'g:boss',
      expiresInDays: 7,
      nowMs: Date.now() + offsetMs,
    });

    const res = await app.inject({ method: 'GET', url: '/api/auth/token-info', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().expiresInDays).toBe(expected);
  });

  it('never leaks credential material through token-info', async () => {
    const app = await appWith(store);
    const { token } = (await mintFor(app, 'bot:ci')).json();

    const res = await app.inject({ method: 'GET', url: '/api/auth/token-info', headers: bearer(token) });
    const body = JSON.stringify(res.json());
    expect(body).not.toContain('secretHash');
    expect(body).not.toContain('tokenId');
    expect(body).not.toContain(token);
  });

  it('refuses token-info to a browser session, which holds no token', async () => {
    // Kept off the User object; a cookie must not reach it.
    const app = await appWith(store);

    const res = await app.inject({ method: 'GET', url: '/api/auth/token-info', headers: sessionHeaders('g:boss') });
    expect(res.statusCode).toBe(401);
  });

  it.each([
    ['an expired token', -1],
    ['a revoked token', 0],
  ])('answers token-info with a bare 401 for %s', async (label, _marker) => {
    const { token, tokenId, secretHash } = generateAccessToken();
    await store.upsertUser({ uid: 'bot:ci' });
    await store.createAccessToken({
      tokenId,
      uid: 'bot:ci',
      secretHash,
      name: 'stale',
      createdAt: new Date(Date.now() - 200 * 86_400_000).toISOString(),
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
      createdByUid: 'g:boss',
    });
    const app = await appWith(store);
    if (label === 'a revoked token') await store.deleteAccessToken(tokenId);

    const res = await app.inject({ method: 'GET', url: '/api/auth/token-info', headers: bearer(token) });
    // Same answer for both: a stolen token learns nothing.
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('prefers a browser session over a token when both are present', async () => {
    const app = await appWith(store);
    const { token } = (await mintFor(app, 'bot:e2e')).json();

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { ...sessionHeaders('g:boss'), ...bearer(token) },
    });

    expect(res.json().user.uid).toBe('g:boss');
  });

  it('exchanges for a session cookie so a real browser can be driven', async () => {
    const app = await appWith(store, { betaAllowedUids: 'g:boss' });
    const { token } = (await mintFor(app, 'bot:e2e')).json();

    const res = await app.inject({ method: 'POST', url: '/api/auth/session', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.uid).toBe('bot:e2e');

    const setCookie = res.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain('HttpOnly');

    // The cookie must actually work on a walled route, exactly as a browser would use it.
    const followUp = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { cookie: String(cookie).split(';')[0] as string },
    });
    expect(followUp.statusCode).toBe(200);
  });

  /**
   * The escalation these two guard against: a PAT issued for an *admin* account — and
   * PATs exist precisely to sit in CI configs and agent VMs, where a human is not
   * watching — traded here for a cookie that satisfies `isAdminSession`, then used to
   * mint further tokens. Revoking the leaked original would accomplish nothing.
   */
  it('hands back a session carrying the token authority, not operator authority', async () => {
    const app = await appWith(store, { betaAllowedUids: 'g:boss' });
    const { token } = (await mintFor(app, 'g:boss', 'admin ci token')).json();

    const exchanged = await app.inject({ method: 'POST', url: '/api/auth/session', headers: bearer(token) });
    expect(exchanged.statusCode).toBe(200);
    const setCookie = exchanged.headers['set-cookie'];
    const cookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0] as string;

    // It is a genuinely working session for the account it names …
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.uid).toBe('g:boss');

    // … and still refused everywhere a session-only check applies. 404, the same answer
    // a non-admin gets, because whether an operator surface exists is not worth confirming.
    const mintAgain = await app.inject({
      method: 'POST',
      url: '/api/admin/access-tokens',
      headers: { cookie },
      payload: { uid: 'bot:escalated', name: 'minted by a token' },
    });
    expect(mintAgain.statusCode).toBe(404);

    const operatorView = await app.inject({
      method: 'GET',
      url: '/api/admin/telemetry/health',
      headers: { cookie },
    });
    expect(operatorView.statusCode).toBe(404);
  });

  it('keeps that restriction across a session renewal', async () => {
    // Renewal re-mints the cookie mid-flight. If provenance were dropped there, a
    // token-derived session would silently become an ordinary one after six hours and
    // regain the authority it was just denied.
    const app = await appWith(store, { betaAllowedUids: 'g:boss' });

    // A token-derived session already past its half-life, so the onSend hook renews it.
    const aging = mintSessionToken('g:boss', sessionSecret, 60, undefined, 'token');
    const renewed = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${aging}` },
    });
    expect(renewed.statusCode).toBe(200);
    const rolled = renewed.headers['set-cookie'];
    expect(rolled).toBeDefined();
    const renewedCookie = String(Array.isArray(rolled) ? rolled[0] : rolled).split(';')[0] as string;

    // The re-minted payload still says where it came from.
    const encodedPayload = renewedCookie.split('=')[1]?.split('.')[0] as string;
    expect(JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')).src).toBe('token');

    const mintAgain = await app.inject({
      method: 'POST',
      url: '/api/admin/access-tokens',
      headers: { cookie: renewedCookie },
      payload: { uid: 'bot:escalated', name: 'minted after renewal' },
    });
    expect(mintAgain.statusCode).toBe(404);
  });

  it('still lets a real browser session reach the operator surfaces', async () => {
    // The counterweight: the fix must not lock the operator out of their own tools.
    const app = await appWith(store, { betaAllowedUids: 'g:boss' });
    const res = await mintFor(app, 'bot:e2e');
    expect(res.statusCode).toBe(201);
  });

  it('refuses to mint a fresh session from a cookie it minted earlier', async () => {
    // A derived cookie authenticates as a token, so checking the auth *method* alone
    // would let it mint an endless succession of replacements and outlive revocation of
    // the PAT behind it. The exchange must see the credential itself every time.
    const app = await appWith(store, { betaAllowedUids: 'g:boss' });
    const { token } = (await mintFor(app, 'bot:e2e')).json();

    const exchanged = await app.inject({ method: 'POST', url: '/api/auth/session', headers: bearer(token) });
    const setCookie = exchanged.headers['set-cookie'];
    const cookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0] as string;

    // The cookie really is a working credential — so the refusal below is the rule
    // biting, not the header being dropped.
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.uid).toBe('bot:e2e');

    const again = await app.inject({ method: 'POST', url: '/api/auth/session', headers: { cookie } });
    expect(again.statusCode).toBe(401);
  });

  it.each([
    ['a browser session', () => sessionHeaders('g:boss')],
    ['no credential', () => ({})],
  ])('refuses to mint a session from %s', async (_label, headers) => {
    const app = await appWith(store);
    const res = await app.inject({ method: 'POST', url: '/api/auth/session', headers: headers() });

    expect(res.statusCode).toBe(401);
  });

  it('records last use so a stale token can be spotted before revoking it', async () => {
    const app = await appWith(store);
    const { token, tokenId } = (await mintFor(app, 'bot:e2e')).json();
    expect((await store.getAccessToken(tokenId))?.lastUsedAt).toBeUndefined();

    await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer(token) });

    expect((await store.getAccessToken(tokenId))?.lastUsedAt).toBeTruthy();
  });

  it('does not count a bot request as a human active day', async () => {
    // `activeDays` feeds the creator-return metric; an agent on a cron would otherwise
    // report perfect retention for an account that is not a person.
    //
    // Asserted as a *contrast* against the session path deliberately: until the stores
    // were fixed to persist `activeDays` at all, checking only the token path passed for
    // the wrong reason — the field was undefined for everybody.
    const app = await appWith(store);
    const { token } = (await mintFor(app, 'bot:e2e')).json();

    await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer(token) });
    await app.inject({ method: 'GET', url: '/api/auth/me', headers: sessionHeaders('g:boss') });

    expect((await store.getUser('bot:e2e'))?.activeDays).toBeUndefined();
    expect((await store.getUser('g:boss'))?.activeDays).toEqual([new Date().toISOString().slice(0, 10)]);
  });
});

describe('GET/DELETE /api/admin/access-tokens', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    await store.upsertUser({ uid: 'g:friend' });
  });

  it('lists an account’s tokens without any credential material', async () => {
    const app = await appWith(store);
    await mintFor(app, 'bot:e2e', 'first');
    await mintFor(app, 'bot:e2e', 'second');

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/access-tokens?uid=bot:e2e',
      headers: sessionHeaders('g:boss'),
    });

    expect(res.statusCode).toBe(200);
    const { tokens } = res.json();
    expect(tokens).toHaveLength(2);
    expect(res.payload).not.toContain('secretHash');
    expect(tokens.every((entry: { expired: boolean }) => entry.expired === false)).toBe(true);
  });

  it('answers 404 when revoking a token that does not exist', async () => {
    const app = await appWith(store);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/access-tokens/${'a'.repeat(16)}`,
      headers: sessionHeaders('g:boss'),
    });

    expect(res.statusCode).toBe(404);
  });

  it('rejects a malformed token id', async () => {
    const app = await appWith(store);
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/admin/access-tokens/not-hex',
      headers: sessionHeaders('g:boss'),
    });

    expect(res.statusCode).toBe(400);
  });

  it.each([
    ['listing', 'GET' as const, '/api/admin/access-tokens?uid=bot:e2e'],
    ['revoking', 'DELETE' as const, `/api/admin/access-tokens/${'a'.repeat(16)}`],
  ])('hides %s from a non-admin', async (_label, method, url) => {
    const app = await appWith(store);
    const res = await app.inject({ method, url, headers: sessionHeaders('g:friend') });

    expect(res.statusCode).toBe(404);
  });
});
