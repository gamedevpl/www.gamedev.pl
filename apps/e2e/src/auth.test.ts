import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request, type APIRequestContext } from 'playwright-core';
import { BASE_URL, proxyOptions, signedInApiContext, storageStatePath } from './browser.js';

/**
 * The credential contract, checked without a browser. If these fail, every browser
 * test below is failing for the same reason and their output is noise.
 */
const hasToken = Boolean(process.env.GAMEDEV_ACCESS_TOKEN);
if (!hasToken) {
  console.warn('[e2e] SKIPPED auth: GAMEDEV_ACCESS_TOKEN not set (see docs/agent-access-tokens.md)');
}

describe.skipIf(!hasToken)('agent access token', () => {
  let api: APIRequestContext;

  beforeAll(async () => {
    api = await signedInApiContext();
  });

  afterAll(async () => {
    await api?.dispose();
  });

  it('authenticates as a bot account over the bearer header', async () => {
    // Cookie-less on purpose: /api/auth/me takes either credential, so asking it
    // through the signed-in context would answer 200 from the cookie and tell us
    // nothing about the bearer path this test exists to cover.
    const clean = await request.newContext({ baseURL: BASE_URL, ...proxyOptions() });
    try {
      const res = await clean.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${process.env.GAMEDEV_ACCESS_TOKEN}` },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();

      // Automation must never run as a person: bot: uids are excluded from creator
      // metrics, so a human token pasted into the secret would quietly pollute the
      // product numbers. Same guard the deploy workflow's authenticated smoke applies.
      expect(body.user?.uid).toMatch(/^bot:/);
    } finally {
      await clean.dispose();
    }
  });

  it('issues a hardened session cookie from the token exchange', async () => {
    // Asserted against the state globalSetup already obtained rather than by calling
    // /api/auth/session again: that endpoint allows 20/hour, and a test that spends
    // one every run is a test that eventually fails as a 429 looking like a revoked
    // token. The exchange itself is covered — globalSetup throws if it does not 200.
    const storageState = storageStatePath();
    expect(storageState, 'globalSetup should have exported the session state').toBeTruthy();

    const state = JSON.parse(await readFile(storageState!, 'utf8')) as {
      cookies: { name: string; domain: string; httpOnly: boolean; secure: boolean; sameSite: string }[];
    };
    // `__session` is the one name Firebase Hosting forwards to the backend (FH-01).
    const session = state.cookies.find((c) => c.name === '__session');
    expect(session, 'exchange should set the __session cookie').toBeTruthy();

    // The flags are the point of the cookie, not decoration: HttpOnly keeps it away
    // from a generated game's scripts, Secure keeps it off plaintext, and SameSite
    // blunts cross-site use.
    expect(session!.httpOnly).toBe(true);
    expect(session!.secure).toBe(true);
    expect(session!.sameSite).toBe('Lax');
  });

  it('accepts that session cookie on a session-walled route', async () => {
    // The other half of the contract: the cookie is not just well-formed, it works.
    const res = await api.get('/api/notifications');
    expect(res.status()).toBe(200);
  });

  it('rejects a forged token rather than erroring on it', async () => {
    // A cookie-less context on purpose. The exchange above left a valid session
    // cookie on `api`, and /api/auth/me accepts either credential — reusing it here
    // authenticates by cookie and reports 200 no matter how bogus the bearer is,
    // which looks like the token wall failing open when nothing is wrong.
    const clean = await request.newContext({ baseURL: BASE_URL, ...proxyOptions() });
    try {
      // Assembled at runtime: a well-formed gdpl_pat_ literal in the source would
      // (correctly) trip gitleaks. Same construction as the deploy smoke.
      const forged = `gdpl_pat_${'0'.repeat(16)}_${'A'.repeat(43)}`;
      const res = await clean.get('/api/auth/me', { headers: { Authorization: `Bearer ${forged}` } });

      // 401, never a 500 and never a session: the token path must fail closed.
      expect(res.status()).toBe(401);
    } finally {
      await clean.dispose();
    }
  });
});
