import { beforeEach, describe, expect, it } from 'vitest';
import { generateAccessToken } from './access-token.js';
import { buildApp } from './app.js';
import { mintSessionToken, readSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { newCsrfNonce, originAllowed, sanitizeOAuthReturnPath, TOKEN_LOGIN_PATH } from './oauth-token-login.js';
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

const CSRF_COOKIE = 'gamedev_token_login_csrf';

function cookieFrom(res: { headers: Record<string, unknown> }, name: string): string | null {
  const raw = res.headers['set-cookie'];
  const all = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const hit = all.find((c) => c.startsWith(`${name}=`));
  if (!hit) return null;
  const value = hit.slice(`${name}=`.length).split(';')[0];
  return value === '' ? null : value;
}

/**
 * The real browser sequence: load the page, keep the CSRF cookie it set, submit the
 * nonce it rendered. Tests that skip the GET are testing an attacker, not a visitor.
 */
async function visitAndPost(
  app: Awaited<ReturnType<typeof buildApp>>,
  fields: Record<string, string>,
): Promise<Awaited<ReturnType<typeof app.inject>>> {
  const page = await app.inject({ method: 'GET', url: TOKEN_LOGIN_PATH });
  const nonce = cookieFrom(page, CSRF_COOKIE)!;
  expect(page.body).toContain(`name="form_token" value="${nonce}"`);
  return post(app, { form_token: nonce, ...fields }, `${CSRF_COOKIE}=${nonce}`);
}

function post(
  app: Awaited<ReturnType<typeof buildApp>>,
  fields: Record<string, string>,
  cookie?: string,
): ReturnType<typeof app.inject> {
  return app.inject({
    method: 'POST',
    url: TOKEN_LOGIN_PATH,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(cookie ? { cookie } : {}),
    },
    payload: new URLSearchParams(fields).toString(),
  });
}

