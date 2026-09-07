import { describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';

const sessionSecret = 'dev-session-secret-change-me';
const uid = 'g:party-pause';

async function appWithLimits(partyPaused: boolean) {
  const store = new InMemoryStore();
  await store.upsertUser({ uid });
  if (partyPaused) await store.setCreationLimits({ partyPaused: true }, 'test');
  return buildApp({ store, sessionSecret });
}

function hostHeaders() {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

// Ladder rung 3; see docs/runbooks/launch-day.md.
describe('party hosting pause', () => {
  it('opens rooms normally when nothing is paused', async () => {
    const app = await appWithLimits(false);
    const response = await app.inject({
      method: 'POST',
      url: '/api/mp/sessions',
      headers: hostHeaders(),
      payload: { slug: 'arena-tag' },
    });
    await app.close();
    expect(response.statusCode).toBe(200);
  });

  it('refuses a new room honestly once an operator pauses hosting', async () => {
    const app = await appWithLimits(true);
    const response = await app.inject({
      method: 'POST',
      url: '/api/mp/sessions',
      headers: hostHeaders(),
      payload: { slug: 'arena-tag' },
    });
    await app.close();
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'party mode is paused' });
  });

  it('checks the session before the pause: a signed-out host still gets 401', async () => {
    const app = await appWithLimits(true);
    const response = await app.inject({ method: 'POST', url: '/api/mp/sessions', payload: { slug: 'arena-tag' } });
    await app.close();
    expect(response.statusCode).toBe(401);
  });
});

// Ladder rung 2, measured through the whole app.
describe('visit telemetry sampling', () => {
  async function flush(app: Awaited<ReturnType<typeof buildApp>>, visitId: string) {
    return app.inject({
      method: 'POST',
      url: '/api/telemetry/visit',
      payload: {
        visitId,
        flushMsSinceStart: 10,
        events: [{ type: 'visit_started', entry: 'home', msSinceStart: 0 }],
      },
    });
  }

  it('records a visit when no rate is set', async () => {
    const store = new InMemoryStore();
    const app = await buildApp({ store, sessionSecret });
    const response = await flush(app, '0f2b7c1e-0000-4000-8000-0000000000aa');
    await app.close();
    expect(response.json()).toEqual({ accepted: 1 });
  });

  it('drops every visit at rate zero, without failing the flush', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ telemetrySampleRate: 0 }, 'test');
    const app = await buildApp({ store, sessionSecret });
    const response = await flush(app, '0f2b7c1e-0000-4000-8000-0000000000aa');
    await app.close();
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 0 });
  });
});
