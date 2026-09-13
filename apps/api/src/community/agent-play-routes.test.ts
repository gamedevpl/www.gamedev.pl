// The gate that makes agent mode a permission, not a client flag.

import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import { SESSION_COOKIE_NAME } from '../platform/auth.js';

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
});

async function makeApp() {
  const app = await buildApp({
    store: new InMemoryStore(),
    reviewerUids: 'dev:reviewer',
    adminUids: 'dev:boss',
  });
  apps.push(app);
  return app;
}

// Dev auth mints `dev:<handle>`, matching REVIEWER_UIDS above.
async function cookieFor(app: Awaited<ReturnType<typeof buildApp>>, handle: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/dev', payload: { uid: handle } });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((entry) => entry.name === SESSION_COOKIE_NAME);
  return `${SESSION_COOKIE_NAME}=${cookie!.value}`;
}

function get(app: Awaited<ReturnType<typeof buildApp>>, cookie?: string) {
  return app.inject({
    method: 'GET',
    url: '/api/agent-play/bridge',
    ...(cookie ? { headers: { cookie } } : {}),
  });
}

describe('GET /api/agent-play/bridge', () => {
  it('hands the executor to a reviewer', async () => {
    const app = await makeApp();
    const res = await get(app, await cookieFor(app, 'reviewer'));

    expect(res.statusCode).toBe(200);
    const body = res.json() as { source?: string };
    expect(typeof body.source).toBe('string');
    // Enough of the contract to prove it is really the executor.
    expect(body.source).toContain('agent:state');
    expect(body.source).toContain('__GDPL_BRIDGE__');
  });

  it('hands it to an admin too, who outranks the reviewer list', async () => {
    const app = await makeApp();
    const res = await get(app, await cookieFor(app, 'boss'));
    expect(res.statusCode).toBe(200);
  });

  it('refuses a signed-in player, and says nothing about why', async () => {
    const app = await makeApp();
    const res = await get(app, await cookieFor(app, 'someone'));

    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('agent:state');
  });

  it('refuses an anonymous visitor', async () => {
    const app = await makeApp();
    const res = await get(app);

    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('agent:state');
  });

  it('never lets a cache hand the executor to the next visitor', async () => {
    const app = await makeApp();
    const res = await get(app, await cookieFor(app, 'reviewer'));

    expect(res.headers['cache-control']).toBe('private, no-store');
  });
});
