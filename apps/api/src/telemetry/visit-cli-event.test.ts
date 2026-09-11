import { describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';

const sessionSecret = 'dev-session-secret-change-me';
const visitId = '00000000-0000-4000-8000-000000000000';

function authHeaders(uid = 'g:me') {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

describe('POST /api/telemetry/visit cli_step', () => {
  it('records closed dimensions and never stores source text', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:me' });
    const app = await buildApp({ store, sessionSecret });
    const today = new Date().toISOString().slice(0, 10);

    const response = await app.inject({
      method: 'POST',
      url: '/api/telemetry/visit',
      headers: authHeaders(),
      payload: {
        visitId,
        flushMsSinceStart: 0,
        events: [
          { type: 'cli_step', step: 'installed', channel: 'curl', os: 'linux', msSinceStart: 0 },
          { type: 'cli_step', step: 'delegate_used', adapter: 'claude', os: 'darwin', msSinceStart: 10 },
          { type: 'cli_step', step: 'verify_failed', stage: 'check_static', msSinceStart: 20 },
          {
            type: 'cli_step',
            step: 'authorized',
            prompt: 'a racing game',
            path: '/tmp/ghost-roads/game.ts',
            title: 'Ghost Roads',
            msSinceStart: 30,
          },
        ],
      },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 4 });

    const events = (await store.listVisitEvents(today, { visitId })).filter((event) => event.type === 'cli_step');
    expect(events).toEqual([
      expect.objectContaining({ type: 'cli_step', step: 'installed', channel: 'curl', os: 'linux' }),
      expect.objectContaining({ type: 'cli_step', step: 'delegate_used', adapter: 'claude', os: 'darwin' }),
      expect.objectContaining({ type: 'cli_step', step: 'verify_failed', stage: 'check_static' }),
      expect.objectContaining({ type: 'cli_step', step: 'authorized' }),
    ]);
    for (const event of events) {
      expect(event).not.toHaveProperty('prompt');
      expect(event).not.toHaveProperty('path');
      expect(event).not.toHaveProperty('title');
      expect(JSON.stringify(event)).not.toMatch(/racing game|ghost-roads|Ghost Roads/i);
    }

    const badStep = await app.inject({
      method: 'POST',
      url: '/api/telemetry/visit',
      headers: authHeaders(),
      payload: { visitId, flushMsSinceStart: 0, events: [{ type: 'cli_step', step: 'hacked', msSinceStart: 0 }] },
    });
    expect(badStep.statusCode).toBe(400);

    const badAdapter = await app.inject({
      method: 'POST',
      url: '/api/telemetry/visit',
      headers: authHeaders(),
      payload: {
        visitId,
        flushMsSinceStart: 0,
        events: [{ type: 'cli_step', step: 'delegate_used', adapter: 'antigravity', msSinceStart: 0 }],
      },
    });
    expect(badAdapter.statusCode).toBe(400);
  });
});
