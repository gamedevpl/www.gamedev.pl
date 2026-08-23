import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../auth.js';
import { InMemoryStore } from '../store.js';

const sessionSecret = 'dev-session-secret-change-me';

function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

async function seed(store: InMemoryStore, uid: string) {
  await store.createNotification(uid, {
    id: 'sub-1-published',
    type: 'submission.published',
    titleKey: 'notifications.submission.published.title',
    bodyKey: 'notifications.submission.published.body',
    params: { title: 'Sky Dodge' },
    link: '/play/sky-dodge',
  });
}

describe('notification routes', () => {
  let store: InMemoryStore;
  beforeEach(async () => {
    store = new InMemoryStore();
    // The auth hook resolves request.user via store.getUser(uid); the caller must exist.
    await store.upsertUser({ uid: 'g:me' });
  });

  it('GET /api/notifications requires a session', async () => {
    const app = await buildApp({ store, sessionSecret });
    const res = await app.inject({ method: 'GET', url: '/api/notifications' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('GET /api/notifications returns the caller-owned list', async () => {
    await seed(store, 'g:me');
    const app = await buildApp({ store, sessionSecret });
    const res = await app.inject({ method: 'GET', url: '/api/notifications', headers: authHeaders('g:me') });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].id).toBe('sub-1-published');
    await app.close();
  });

  it('does not leak another user’s notifications', async () => {
    await seed(store, 'g:other');
    const app = await buildApp({ store, sessionSecret });
    const res = await app.inject({ method: 'GET', url: '/api/notifications', headers: authHeaders('g:me') });
    expect(res.json().notifications).toEqual([]);
    await app.close();
  });

  it('POST /api/notifications/read marks all as read', async () => {
    await seed(store, 'g:me');
    const app = await buildApp({ store, sessionSecret });
    const res = await app.inject({
      method: 'POST',
      url: '/api/notifications/read',
      headers: authHeaders('g:me'),
      payload: { all: true },
    });
    expect(res.statusCode).toBe(200);
    const list = await store.listNotifications('g:me');
    expect(list[0].readAt).not.toBeNull();
    await app.close();
  });

  async function seedTwo(uid: string) {
    await seed(store, uid); // sub-1-published
    await store.createNotification(uid, {
      id: 'sub-2-building',
      type: 'submission.building',
      titleKey: 'k',
      bodyKey: 'b',
      params: {},
      link: '/status/x',
    });
  }

  it('POST /api/notifications/clear with { all: true } deletes the whole list', async () => {
    await seedTwo('g:me');
    const app = await buildApp({ store, sessionSecret });
    const res = await app.inject({
      method: 'POST',
      url: '/api/notifications/clear',
      headers: authHeaders('g:me'),
      payload: { all: true },
    });
    expect(res.statusCode).toBe(200);
    expect(await store.listNotifications('g:me')).toEqual([]);
    await app.close();
  });

  it('POST /api/notifications/clear with { ids } dismisses just those', async () => {
    await seedTwo('g:me');
    const app = await buildApp({ store, sessionSecret });
    const res = await app.inject({
      method: 'POST',
      url: '/api/notifications/clear',
      headers: authHeaders('g:me'),
      payload: { ids: ['sub-1-published'] },
    });
    expect(res.statusCode).toBe(200);
    const list = await store.listNotifications('g:me');
    expect(list.map((n) => n.id)).toEqual(['sub-2-building']);
    await app.close();
  });

  it('POST /api/notifications/clear rejects an empty body', async () => {
    const app = await buildApp({ store, sessionSecret });
    const res = await app.inject({
      method: 'POST',
      url: '/api/notifications/clear',
      headers: authHeaders('g:me'),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('POST /api/notifications/clear requires a session', async () => {
    const app = await buildApp({ store, sessionSecret });
    const res = await app.inject({ method: 'POST', url: '/api/notifications/clear', payload: { all: true } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('POST /api/notifications/read rejects an empty body', async () => {
    const app = await buildApp({ store, sessionSecret });
    const res = await app.inject({
      method: 'POST',
      url: '/api/notifications/read',
      headers: authHeaders('g:me'),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('notification preferences', () => {
  const sessionSecret = 'dev-session-secret-change-me';

  async function appFor(store: InMemoryStore) {
    return buildApp({ store, sessionSecret });
  }

  function auth(uid: string) {
    return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
  }

  it('reports both switches as on for a fresh account', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:me' });
    const app = await appFor(store);

    const res = await app.inject({ method: 'GET', url: '/api/me/notification-preferences', headers: auth('g:me') });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ digest: true, email: true });
    await app.close();
  });

  it('turns the digest off and back on again', async () => {
    // The half that was missing entirely: an opt-out reachable only from an email link is
    // a decision a person cannot revise.
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:me' });
    const app = await appFor(store);

    const off = await app.inject({
      method: 'PUT',
      url: '/api/me/notification-preferences',
      headers: auth('g:me'),
      payload: { digest: false },
    });
    expect(off.json()).toEqual({ digest: false, email: true });
    expect((await store.getUser('g:me'))?.digestOptOutAt).toBeTruthy();

    const on = await app.inject({
      method: 'PUT',
      url: '/api/me/notification-preferences',
      headers: auth('g:me'),
      payload: { digest: true },
    });
    expect(on.json()).toEqual({ digest: true, email: true });
    expect((await store.getUser('g:me'))?.digestOptOutAt).toBeNull();
    await app.close();
  });

  it('lets someone who unsubscribed by email come back', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:me' });
    await store.setEmailUnsubscribed('g:me', '2026-07-01T00:00:00.000Z');
    const app = await appFor(store);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/me/notification-preferences',
      headers: auth('g:me'),
      payload: { email: true },
    });

    expect(res.json()).toEqual({ digest: true, email: true });
    await app.close();
  });

  it('leaves a switch it was not told about alone', async () => {
    // A client that knows about one preference must not reset another it has never heard
    // of — the shape of bug that silently re-subscribes people.
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:me' });
    await store.setEmailUnsubscribed('g:me', '2026-07-01T00:00:00.000Z');
    const app = await appFor(store);

    await app.inject({
      method: 'PUT',
      url: '/api/me/notification-preferences',
      headers: auth('g:me'),
      payload: { digest: false },
    });

    expect((await store.getUser('g:me'))?.emailUnsubscribedAt).toBe('2026-07-01T00:00:00.000Z');
    await app.close();
  });

  it('requires a session', async () => {
    const app = await appFor(new InMemoryStore());
    const res = await app.inject({ method: 'GET', url: '/api/me/notification-preferences' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
