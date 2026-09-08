import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { InMemoryStore } from './store.js';

const sessionSecret = 'dev-session-secret-change-me';
const adminUid = 'g:limits-admin';

async function adminApp() {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: adminUid });
  const app = await buildApp({ store, sessionSecret, adminUids: adminUid });
  return { app, store };
}

function adminHeaders() {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(adminUid, sessionSecret)}` };
}

// The guard is derived from the schema, not a hand-kept list.
describe('POST /api/admin/creation-limits', () => {
  it('accepts a patch that only pulls a load-shedding rung', async () => {
    const { app, store } = await adminApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/creation-limits',
      headers: adminHeaders(),
      payload: { partyPaused: true },
    });
    const stored = await store.getCreationLimits();
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(stored?.partyPaused).toBe(true);
  });

  it('stores a telemetry sample rate on its own', async () => {
    const { app, store } = await adminApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/creation-limits',
      headers: adminHeaders(),
      payload: { telemetrySampleRate: 0.25 },
    });
    const stored = await store.getCreationLimits();
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(stored?.telemetrySampleRate).toBe(0.25);
  });

  it('still refuses an empty patch', async () => {
    const { app } = await adminApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/creation-limits',
      headers: adminHeaders(),
      payload: {},
    });
    await app.close();
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toContain('nothing to change');
  });

  it('refuses a rate outside zero to one', async () => {
    const { app } = await adminApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/creation-limits',
      headers: adminHeaders(),
      payload: { telemetrySampleRate: 4 },
    });
    await app.close();
    expect(response.statusCode).toBe(400);
  });
});
