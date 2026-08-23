import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';

const sessionSecret = 'dev-session-secret-change-me';

function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

const subscription = {
  endpoint: 'https://push.example.com/sub-1',
  keys: { p256dh: 'BPk...', auth: 'auth123' },
};

describe('push routes', () => {
  let store: InMemoryStore;
  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:me' });
  });

  it('all push routes require a session', async () => {
    const app = await buildApp({ store, sessionSecret });
    for (const [method, url] of [
      ['GET', '/api/push/config'],
      ['POST', '/api/push/subscribe'],
      ['POST', '/api/push/unsubscribe'],
    ] as const) {
      const res = await app.inject({ method, url, payload: method === 'POST' ? {} : undefined });
      expect(res.statusCode).toBe(401);
    }
    await app.close();
  });

  it('GET /api/push/config reports disabled when no VAPID key is configured', async () => {
    const app = await buildApp({ store, sessionSecret });
    const res = await app.inject({ method: 'GET', url: '/api/push/config', headers: authHeaders('g:me') });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ enabled: false, vapidPublicKey: null });
    await app.close();
  });

  it('subscribe persists the subscription under the caller', async () => {
    const app = await buildApp({ store, sessionSecret });
    const res = await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: authHeaders('g:me'),
      payload: { subscription },
    });
    expect(res.statusCode).toBe(200);
    const stored = await store.listPushSubscriptions('g:me');
    expect(stored).toHaveLength(1);
    expect(stored[0].endpoint).toBe(subscription.endpoint);
    await app.close();
  });

  it('subscribe is idempotent by endpoint', async () => {
    const app = await buildApp({ store, sessionSecret });
    for (let i = 0; i < 2; i += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/push/subscribe',
        headers: authHeaders('g:me'),
        payload: { subscription },
      });
    }
    expect(await store.listPushSubscriptions('g:me')).toHaveLength(1);
    await app.close();
  });

  it('rejects a malformed subscription', async () => {
    const app = await buildApp({ store, sessionSecret });
    const res = await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: authHeaders('g:me'),
      payload: { subscription: { endpoint: 'not-a-url', keys: {} } },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('unsubscribe removes the caller’s subscription', async () => {
    await store.savePushSubscription('g:me', subscription);
    const app = await buildApp({ store, sessionSecret });
    const res = await app.inject({
      method: 'POST',
      url: '/api/push/unsubscribe',
      headers: authHeaders('g:me'),
      payload: { endpoint: subscription.endpoint },
    });
    expect(res.statusCode).toBe(200);
    expect(await store.listPushSubscriptions('g:me')).toHaveLength(0);
    await app.close();
  });
});

describe('InMemoryStore push subscriptions', () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('is isolated per user', async () => {
    await store.savePushSubscription('g:1', subscription);
    expect(await store.listPushSubscriptions('g:2')).toEqual([]);
  });

  it('overwrites the same endpoint instead of duplicating', async () => {
    await store.savePushSubscription('g:1', subscription);
    await store.savePushSubscription('g:1', { ...subscription, keys: { p256dh: 'new', auth: 'new' } });
    const list = await store.listPushSubscriptions('g:1');
    expect(list).toHaveLength(1);
    expect(list[0].keys.auth).toBe('new');
  });
});
