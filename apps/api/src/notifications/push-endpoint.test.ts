import { describe, expect, it, vi } from 'vitest';
import { isAllowedPushEndpoint } from './push-endpoint.js';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';
import { WebPushPusher } from './pusher.js';

describe('isAllowedPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://android.googleapis.com/gcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
    'https://web.push.apple.com/abc',
    'https://FCM.googleapis.com:443/fcm/send/abc',
  ])('accepts the browser push service %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    'not-a-url',
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://user:pass@fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com.example.com/abc',
    'https://evilfcm.googleapis.com.attacker.test/abc',
    'https://notfcm.googleapis.co/abc',
    'https://xpush.apple.com/abc',
    'https://push.example.com/abc',
    'https://127.0.0.1/abc',
    'https://[::1]/abc',
    'https://localhost/abc',
    'https://169.254.169.254/latest',
    'https://googleapis.com/abc',
  ])('refuses %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});

describe('WebPushPusher endpoint guard', () => {
  it('never sends to a host outside the allow-list, and reports gone so it is pruned', async () => {
    const sendImpl = vi.fn().mockResolvedValue(undefined);
    const pusher = new WebPushPusher({ publicKey: 'pub', privateKey: 'priv', subject: 'mailto:x@y.z', sendImpl });
    const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };
    const res = await pusher.send(sub, { title: 't', body: 'b', url: 'https://www.gamedev.pl/', tag: 't' });
    expect(res).toEqual({ outcome: 'gone' });
    expect(sendImpl).not.toHaveBeenCalled();
  });
});

describe('POST /api/push/subscribe endpoint guard', () => {
  it('rejects an endpoint that is not a browser push service', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:me' });
    const sessionSecret = 'dev-session-secret-change-me';
    const app = await buildApp({ store, sessionSecret });
    const res = await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:me', sessionSecret)}` },
      payload: { subscription: { endpoint: 'https://push.example.com/sub-1', keys: { p256dh: 'p', auth: 'a' } } },
    });
    expect(res.statusCode).toBe(400);
    expect(await store.listPushSubscriptions('g:me')).toHaveLength(0);
    await app.close();
  });
});
