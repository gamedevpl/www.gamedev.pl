import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import { mintUnsubscribeToken } from './unsubscribe-token.js';

const sessionSecret = 'dev-session-secret-change-me';

describe('GET /api/email/unsubscribe', () => {
  let store: InMemoryStore;
  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:me', email: 'me@example.com' });
  });

  it('unsubscribes the token holder and confirms', async () => {
    const app = await buildApp({ store, sessionSecret });
    const token = mintUnsubscribeToken('g:me', sessionSecret);
    const res = await app.inject({ method: 'GET', url: `/api/email/unsubscribe?token=${token}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Unsubscribed');
    expect((await store.getUser('g:me'))?.emailUnsubscribedAt).toBeTruthy();
    await app.close();
  });

  it('rejects an invalid token without changing state', async () => {
    const app = await buildApp({ store, sessionSecret });
    const res = await app.inject({ method: 'GET', url: '/api/email/unsubscribe?token=forged' });
    expect(res.statusCode).toBe(400);
    expect((await store.getUser('g:me'))?.emailUnsubscribedAt ?? null).toBeNull();
    await app.close();
  });

  it('is reachable without a session even in private-beta mode (wall-exempt)', async () => {
    const app = await buildApp({ store, sessionSecret, betaAllowedUids: 'g:me' });
    const token = mintUnsubscribeToken('g:me', sessionSecret);
    const res = await app.inject({ method: 'GET', url: `/api/email/unsubscribe?token=${token}` });
    expect(res.statusCode).toBe(200); // not 401 from the wall
    await app.close();
  });
});

describe('GET /api/email/unsubscribe?scope=digest', () => {
  const sessionSecret = 'dev-session-secret-change-me';

  it('turns off only the weekly digest, leaving build email alone', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:me', email: 'me@example.com' });
    const app = await buildApp({ store, sessionSecret });
    const token = mintUnsubscribeToken('g:me', sessionSecret);

    const res = await app.inject({ method: 'GET', url: `/api/email/unsubscribe?token=${token}&scope=digest` });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Weekly digest off');
    const user = await store.getUser('g:me');
    expect(user?.digestOptOutAt).toBeTruthy();
    // The message they actually want survives — that is the whole point of the scope.
    expect(user?.emailUnsubscribedAt).toBeFalsy();
    await app.close();
  });

  it('falls back to the full unsubscribe for an unrecognised scope', async () => {
    // Someone clicked a link to make mail stop. Anything we cannot parse should err
    // toward stopping more of it, not less.
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:me', email: 'me@example.com' });
    const app = await buildApp({ store, sessionSecret });
    const token = mintUnsubscribeToken('g:me', sessionSecret);

    const res = await app.inject({ method: 'GET', url: `/api/email/unsubscribe?token=${token}&scope=nonsense` });

    expect(res.statusCode).toBe(200);
    expect((await store.getUser('g:me'))?.emailUnsubscribedAt).toBeTruthy();
    await app.close();
  });
});
