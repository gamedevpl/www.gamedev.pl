import { describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { InMemoryStore } from './store.js';
import { OPS_TEST_BEARER, opsHeaders, opsInject, opsTestVerifier, opsUrl } from './ops-console.fixture.js';

const sessionSecret = 'dev-session-secret-change-me';

async function appWith(store = new InMemoryStore()) {
  await store.upsertUser({ uid: 'g:boss' });
  await store.upsertUser({ uid: 'g:friend' });
  const verify = vi.fn(opsTestVerifier.verify);
  const app = await buildApp({ store, sessionSecret, adminUids: 'g:boss', opsConsole: { verifier: { verify } } });
  return { app, store, verify };
}

describe('the ops console door', () => {
  it('reaches an operator route as the named operator', async () => {
    const { app } = await appWith();
    const res = await opsInject(app, 'g:boss', { method: 'GET', url: '/api/admin/proposals' });
    expect(res.statusCode).toBe(200);
  });

  it('answers 404 to the public /api/admin path, even with an admin session', async () => {
    const { app } = await appWith();
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/proposals',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:boss', sessionSecret)}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it.each([
    ['no ID token', { 'x-operator-uid': 'g:boss' }],
    ['a wrong ID token', { authorization: 'Bearer forged', 'x-operator-uid': 'g:boss' }],
    ['no operator', { authorization: OPS_TEST_BEARER }],
    ['an operator outside ADMIN_UIDS', opsHeaders('g:friend')],
    ['an operator with no account', opsHeaders('g:ghost')],
  ])('refuses %s with a 404', async (_label, headers) => {
    const { app } = await appWith();
    const res = await app.inject({ method: 'GET', url: opsUrl('/api/admin/proposals'), headers });
    expect(res.statusCode).toBe(404);
  });

  it('refuses a blocked operator', async () => {
    const store = new InMemoryStore();
    const { app } = await appWith(store);
    await store.upsertUser({ uid: 'g:boss', tier: 'blocked' });
    const res = await opsInject(app, 'g:boss', { method: 'GET', url: '/api/admin/proposals' });
    expect(res.statusCode).toBe(404);
  });

  it.each([
    ['a route outside the allowlist', 'GET', '/api/me'],
    ['a read on a write-only route', 'GET', '/api/admin/jobs/1/retry'],
    ['a dot segment out of the prefix', 'POST', '/api/admin/jobs/%2e%2e/retry'],
  ])('never rewrites %s, and never checks the token for it', async (_label, method, url) => {
    const { app, verify } = await appWith();
    const res = await app.inject({ method: method as 'GET' | 'POST', url: opsUrl(url), headers: opsHeaders('g:boss') });
    expect(res.statusCode).toBe(404);
    expect(verify).not.toHaveBeenCalled();
  });

  it('ignores a session cookie on the door: the operator header decides', async () => {
    const { app } = await appWith();
    const res = await app.inject({
      method: 'GET',
      url: opsUrl('/api/admin/proposals'),
      headers: {
        ...opsHeaders('g:friend'),
        cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:boss', sessionSecret)}`,
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('gives a browser admin session no operator authority outside /api/admin', async () => {
    const { app } = await appWith();
    const res = await app.inject({
      method: 'POST',
      url: '/api/proposals/p1/accept',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:boss', sessionSecret)}` },
    });
    expect(res.statusCode).not.toBe(200);
  });

  it('lets a percent-encoded flag id through to the resolve route', async () => {
    const { app } = await appWith();
    const res = await opsInject(app, 'g:boss', {
      method: 'POST',
      url: '/api/admin/moderation-flags/sky-dodge%3Adev%3Areviewer/resolve',
      payload: { action: 'dismiss' },
    });
    expect(res.statusCode).not.toBe(404);
  });
});
