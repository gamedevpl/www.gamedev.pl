import { beforeEach, describe, expect, it } from 'vitest';
import { generateAccessToken } from './access-token.js';
import { buildApp } from './app.js';
import { mintSessionToken, readSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { formToken, sanitizeOAuthReturnPath, TOKEN_LOGIN_PATH } from './oauth-token-login.js';
import { InMemoryStore } from './store.js';

/**
 * Driven through the fully assembled app for the same reason access-token-routes.test.ts
 * is: the private-beta wall lives in app.ts, and a sign-in page that unit-tests green
 * while the wall 401s it in production would be worse than no page at all — it is the
 * one route whose entire job is to be reachable by someone with no session.
 */

const sessionSecret = 'dev-session-secret-change-me';

function appWith(store: InMemoryStore, extra: { betaAllowedUids?: string } = {}) {
  return buildApp({ store, sessionSecret, adminUids: 'g:boss', ...extra });
}

async function mintToken(app: Awaited<ReturnType<typeof buildApp>>, uid: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/access-tokens',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:boss', sessionSecret)}` },
    payload: { uid, name: 'reviewer' },
  });
  expect(res.statusCode).toBe(201);
  return res.json().token as string;
}

function post(
  app: Awaited<ReturnType<typeof buildApp>>,
  fields: Record<string, string>,
  at = Date.now(),
): ReturnType<typeof app.inject> {
  return app.inject({
    method: 'POST',
    url: TOKEN_LOGIN_PATH,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ form_token: formToken(sessionSecret, at), ...fields }).toString(),
  });
}

function sessionFrom(res: { headers: Record<string, unknown> }): string | null {
  const raw = res.headers['set-cookie'];
  const all = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const hit = all.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  return hit ? hit.slice(`${SESSION_COOKIE_NAME}=`.length).split(';')[0] : null;
}

describe('sanitizeOAuthReturnPath', () => {
  it('accepts the authorize path with and without a query', () => {
    expect(sanitizeOAuthReturnPath('/oauth/authorize')).toBe('/oauth/authorize');
    expect(sanitizeOAuthReturnPath('/oauth/authorize?client_id=x')).toBe('/oauth/authorize?client_id=x');
  });

  it('refuses anything that could land the browser off-site', () => {
    // An open redirect here hands a phishing page a browser that has just authenticated.
    expect(sanitizeOAuthReturnPath('//evil.example/oauth/authorize')).toBeNull();
    expect(sanitizeOAuthReturnPath('https://evil.example/oauth/authorize')).toBeNull();
    expect(sanitizeOAuthReturnPath('/oauth/authorize\\@evil.example')).toBeNull();
    expect(sanitizeOAuthReturnPath('/oauth/authorizex')).toBeNull();
    expect(sanitizeOAuthReturnPath('/studio')).toBeNull();
    expect(sanitizeOAuthReturnPath('/oauth/authorize\r\nSet-Cookie: x=1')).toBeNull();
  });
});

describe('GET /oauth/token-login', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
  });

  it('renders the form to a visitor with no session, even in private beta', async () => {
    // The whole point: this page is the door for someone the wall would otherwise 401.
    const app = await appWith(store, { betaAllowedUids: 'g:boss' });
    const res = await app.inject({ method: 'GET', url: TOKEN_LOGIN_PATH });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toContain(`action="${TOKEN_LOGIN_PATH}"`);
    expect(res.body).toContain('name="token"');
  });

  it('keeps itself out of search results', async () => {
    const app = await appWith(store);
    const res = await app.inject({ method: 'GET', url: TOKEN_LOGIN_PATH });
    expect(res.body).toContain('name="robots" content="noindex, nofollow"');
  });

  it('carries a valid oauth_return through to the form', async () => {
    const app = await appWith(store);
    const res = await app.inject({
      method: 'GET',
      url: `${TOKEN_LOGIN_PATH}?oauth_return=${encodeURIComponent('/oauth/authorize?client_id=abc')}`,
    });
    expect(res.body).toContain('name="oauth_return" value="/oauth/authorize?client_id=abc"');
  });

  it('drops an off-site oauth_return rather than rendering it', async () => {
    const app = await appWith(store);
    const res = await app.inject({
      method: 'GET',
      url: `${TOKEN_LOGIN_PATH}?oauth_return=${encodeURIComponent('https://evil.example/')}`,
    });
    expect(res.body).not.toContain('evil.example');
    expect(res.body).not.toContain('name="oauth_return"');
  });
});

describe('POST /oauth/token-login', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
  });

  it('signs in the token holder and lands them in the studio', async () => {
    const app = await appWith(store);
    const token = await mintToken(app, 'bot:reviewer');

    const res = await post(app, { token });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/studio');
    const cookie = sessionFrom(res);
    expect(cookie).toBeTruthy();
    expect(readSessionToken(cookie!, sessionSecret).uid).toBe('bot:reviewer');
  });

  it("stamps the cookie src:'token' so it carries the token's authority and no more", async () => {
    // Without the stamp this page would be an escalation: a leaked PAT for an admin
    // account could be traded for a cookie that satisfied the session-only surfaces.
    const app = await appWith(store);
    const token = await mintToken(app, 'bot:reviewer');

    const res = await post(app, { token });

    expect(readSessionToken(sessionFrom(res)!, sessionSecret).src).toBe('token');
  });

  it('refuses to mint further tokens with the cookie it just handed out', async () => {
    // The concrete consequence of the stamp above, asserted end to end rather than by
    // reading a claim: minting is an operator surface and must stay session-only.
    const app = await appWith(store);
    await store.upsertUser({ uid: 'g:boss2' });
    const token = await mintToken(app, 'g:boss');

    const res = await post(app, { token });
    const cookie = sessionFrom(res)!;

    const mint = await app.inject({
      method: 'POST',
      url: '/api/admin/access-tokens',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
      payload: { uid: 'g:boss2', name: 'laundered' },
    });
    // 404, not 403: the admin surface does not advertise itself to a caller that
    // fails isAdminSession. The same call with a real session cookie returns 201
    // above, so this is the refusal and not a missing route.
    expect(mint.statusCode).toBe(404);
  });

  it('returns to the authorize URL when one was carried through', async () => {
    const app = await appWith(store);
    const token = await mintToken(app, 'bot:reviewer');

    const res = await post(app, { token, oauth_return: '/oauth/authorize?client_id=abc' });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/oauth/authorize?client_id=abc');
  });

  it('ignores an off-site oauth_return and lands in the studio instead', async () => {
    const app = await appWith(store);
    const token = await mintToken(app, 'bot:reviewer');

    const res = await post(app, { token, oauth_return: 'https://evil.example/steal' });

    expect(res.headers.location).toBe('/studio');
  });

  it('reaches the consent screen with the cookie it minted', async () => {
    // The end the page exists for: an account with no Google identity, in private beta,
    // getting far enough to approve an MCP client.
    const app = await appWith(store, { betaAllowedUids: 'g:boss' });
    const token = await mintToken(app, 'bot:reviewer');
    const cookie = sessionFrom(await post(app, { token }))!;

    const authorize = await app.inject({
      method: 'GET',
      url: '/oauth/authorize',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });

    // Past the sign-in redirect: a missing session bounces to /studio?oauth_return=…,
    // and this account never bounces. The 400 is the *next* check complaining about
    // absent client_id/redirect_uri, which is exactly how far this test means to get.
    expect(authorize.statusCode).not.toBe(302);
    expect(authorize.statusCode).toBe(400);
  });

  it('rejects a POST with no form token', async () => {
    const app = await appWith(store);
    const token = await mintToken(app, 'bot:reviewer');

    const res = await app.inject({
      method: 'POST',
      url: TOKEN_LOGIN_PATH,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ token }).toString(),
    });

    expect(res.statusCode).toBe(403);
    expect(sessionFrom(res)).toBeNull();
  });

  it('rejects a form token minted from a different secret', async () => {
    // Login CSRF: sameSite=lax does not stop a top-level cross-site form POST, and the
    // next thing this flow does is ask the browser to approve durable write access.
    const app = await appWith(store);
    const token = await mintToken(app, 'bot:reviewer');

    const res = await app.inject({
      method: 'POST',
      url: TOKEN_LOGIN_PATH,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ token, form_token: formToken('somebody-elses-secret', Date.now()) }).toString(),
    });

    expect(res.statusCode).toBe(403);
    expect(sessionFrom(res)).toBeNull();
  });

  it('rejects a form token from a stale bucket but accepts the previous one', async () => {
    const app = await appWith(store);
    const token = await mintToken(app, 'bot:reviewer');
    const hourMs = 60 * 60 * 1000;

    const stale = await post(app, { token }, Date.now() - 3 * hourMs);
    expect(stale.statusCode).toBe(403);

    const recent = await post(app, { token }, Date.now() - hourMs);
    expect(recent.statusCode).toBe(302);
  });

  it('refuses an unknown token without saying why', async () => {
    const app = await appWith(store);
    const res = await post(app, { token: generateAccessToken().token });

    expect(res.statusCode).toBe(401);
    expect(sessionFrom(res)).toBeNull();
    expect(res.body).toContain('not valid');
    expect(res.body).not.toMatch(/expired|revoked|unknown account/i);
  });

  it('refuses a credential that is not a personal access token at all', async () => {
    const app = await appWith(store);
    const res = await post(app, { token: 'gdpl_oat_something_else' });
    expect(res.statusCode).toBe(401);
    expect(sessionFrom(res)).toBeNull();
  });

  it('refuses an empty submission', async () => {
    const app = await appWith(store);
    const res = await post(app, { token: '   ' });
    expect(res.statusCode).toBe(400);
    expect(sessionFrom(res)).toBeNull();
  });

  it('refuses an expired token', async () => {
    const app = await appWith(store);
    const generated = generateAccessToken();
    await store.upsertUser({ uid: 'bot:stale' });
    await store.createAccessToken({
      tokenId: generated.tokenId,
      uid: 'bot:stale',
      secretHash: generated.secretHash,
      name: 'expired',
      createdAt: new Date(Date.now() - 200 * 24 * 3600 * 1000).toISOString(),
      createdByUid: 'g:boss',
      expiresAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    });

    const res = await post(app, { token: generated.token });

    expect(res.statusCode).toBe(401);
    expect(sessionFrom(res)).toBeNull();
  });

  it('refuses a blocked account', async () => {
    const app = await appWith(store);
    const token = await mintToken(app, 'bot:reviewer');
    await store.upsertUser({ uid: 'bot:reviewer', tier: 'blocked' });

    const res = await post(app, { token });

    expect(res.statusCode).toBe(403);
    expect(sessionFrom(res)).toBeNull();
  });
});
