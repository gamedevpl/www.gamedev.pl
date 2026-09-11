import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEVICE_CODE_TTL_MS, DEVICE_GRANT_TYPE } from './oauth-device.js';
import { GAMEDEV_CLI_CLIENT_ID } from './oauth-first-party.js';
import { buildOAuthApp, enableCliSurface, sessionCookie, SESSION_SECRET } from './oauth-cli-test-app.js';
import { consentToken } from './oauth-consent.js';
import { InMemoryStore } from './store.js';

describe('OAuth device authorization (CL-08)', () => {
  let app: FastifyInstance | undefined;
  let restore: (() => void) | undefined;
  let clock = Date.now();

  beforeEach(() => {
    restore = enableCliSurface();
    clock = Date.now();
  });

  afterEach(async () => {
    restore?.();
    restore = undefined;
    if (app) await app.close();
    app = undefined;
  });

  function deviceConsent(uid = 'g:boss'): string {
    return consentToken({
      uid,
      clientId: GAMEDEV_CLI_CLIENT_ID,
      codeChallenge: 'device',
      secret: SESSION_SECRET,
    });
  }

  async function setup(): Promise<InMemoryStore> {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss', email: 'boss@example.com' });
    app = await buildOAuthApp(store, { now: () => clock });
    return store;
  }

  it('404s the device endpoints when CLI_SURFACE is off', async () => {
    restore?.();
    delete process.env.CLI_SURFACE;
    app = await buildOAuthApp(new InMemoryStore());
    const device = await app.inject({
      method: 'POST',
      url: '/oauth/device',
      headers: { 'content-type': 'application/json' },
      payload: { client_id: GAMEDEV_CLI_CLIENT_ID, scope: 'creator' },
    });
    expect(device.statusCode).toBe(404);
    const page = await app.inject({ method: 'GET', url: '/device' });
    expect(page.statusCode).toBe(404);
  });

  it('polls authorization_pending, then slow_down, then tokens after approve', async () => {
    await setup();
    const issued = await app!.inject({
      method: 'POST',
      url: '/oauth/device',
      headers: { 'content-type': 'application/json' },
      payload: { client_id: GAMEDEV_CLI_CLIENT_ID, scope: 'creator', device: 'headless-box' },
    });
    expect(issued.statusCode).toBe(200);
    const body = issued.json() as {
      device_code: string;
      user_code: string;
      verification_uri: string;
      interval: number;
    };
    expect(body.user_code).toMatch(/^[A-Z]{4}-[A-Z]{4}$/);
    const other = await app!.inject({
      method: 'POST',
      url: '/oauth/device',
      headers: { 'content-type': 'application/json' },
      payload: { client_id: GAMEDEV_CLI_CLIENT_ID, scope: 'creator' },
    });
    expect(other.statusCode).toBe(200);
    expect((other.json() as { user_code: string }).user_code).not.toBe(body.user_code);
    expect(body.verification_uri).toMatch(/\/device$/);
    expect(body.interval).toBe(5);

    const poll = async () =>
      app!.inject({
        method: 'POST',
        url: '/oauth/token',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({
          grant_type: DEVICE_GRANT_TYPE,
          device_code: body.device_code,
          client_id: GAMEDEV_CLI_CLIENT_ID,
        }).toString(),
      });

    const pending = await poll();
    expect(pending.statusCode).toBe(400);
    expect(pending.json()).toEqual({ error: 'authorization_pending' });

    const rushed = await poll();
    expect(rushed.statusCode).toBe(400);
    expect(rushed.json()).toEqual({ error: 'slow_down' });

    const page = await app!.inject({
      method: 'GET',
      url: '/device',
      headers: { cookie: sessionCookie('g:boss') },
    });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('name="consent_token"');

    const approve = await app!.inject({
      method: 'POST',
      url: '/device',
      headers: { cookie: sessionCookie('g:boss'), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        user_code: body.user_code,
        action: 'approve',
        consent_token: deviceConsent(),
      }).toString(),
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.body).toMatch(/Approved/i);

    clock += 15_000;
    const tokens = await poll();
    expect(tokens.statusCode).toBe(200);
    const granted = tokens.json() as { access_token: string; scope: string };
    expect(granted.access_token).toMatch(/^gdpl_oat_/);
    expect(granted.scope).toBe('creator');

    const profile = await app!.inject({
      method: 'GET',
      url: '/api/me/profile',
      headers: { authorization: `Bearer ${granted.access_token}` },
    });
    expect(profile.statusCode).toBe(200);

    const grants = await app!.inject({
      method: 'GET',
      url: '/api/me/oauth-grants',
      headers: { cookie: sessionCookie('g:boss') },
    });
    expect(grants.json()).toEqual([expect.objectContaining({ clientLabel: 'gamedevpl CLI on headless-box' })]);
  });

  it('does not approve a device code unless action is approve', async () => {
    await setup();
    const issued = await app!.inject({
      method: 'POST',
      url: '/oauth/device',
      headers: { 'content-type': 'application/json' },
      payload: { client_id: GAMEDEV_CLI_CLIENT_ID, scope: 'creator' },
    });
    const body = issued.json() as { device_code: string; user_code: string };
    const missing = await app!.inject({
      method: 'POST',
      url: '/device',
      headers: { cookie: sessionCookie('g:boss'), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        user_code: body.user_code,
        consent_token: deviceConsent(),
      }).toString(),
    });
    expect(missing.statusCode).toBe(200);
    expect(missing.body).toMatch(/Choose Approve or Deny/i);
    expect(missing.body).not.toMatch(/Approved/i);

    const poll = await app!.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: DEVICE_GRANT_TYPE,
        device_code: body.device_code,
        client_id: GAMEDEV_CLI_CLIENT_ID,
      }).toString(),
    });
    expect(poll.statusCode).toBe(400);
    expect(poll.json()).toEqual({ error: 'authorization_pending' });
  });

  it('does not approve a device code without a valid consent token', async () => {
    await setup();
    const issued = await app!.inject({
      method: 'POST',
      url: '/oauth/device',
      headers: { 'content-type': 'application/json' },
      payload: { client_id: GAMEDEV_CLI_CLIENT_ID, scope: 'creator' },
    });
    const body = issued.json() as { device_code: string; user_code: string };
    const missing = await app!.inject({
      method: 'POST',
      url: '/device',
      headers: { cookie: sessionCookie('g:boss'), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ user_code: body.user_code, action: 'approve' }).toString(),
    });
    expect(missing.statusCode).toBe(200);
    expect(missing.body).toMatch(/Refresh this page/i);
    expect(missing.body).not.toMatch(/Approved/i);

    const poll = await app!.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: DEVICE_GRANT_TYPE,
        device_code: body.device_code,
        client_id: GAMEDEV_CLI_CLIENT_ID,
      }).toString(),
    });
    expect(poll.statusCode).toBe(400);
    expect(poll.json()).toEqual({ error: 'authorization_pending' });
  });

  it('returns expired_token on the first poll after the device-code TTL', async () => {
    await setup();
    const issued = await app!.inject({
      method: 'POST',
      url: '/oauth/device',
      headers: { 'content-type': 'application/json' },
      payload: { client_id: GAMEDEV_CLI_CLIENT_ID, scope: 'creator' },
    });
    const body = issued.json() as { device_code: string };
    clock += DEVICE_CODE_TTL_MS + 1;
    const poll = await app!.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: DEVICE_GRANT_TYPE,
        device_code: body.device_code,
        client_id: GAMEDEV_CLI_CLIENT_ID,
      }).toString(),
    });
    expect(poll.statusCode).toBe(400);
    expect(poll.json()).toEqual({ error: 'expired_token' });
  });
});
