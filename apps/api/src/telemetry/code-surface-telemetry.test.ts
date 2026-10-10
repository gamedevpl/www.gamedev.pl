import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';

it('retains the closed Code surface dimension and acceptance outcomes without joining visits to games', async () => {
  const store = new InMemoryStore();
  const app = await buildApp({ store, sessionSecret: 'dev-session-secret-change-me' });
  try {
    const events = [
      { type: 'code_step', step: 'opened', codeSurface: 'local_play', msSinceStart: 0 },
      {
        type: 'code_completion',
        kind: 'ghost_text',
        outcome: 'accepted',
        codeSurface: 'local_play',
        latencyMs: 0,
        completionChars: 5,
        msSinceStart: 0,
      },
    ];
    const response = await app.inject({
      method: 'POST',
      url: '/api/telemetry/visit',
      payload: { visitId: randomUUID(), flushMsSinceStart: 0, events },
    });
    expect(response.statusCode).toBe(202);
    const stored = await store.listVisitEvents(new Date().toISOString().slice(0, 10));
    expect(stored).toHaveLength(2);
    expect(stored.every((event) => event.codeSurface === 'local_play' && !('slug' in event) && !('uid' in event))).toBe(
      true,
    );
    expect(stored[1].outcome).toBe('accepted');
  } finally {
    await app.close();
  }
});
