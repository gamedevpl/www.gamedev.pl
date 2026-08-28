import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEVICE_GRANT_TYPE } from './oauth-device.js';
import { GAMEDEV_CLI_CLIENT_ID } from './oauth-first-party.js';
import { buildOAuthApp, enableCliSurface, sessionCookie } from './oauth-cli-test-app.js';
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

    const approve = await app!.inject({
      method: 'POST',
      url: '/device',
      headers: { cookie: sessionCookie('g:boss'), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ user_code: body.user_code, action: 'approve' }).toString(),
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
    expect(grants.json()).toEqual([expect.objectContaining({ clientLabel: 'gamedev CLI on headless-box' })]);
  });
});
