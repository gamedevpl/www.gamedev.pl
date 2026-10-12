import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeFirestore } from '../store/fake-firestore.js';
import { FirestoreStore, InMemoryStore } from './store.js';
import { buildOAuthApp, enableCliSurface, sessionCookie, SESSION_SECRET } from './oauth-cli-test-app.js';
import { consentToken } from './oauth-consent.js';
import { DEVICE_GRANT_TYPE } from './oauth-device.js';
import { GAMEDEV_CLI_CLIENT_ID } from './oauth-first-party.js';

describe('device login across backend instances', () => {
  const apps: FastifyInstance[] = [];
  let restore: () => void;
  beforeEach(() => {
    restore = enableCliSurface();
  });
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    restore();
  });

  const consent = consentToken({
    uid: 'g:boss',
    clientId: GAMEDEV_CLI_CLIENT_ID,
    codeChallenge: 'device',
    secret: SESSION_SECRET,
  });
  const poll = (app: FastifyInstance, deviceCode: string) =>
    app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: DEVICE_GRANT_TYPE,
        device_code: deviceCode,
        client_id: GAMEDEV_CLI_CLIENT_ID,
      }).toString(),
    });

  it('creates, approves and exchanges on three separate instances sharing Firestore', async () => {
    const fake = fakeFirestore();
    const stores = Array.from({ length: 3 }, () => new FirestoreStore(fake.db));
    await stores[0]!.upsertUser({ uid: 'g:boss', email: 'boss@example.com' });
    for (const store of stores) apps.push(await buildOAuthApp(store));
    const created = await apps[0]!.inject({
      method: 'POST',
      url: '/oauth/device',
      payload: { client_id: GAMEDEV_CLI_CLIENT_ID, device: 'codespaces-box' },
    });
    expect(created.statusCode).toBe(200);
    const { user_code: userCode, device_code: deviceCode } = created.json();
    const page = await apps[1]!.inject({
      method: 'GET',
      url: `/device?user_code=${userCode}`,
      headers: { cookie: sessionCookie('g:boss') },
    });
    expect(page.body).toContain('codespaces-box');
    expect(page.body).toContain('Check that this code matches your terminal');
    expect(page.body).not.toContain(deviceCode);
    const approved = await apps[1]!.inject({
      method: 'POST',
      url: '/device',
      headers: { cookie: sessionCookie('g:boss') },
      payload: { user_code: userCode, action: 'approve', consent_token: consent, disclosed_scope: 'creator' },
    });
    expect(approved.body).toContain('Approved. Return to your terminal.');
    const exchanged = await poll(apps[2]!, deviceCode);
    expect(exchanged.statusCode).toBe(200);
    const profile = await apps[0]!.inject({
      method: 'GET',
      url: '/api/me/profile',
      headers: { authorization: `Bearer ${exchanged.json().access_token}` },
    });
    expect(profile.statusCode).toBe(200);
    expect((await poll(apps[1]!, deviceCode)).json()).toEqual({ error: 'invalid_grant' });
    expect(await stores[0]!.listOAuthGrantsByOwner('g:boss')).toHaveLength(1);
  });

  it('requires review when a code is entered without first displaying its permissions', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss', email: 'boss@example.com' });
    const app = await buildOAuthApp(store);
    apps.push(app);
    const created = await app.inject({
      method: 'POST',
      url: '/oauth/device',
      payload: { client_id: GAMEDEV_CLI_CLIENT_ID, device: 'remote-box' },
    });
    const { user_code: userCode, device_code: deviceCode } = created.json();
    const review = await app.inject({
      method: 'POST',
      url: '/device',
      headers: { cookie: sessionCookie('g:boss') },
      payload: { user_code: userCode, action: 'approve', consent_token: consent },
    });
    expect(review.body).toContain('Review the permissions');
    expect(review.body).toContain('remote-box');
    expect((await poll(app, deviceCode)).json()).toEqual({ error: 'authorization_pending' });
  });

  it('rejects invalid device requests and malformed user codes without server errors', async () => {
    const app = await buildOAuthApp(new InMemoryStore());
    apps.push(app);
    const bad = await app.inject({
      method: 'POST',
      url: '/oauth/device',
      payload: { client_id: GAMEDEV_CLI_CLIENT_ID, device: 42 },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: 'invalid_request' });
  });

  it('issues only one grant when approved code exchanges race', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss', email: 'boss@example.com' });
    const first = await buildOAuthApp(store),
      second = await buildOAuthApp(store);
    apps.push(first, second);
    const created = await first.inject({
      method: 'POST',
      url: '/oauth/device',
      payload: { client_id: GAMEDEV_CLI_CLIENT_ID },
    });
    const { user_code: userCode, device_code: deviceCode } = created.json();
    await second.inject({
      method: 'POST',
      url: '/device',
      headers: { cookie: sessionCookie('g:boss') },
      payload: { user_code: userCode, action: 'approve', consent_token: consent, disclosed_scope: 'creator' },
    });
    const exchanges = await Promise.all([poll(first, deviceCode), poll(second, deviceCode)]);
    expect(exchanges.map((reply) => reply.statusCode).sort()).toEqual([200, 400]);
    expect(await store.listOAuthGrantsByOwner('g:boss')).toHaveLength(1);
  });
});
