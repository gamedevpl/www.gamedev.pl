import { describe, expect, it, beforeEach } from 'vitest';
import { buildApp } from './platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './platform/auth.js';
import { InMemoryStore, type VisitEvent } from './platform/store.js';
import type { TrendsResponse } from './platform/admin.js';

const sessionSecret = 'dev-session-secret-change-me';
const today = new Date().toISOString().slice(0, 10);

function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

function visit(partial: Partial<VisitEvent> & Pick<VisitEvent, 'visitId' | 'type'>): VisitEvent {
  return {
    at: `${today}T10:00:00.000Z`,
    msSinceStart: 0,
    ...partial,
  };
}

describe('GET /api/admin/telemetry/trends', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    await store.upsertUser({ uid: 'g:player' });
  });

  it('returns a daily activity series for an admin', async () => {
    await store.appendVisitEvents(today, [
      visit({ visitId: 'a', type: 'visit_started' }),
      visit({ visitId: 'b', type: 'visit_started' }),
      visit({ visitId: 'a', type: 'play_started', msSinceStart: 2_000 }),
      visit({ visitId: 'a', type: 'create_step', step: 'submission_created', msSinceStart: 9_000 }),
    ]);

    const app = await buildApp({ store, sessionSecret, adminUids: 'g:boss' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/telemetry/trends?days=1',
      headers: authHeaders('g:boss'),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as TrendsResponse;
    expect(body.days).toEqual([today]);
    expect(body.activity).toEqual([{ date: today, visits: 2, plays: 1, creations: 1, truncated: false }]);
    expect(body.mcp).toEqual([
      {
        date: today,
        selfChosen: 0,
        platformChosen: 0,
        connected: 0,
        signaled: 0,
        gateVerdicts: 0,
        truncated: false,
      },
    ]);
    expect(body.retention).toHaveLength(1);
    await app.close();
  });

  it('is invisible to a non-admin', async () => {
    const app = await buildApp({ store, sessionSecret, adminUids: 'g:boss' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/telemetry/trends',
      headers: authHeaders('g:player'),
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
