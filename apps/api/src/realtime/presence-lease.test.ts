import { expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';

it('stale and legacy withdrawals preserve a newer presence lease', async () => {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:lease' });
  const sessionSecret = 'dev-session-secret-change-me';
  const worlds = { getSchema: async () => ({ maxPerPlayer: 2, presence: { cols: 15, rows: 9 }, fields: {} }) };
  const app = await buildApp({ store, sessionSecret, presenceRoutes: { worlds } });
  const url = '/api/games/green/presence';
  const headers = { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:lease', sessionSecret)}` };
  try {
    for (const lease of ['old', 'new']) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url,
            headers: { ...headers, 'x-presence-lease': lease },
            payload: { col: 2, row: 3 },
          })
        ).statusCode,
      ).toBe(200);
    }
    for (const lease of ['old', undefined]) {
      await app.inject({
        method: 'DELETE',
        url,
        headers: { ...headers, ...(lease ? { 'x-presence-lease': lease } : {}) },
      });
      expect((await app.inject({ method: 'GET', url, headers })).json().count).toBe(1);
    }
    await app.inject({ method: 'DELETE', url, headers: { ...headers, 'x-presence-lease': 'new' } });
    expect((await app.inject({ method: 'GET', url, headers })).json().count).toBe(0);
  } finally {
    await app.close();
  }
});
