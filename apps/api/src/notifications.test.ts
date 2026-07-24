import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { InMemoryStore } from './store.js';

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
    link: '#/play/sky-dodge',
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

  it('POST /api/notifications/clear deletes read notifications but keeps unread', async () => {
    await seed(store, 'g:me'); // sub-1-published (unread)
    await store.createNotification('g:me', {
      id: 'sub-2-building',
      type: 'submission.building',
      titleKey: 'k',
      bodyKey: 'b',
      params: {},
      link: '#/status/x',
    });
    await store.markNotificationsRead('g:me', ['sub-1-published']); // read only the first
    const app = await buildApp({ store, sessionSecret });
    const res = await app.inject({
      method: 'POST',
      url: '/api/notifications/clear',
      headers: authHeaders('g:me'),
    });
    expect(res.statusCode).toBe(200);
    const list = await store.listNotifications('g:me');
    expect(list.map((n) => n.id)).toEqual(['sub-2-building']); // unread survived
    await app.close();
  });

  it('POST /api/notifications/clear requires a session', async () => {
    const app = await buildApp({ store, sessionSecret });
    const res = await app.inject({ method: 'POST', url: '/api/notifications/clear' });
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
