import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { InMemoryStore } from './store.js';

const sessionSecret = 'dev-session-secret-change-me';
const sessionId = '00000000-0000-4000-8000-000000000000';

function authHeaders(uid = 'g:me') {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

async function publishedStore() {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:me' });
  await store.createSubmission(42, 'g:owner', 'Space Hop');
  await store.setSubmissionSlug(42, 'space-hop');
  await store.setSubmissionPublishedAt(42, '2026-07-21T10:00:00.000Z');
  return store;
}

function post(app: Awaited<ReturnType<typeof buildApp>>, payload: unknown, headers = authHeaders()) {
  return app.inject({ method: 'POST', url: '/api/telemetry', payload: payload as object, headers });
}

describe('POST /api/telemetry', () => {
  let store: InMemoryStore;
  beforeEach(async () => {
    store = await publishedStore();
  });

  it('records a batch against the submission the slug resolves to', async () => {
    const app = await buildApp({ store, sessionSecret });
    const res = await post(app, {
      slug: 'space-hop',
      sessionId,
      events: [{ type: 'game_opened', slots: 3 }, { type: 'play_time', seconds: 15 }, { type: 'game_closed' }],
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 3 });

    const dateStr = new Date().toISOString().slice(0, 10);
    const stored = await store.listTelemetryEvents(dateStr, { issueNumber: 42 });
    expect(stored.map((event) => event.type)).toEqual(['game_opened', 'play_time', 'game_closed']);
    expect(stored[0]).toMatchObject({ issueNumber: 42, sessionId, slots: 3 });
    await app.close();
  });

  it('stores no player identity — not the uid, not the ip', async () => {
    const app = await buildApp({ store, sessionSecret });
    await post(app, { slug: 'space-hop', sessionId, events: [{ type: 'game_opened' }] });

    const [event] = await store.listTelemetryEvents(new Date().toISOString().slice(0, 10));
    expect(Object.keys(event).sort()).toEqual(['at', 'issueNumber', 'sessionId', 'type']);
    expect(JSON.stringify(event)).not.toContain('g:me');
    await app.close();
  });

  it('timestamps server-side, ignoring any client-sent time', async () => {
    const app = await buildApp({ store, sessionSecret });
    await post(app, {
      slug: 'space-hop',
      sessionId,
      // A client claiming its own `at` gets it ignored: the schema has no such field.
      events: [{ type: 'game_opened', at: '1999-01-01T00:00:00.000Z' }],
    });

    const [event] = await store.listTelemetryEvents(new Date().toISOString().slice(0, 10));
    expect(Date.parse(event.at)).toBeGreaterThan(Date.parse('2026-01-01T00:00:00.000Z'));
    await app.close();
  });

  it('accepts and drops an unknown slug without revealing that it is unknown', async () => {
    const app = await buildApp({ store, sessionSecret });
    const res = await post(app, { slug: 'not-a-game', sessionId, events: [{ type: 'game_opened' }] });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 0 });
    expect(await store.listTelemetryEvents(new Date().toISOString().slice(0, 10))).toHaveLength(0);
    await app.close();
  });

  it('drops events for a draft — a creator playtesting is not funnel data', async () => {
    await store.createSubmission(43, 'g:owner', 'Work In Progress');
    await store.setSubmissionSlug(43, 'wip-game');
    const app = await buildApp({ store, sessionSecret });
    const res = await post(app, { slug: 'wip-game', sessionId, events: [{ type: 'game_opened' }] });

    expect(res.json()).toEqual({ accepted: 0 });
    await app.close();
  });

  it('rejects an unknown event type and a malformed payload', async () => {
    const app = await buildApp({ store, sessionSecret });

    for (const payload of [
      { slug: 'space-hop', sessionId, events: [{ type: 'exfiltrate', data: 'secrets' }] },
      { slug: 'space-hop', sessionId, events: [{ type: 'play_time', seconds: 99999 }] },
      { slug: 'space-hop', sessionId, events: [{ type: 'end', outcome: 'transcended' }] },
      { slug: '../../etc/passwd', sessionId, events: [{ type: 'game_opened' }] },
      { slug: 'space-hop', sessionId: 'not-a-uuid', events: [{ type: 'game_opened' }] },
      { slug: 'space-hop', sessionId, events: [] },
      { slug: 'space-hop', sessionId },
    ]) {
      const res = await post(app, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
    await app.close();
  });

  it('rejects a batch larger than the per-request cap', async () => {
    const app = await buildApp({ store, sessionSecret });
    const res = await post(app, {
      slug: 'space-hop',
      sessionId,
      events: Array.from({ length: 51 }, () => ({ type: 'alive', frames: 60 })),
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('truncates an over-long error message rather than storing it whole', async () => {
    const app = await buildApp({ store, sessionSecret });
    await post(app, {
      slug: 'space-hop',
      sessionId,
      events: [{ type: 'error', message: 'x'.repeat(700) }],
    });

    const [event] = await store.listTelemetryEvents(new Date().toISOString().slice(0, 10));
    expect(event.message).toHaveLength(200);
    await app.close();
  });

  it('stops recording once a session hits its ceiling', async () => {
    const app = await buildApp({ store, sessionSecret });
    const batch = Array.from({ length: 50 }, () => ({ type: 'alive', frames: 60 }));

    for (let i = 0; i < 8; i++) {
      const res = await post(app, { slug: 'space-hop', sessionId, events: batch });
      expect(res.json()).toEqual({ accepted: 50 });
    }
    // 400 accepted; the ninth flush is dropped whole.
    const res = await post(app, { slug: 'space-hop', sessionId, events: batch });
    expect(res.json()).toEqual({ accepted: 0 });
    expect(await store.listTelemetryEvents(new Date().toISOString().slice(0, 10), { limit: 10_000 })).toHaveLength(400);
    await app.close();
  });

  it('rate-limits a flood from one address', async () => {
    const app = await buildApp({ store, sessionSecret });
    let limited = false;
    for (let i = 0; i < 130 && !limited; i++) {
      const res = await post(app, {
        // A fresh session each time, so this is the IP window and not the session cap.
        slug: 'space-hop',
        sessionId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        events: [{ type: 'game_opened' }],
      });
      limited = res.statusCode === 429;
    }
    expect(limited).toBe(true);
    await app.close();
  });

  it('is behind the private-beta wall like every other data route', async () => {
    const app = await buildApp({ store, sessionSecret, betaAllowedUids: 'g:me' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/telemetry',
      payload: { slug: 'space-hop', sessionId, events: [{ type: 'game_opened' }] },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
