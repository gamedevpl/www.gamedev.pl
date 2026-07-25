import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { InMemoryStore, type TelemetryEvent } from './store.js';
import type { HealthResponse } from './admin.js';

const sessionSecret = 'dev-session-secret-change-me';

function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

function appWith(store: InMemoryStore, adminUids = 'g:boss') {
  return buildApp({ store, sessionSecret, adminUids });
}

const today = new Date().toISOString().slice(0, 10);

function event(partial: Partial<TelemetryEvent> & { type: TelemetryEvent['type'] }): TelemetryEvent {
  return {
    slug: 'brick-storm',
    sessionId: 's1',
    at: `${today}T10:00:00.000Z`,
    ...partial,
  } as TelemetryEvent;
}

describe('GET /api/admin/telemetry/health', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    await store.upsertUser({ uid: 'g:player' });
  });

  it('summarizes today’s play for an admin', async () => {
    await store.appendTelemetryEvents(today, [
      event({ type: 'game_opened', msSinceOpen: 0 }),
      event({ type: 'alive', frames: 300, msSinceOpen: 5_000, at: `${today}T10:00:05.000Z` }),
      event({ type: 'play_time', seconds: 15, msSinceOpen: 15_000, at: `${today}T10:00:15.000Z` }),
      event({ type: 'game_closed', msSinceOpen: 16_000, at: `${today}T10:00:16.000Z` }),
    ]);
    const app = await appWith(store);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/telemetry/health?days=1',
      headers: authHeaders('g:boss'),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as HealthResponse;
    expect(body.days).toEqual([today]);
    expect(body.truncated).toBe(false);
    expect(body.games).toHaveLength(1);
    expect(body.games[0]).toMatchObject({
      slug: 'brick-storm',
      sessions: 1,
      closes: 1,
      bounces: 0,
      totalPlaySeconds: 15,
      errors: 0,
    });
    await app.close();
  });

  it('is invisible to a signed-in non-admin — 404, not 403', async () => {
    const app = await appWith(store);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/telemetry/health',
      headers: authHeaders('g:player'),
    });

    // 403 would confirm the surface exists. A beta tester has no business knowing.
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('is invisible to an anonymous caller too', async () => {
    const app = await appWith(store);

    const res = await app.inject({ method: 'GET', url: '/api/admin/telemetry/health' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('admits nobody when no admin uids are configured', async () => {
    const app = await buildApp({ store, sessionSecret });

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/telemetry/health',
      headers: authHeaders('g:boss'),
    });

    // The safe default for a surface that reads across everyone's games.
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('rejects a days window outside what one request may scan', async () => {
    const app = await appWith(store);

    for (const days of ['0', '31', 'lots']) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/telemetry/health?days=${days}`,
        headers: authHeaders('g:boss'),
      });
      expect(res.statusCode).toBe(400);
    }
    await app.close();
  });

  it('reports emptiness as an empty list, not an error', async () => {
    const app = await appWith(store);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/telemetry/health?days=1',
      headers: authHeaders('g:boss'),
    });

    expect(res.statusCode).toBe(200);
    expect((res.json() as HealthResponse).games).toEqual([]);
    await app.close();
  });

  it('stops at the read budget and reports the narrower window it actually measured', async () => {
    // Six days of 1000 events each: 6000 events against a 5000 budget, so the oldest
    // day is never read. 30 days at the per-day cap would be 30,000 reads for a click.
    const days = Array.from({ length: 6 }, (_, index) =>
      new Date(Date.now() - index * 86_400_000).toISOString().slice(0, 10),
    );
    for (const dateStr of days) {
      await store.appendTelemetryEvents(
        dateStr,
        Array.from({ length: 1000 }, (_, index) =>
          event({ type: 'alive', frames: 300, sessionId: `s-${dateStr}-${index}`, at: `${dateStr}T10:00:00.000Z` }),
        ),
      );
    }
    const app = await appWith(store);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/telemetry/health?days=6',
      headers: authHeaders('g:boss'),
    });

    const body = res.json() as HealthResponse;
    // Five days fit the budget; the sixth is dropped rather than read.
    expect(body.days).toEqual(days.slice(0, 5));
    expect(body.truncated).toBe(true);
    // The window shown is the window measured — never wider.
    expect(body.days).not.toContain(days[5]);
    await app.close();
  });

  it('does not claim truncation when the whole window fits', async () => {
    await store.appendTelemetryEvents(today, [event({ type: 'game_opened', msSinceOpen: 0 })]);
    const app = await appWith(store);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/telemetry/health?days=30',
      headers: authHeaders('g:boss'),
    });

    const body = res.json() as HealthResponse;
    expect(body.truncated).toBe(false);
    expect(body.days).toHaveLength(30);
    await app.close();
  });

  it('scans several day partitions and merges a session that spans them', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await store.appendTelemetryEvents(yesterday, [
      event({ type: 'game_opened', msSinceOpen: 0, at: `${yesterday}T23:59:00.000Z` }),
    ]);
    await store.appendTelemetryEvents(today, [
      event({ type: 'play_time', seconds: 15, msSinceOpen: 15_000, at: `${today}T00:00:05.000Z` }),
    ]);
    const app = await appWith(store);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/telemetry/health?days=2',
      headers: authHeaders('g:boss'),
    });

    const body = res.json() as HealthResponse;
    expect(body.days).toEqual([today, yesterday]);
    // One session, not two: a flush straddling midnight files into both partitions.
    expect(body.games[0].sessions).toBe(1);
    expect(body.games[0].totalPlaySeconds).toBe(15);
    await app.close();
  });
});