function sessionFrom(res: { headers: Record<string, unknown> }): string | null {
  return cookieFrom(res, SESSION_COOKIE_NAME);
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

describe('originAllowed', () => {
  const req = (origin?: string) => ({ headers: origin === undefined ? {} : { origin } });

  it('accepts the canonical origin and refuses any other, in production', () => {
    expect(originAllowed(req('https://www.gamedev.pl'), true)).toBe(true);
    expect(originAllowed(req('https://evil.example'), true)).toBe(false);
    expect(originAllowed(req('http://www.gamedev.pl'), true)).toBe(false);
  });

  it('allows a request that sends no Origin at all', () => {
    // Not every form POST carries one, and this is the third layer behind
    // SameSite=Strict and the double-submit nonce — it must not be the one that
    // decides a legitimate submission is an attack.
    expect(originAllowed(req(), true)).toBe(true);
    expect(originAllowed(req(''), true)).toBe(true);
  });

  it('does not enforce outside production, where the canonical origin is not the dev one', () => {
    expect(originAllowed(req('http://localhost:5173'), false)).toBe(true);
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

    const res = await visitAndPost(app, { token });

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

    const res = await visitAndPost(app, { token });

    expect(readSessionToken(sessionFrom(res)!, sessionSecret).src).toBe('token');
  });

  it('refuses to mint further tokens with the cookie it just handed out', async () => {
    // The concrete consequence of the stamp above, asserted end to end rather than by
    // reading a claim: minting is an operator surface and must stay session-only.
    const app = await appWith(store);
    await store.upsertUser({ uid: 'g:boss2' });
    const token = await mintToken(app, 'g:boss');

    const res = await visitAndPost(app, { token });
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

    const res = await visitAndPost(app, { token, oauth_return: '/oauth/authorize?client_id=abc' });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/oauth/authorize?client_id=abc');
  });

  it('ignores an off-site oauth_return and lands in the studio instead', async () => {
    const app = await appWith(store);
    const token = await mintToken(app, 'bot:reviewer');

    const res = await visitAndPost(app, { token, oauth_return: 'https://evil.example/steal' });

    expect(res.headers.location).toBe('/studio');
  });

  it('reaches the consent screen with the cookie it minted', async () => {
    // The end the page exists for: an account with no Google identity, in private beta,
    // getting far enough to approve an MCP client.
    const app = await appWith(store, { betaAllowedUids: 'g:boss' });
    const token = await mintToken(app, 'bot:reviewer');
    const cookie = sessionFrom(await visitAndPost(app, { token }))!;

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

    const res = await post(app, { token });

    expect(res.statusCode).toBe(403);
    expect(sessionFrom(res)).toBeNull();
  });

  it('rejects a nonce the attacker fetched for themselves', async () => {
    // The bypass this replaced: the form token used to be an HMAC over a time bucket,
    // identical for every visitor that hour. Anyone could load the page, read a valid
    // token, and put it in a cross-site form — the check passed, and the login CSRF it
    // existed to stop went through. Binding the nonce to a cookie is what closes it,
    // so the attack has to be the test.
    const app = await appWith(store);
    const token = await mintToken(app, 'bot:reviewer');

    // The attacker loads the page and keeps the nonce it rendered...
    const attackerPage = await app.inject({ method: 'GET', url: TOKEN_LOGIN_PATH });
    const attackerNonce = cookieFrom(attackerPage, CSRF_COOKIE)!;
    expect(attackerPage.body).toContain(`value="${attackerNonce}"`);

    // ...and puts it in a form the victim's browser submits. That browser carries no
    // CSRF cookie of its own, because SameSite=Strict withholds it cross-site.
    const res = await post(app, { token, form_token: attackerNonce });

    expect(res.statusCode).toBe(403);
    expect(sessionFrom(res)).toBeNull();
  });

  it("rejects a nonce that is not the one in this browser's cookie", async () => {
    const app = await appWith(store);
    const token = await mintToken(app, 'bot:reviewer');
    const page = await app.inject({ method: 'GET', url: TOKEN_LOGIN_PATH });
    const mine = cookieFrom(page, CSRF_COOKIE)!;

    const res = await post(app, { token, form_token: newCsrfNonce() }, `${CSRF_COOKIE}=${mine}`);

    expect(res.statusCode).toBe(403);
    expect(sessionFrom(res)).toBeNull();
  });

  it('rejects a malformed nonce without measuring it against anything', async () => {
    const app = await appWith(store);
    const token = await mintToken(app, 'bot:reviewer');
    const nonce = cookieFrom(await app.inject({ method: 'GET', url: TOKEN_LOGIN_PATH }), CSRF_COOKIE)!;

    for (const bad of ['', 'x'.repeat(100_000), `${nonce}!`, nonce.slice(0, 42)]) {
      const res = await post(app, { token, form_token: bad }, `${CSRF_COOKIE}=${nonce}`);
      expect(res.statusCode).toBe(403);
      expect(sessionFrom(res)).toBeNull();
    }
  });

  it('hands back a submittable form when it refuses', async () => {
    // A refusal that renders a dead nonce would strand the visitor in a loop of
    // "that form expired" with no way out.
    const app = await appWith(store);
    const token = await mintToken(app, 'bot:reviewer');

    const refused = await post(app, { token });
    expect(refused.statusCode).toBe(403);

    const nonce = cookieFrom(refused, CSRF_COOKIE)!;
    expect(refused.body).toContain(`name="form_token" value="${nonce}"`);

    const retry = await post(app, { token, form_token: nonce }, `${CSRF_COOKIE}=${nonce}`);
    expect(retry.statusCode).toBe(302);
  });

  it('reuses the nonce a second tab already holds', async () => {
    const app = await appWith(store);
    const first = await app.inject({ method: 'GET', url: TOKEN_LOGIN_PATH });
    const nonce = cookieFrom(first, CSRF_COOKIE)!;

    const second = await app.inject({
      method: 'GET',
      url: TOKEN_LOGIN_PATH,
      headers: { cookie: `${CSRF_COOKIE}=${nonce}` },
    });

    // No re-issue, and the same value rendered — otherwise opening a second tab would
    // silently break the form sitting in the first.
    expect(cookieFrom(second, CSRF_COOKIE)).toBeNull();
    expect(second.body).toContain(`value="${nonce}"`);
  });

  it('clears the nonce once it has been spent', async () => {
    const app = await appWith(store);
    const token = await mintToken(app, 'bot:reviewer');
    const nonce = cookieFrom(await app.inject({ method: 'GET', url: TOKEN_LOGIN_PATH }), CSRF_COOKIE)!;

    const res = await post(app, { token, form_token: nonce }, `${CSRF_COOKIE}=${nonce}`);

    expect(res.statusCode).toBe(302);
    const setCookies = res.headers['set-cookie'] as string[];
    expect(setCookies.some((c) => c.startsWith(`${CSRF_COOKIE}=;`))).toBe(true);
  });

  it('refuses an unknown token without saying why', async () => {
    const app = await appWith(store);
    const res = await visitAndPost(app, { token: generateAccessToken().token });

    expect(res.statusCode).toBe(401);
    expect(sessionFrom(res)).toBeNull();
    expect(res.body).toContain('not valid');
    expect(res.body).not.toMatch(/expired|revoked|unknown account/i);
  });

  it('refuses a credential that is not a personal access token at all', async () => {
    const app = await appWith(store);
    const res = await visitAndPost(app, { token: 'gdpl_oat_something_else' });
    expect(res.statusCode).toBe(401);
    expect(sessionFrom(res)).toBeNull();
  });

  it('refuses an empty submission', async () => {
    const app = await appWith(store);
    const res = await visitAndPost(app, { token: '   ' });
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

    const res = await visitAndPost(app, { token: generated.token });

    expect(res.statusCode).toBe(401);
    expect(sessionFrom(res)).toBeNull();
  });

  it('refuses a blocked account', async () => {
    const app = await appWith(store);
    const token = await mintToken(app, 'bot:reviewer');
    await store.upsertUser({ uid: 'bot:reviewer', tier: 'blocked' });

    const res = await visitAndPost(app, { token });

    expect(res.statusCode).toBe(403);
    expect(sessionFrom(res)).toBeNull();
  });
});
