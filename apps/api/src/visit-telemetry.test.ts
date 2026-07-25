import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { InMemoryStore } from './store.js';

const sessionSecret = 'dev-session-secret-change-me';
const visitId = '00000000-0000-4000-8000-000000000000';

function authHeaders(uid = 'g:me') {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

function post(app: Awaited<ReturnType<typeof buildApp>>, payload: unknown, headers = authHeaders()) {
  return app.inject({ method: 'POST', url: '/api/telemetry/visit', payload: payload as object, headers });
}

const today = () => new Date().toISOString().slice(0, 10);

describe('POST /api/telemetry/visit', () => {
  let store: InMemoryStore;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:me' });
    app = await buildApp({ store, sessionSecret });
  });

  it('records a landing with its acquisition context', async () => {
    const response = await post(app, {
      visitId,
      flushMsSinceStart: 10,
      events: [
        {
          type: 'visit_started',
          entry: 'play',
          referrer: 'news.ycombinator.com',
          utmSource: 'hn',
          msSinceStart: 0,
        },
      ],
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 1 });

    const events = await store.listVisitEvents(today());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      visitId,
      type: 'visit_started',
      entry: 'play',
      referrer: 'news.ycombinator.com',
      utmSource: 'hn',
    });
  });

  it('answers session depth: several plays under one visit id', async () => {
    await post(app, {
      visitId,
      flushMsSinceStart: 300,
      events: [
        { type: 'visit_started', entry: 'home', msSinceStart: 0 },
        { type: 'play_started', msSinceStart: 100 },
        { type: 'route_viewed', route: 'home', msSinceStart: 200 },
        { type: 'play_started', msSinceStart: 300 },
      ],
    });

    const events = await store.listVisitEvents(today(), { visitId });
    expect(events.filter((event) => event.type === 'play_started')).toHaveLength(2);
  });

  it('never stores a game identity, even if a client sends one', async () => {
    await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'play_started', slug: 'space-hop', msSinceStart: 0 }],
    });

    const events = await store.listVisitEvents(today());
    expect(events).toHaveLength(1);
    expect(events[0]).not.toHaveProperty('slug');
  });

  it('dates events from their own offsets rather than collapsing onto the flush', async () => {
    await post(app, {
      visitId,
      flushMsSinceStart: 60_000,
      events: [
        { type: 'visit_started', entry: 'home', msSinceStart: 0 },
        { type: 'play_started', msSinceStart: 60_000 },
      ],
    });

    const events = await store.listVisitEvents(today());
    const [first, second] = events.sort((a, b) => a.msSinceStart - b.msSinceStart);
    expect(Date.parse(second.at) - Date.parse(first.at)).toBe(60_000);
  });

  it('rejects a malformed visit id', async () => {
    const response = await post(app, {
      visitId: 'not-a-uuid',
      flushMsSinceStart: 0,
      events: [{ type: 'play_started', msSinceStart: 0 }],
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an unknown event type', async () => {
    const response = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'signed_in', msSinceStart: 0 }],
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects acquisition values that could carry personal data', async () => {
    const response = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'visit_started', entry: 'home', referrer: 'https://x.com/u?token=secret', msSinceStart: 0 }],
    });
    expect(response.statusCode).toBe(400);

    const utm = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'visit_started', entry: 'home', utmSource: 'me@example.com', msSinceStart: 0 }],
    });
    expect(utm.statusCode).toBe(400);
  });

  it('rejects an oversized batch', async () => {
    const response = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: Array.from({ length: 26 }, () => ({ type: 'play_started', msSinceStart: 0 })),
    });
    expect(response.statusCode).toBe(400);
  });

  it('stops recording once a visit exhausts its ceiling', async () => {
    for (let batch = 0; batch < 9; batch += 1) {
      await post(app, {
        visitId,
        flushMsSinceStart: 0,
        events: Array.from({ length: 25 }, () => ({ type: 'play_started', msSinceStart: 0 })),
      });
    }

    const events = await store.listVisitEvents(today(), { visitId, limit: 10_000 });
    expect(events).toHaveLength(200);

    const overflow = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'play_started', msSinceStart: 0 }],
    });
    expect(overflow.json()).toEqual({ accepted: 0 });
  });

  it('never fails a visit when the store is unhappy', async () => {
    const failing = new InMemoryStore();
    await failing.upsertUser({ uid: 'g:me' });
    failing.appendVisitEvents = async () => {
      throw new Error('firestore is sad');
    };
    const failingApp = await buildApp({ store: failing, sessionSecret });

    const response = await post(failingApp, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'play_started', msSinceStart: 0 }],
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 0 });
  });
});
