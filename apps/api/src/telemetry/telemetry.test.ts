import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../auth.js';
import { createPublishedSlugGate } from '../catalog/published-slugs.js';
import { InMemoryStore } from '../store.js';

const sessionSecret = 'dev-session-secret-change-me';
const sessionId = '00000000-0000-4000-8000-000000000000';

function authHeaders(uid = 'g:me') {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

/**
 * A catalog gate over a fixed set of slugs. The published catalog is built from the
 * games repo, so this — not a Firestore submission — is what decides whether a game
 * is real; see the regression test at the bottom for why that distinction matters.
 */
function gateOver(published: string[], drafts: string[] = []) {
  const entries = [
    ...published.map((slug) => ({ slug, status: 'published' as const })),
    ...drafts.map((slug) => ({ slug, status: 'draft' as const })),
  ];
  return createPublishedSlugGate({ client: { getCatalog: async () => entries as never } });
}

function appWith(store: InMemoryStore, published = ['space-hop'], drafts: string[] = []) {
  return buildApp({
    store,
    sessionSecret,
    telemetryRoutes: { publishedSlugs: gateOver(published, drafts) },
  });
}

function post(app: Awaited<ReturnType<typeof buildApp>>, payload: unknown, headers = authHeaders()) {
  return app.inject({ method: 'POST', url: '/api/telemetry', payload: payload as object, headers });
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Every partition a backdated write could have landed in, oldest first.
 *
 * The handler files each event under the partition of *its own* timestamp, not the
 * flush's, so a deliberately backdated event does not necessarily land in today's.
 * Asserting on `today()` alone made the backdating tests below fail every night
 * between 00:00 and 06:00 UTC: clamped six hours into the past, the event is filed
 * under *yesterday* and the read came back empty. The store is fresh per test, so
 * reading both partitions is exact rather than merely tolerant.
 */
async function listBackdated(store: InMemoryStore) {
  const todayStr = today();
  const yesterdayStr = new Date(Date.parse(`${todayStr}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const [earlier, current] = await Promise.all([
    store.listTelemetryEvents(yesterdayStr),
    store.listTelemetryEvents(todayStr),
  ]);
  return [...earlier, ...current];
}

describe('POST /api/telemetry', () => {
  let store: InMemoryStore;
  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:me' });
  });

  it('records a batch against the slug that reported it', async () => {
    const app = await appWith(store);
    const res = await post(app, {
      slug: 'space-hop',
      sessionId,
      events: [{ type: 'game_opened', slots: 3 }, { type: 'play_time', seconds: 15 }, { type: 'game_closed' }],
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 3 });

    const stored = await store.listTelemetryEvents(today(), { slug: 'space-hop' });
    expect(stored.map((event) => event.type)).toEqual(['game_opened', 'play_time', 'game_closed']);
    expect(stored[0]).toMatchObject({ slug: 'space-hop', sessionId, slots: 3 });
    await app.close();
  });

  it('stores no player identity — not the uid, not the ip', async () => {
    const app = await appWith(store);
    await post(app, { slug: 'space-hop', sessionId, events: [{ type: 'game_opened' }] });

    const [event] = await store.listTelemetryEvents(today());
    expect(Object.keys(event).sort()).toEqual(['at', 'sessionId', 'slug', 'type']);
    expect(JSON.stringify(event)).not.toContain('g:me');
    await app.close();
  });

  it('timestamps server-side, ignoring any client-sent time', async () => {
    const app = await appWith(store);
    await post(app, {
      slug: 'space-hop',
      sessionId,
      // A client claiming its own `at` gets it ignored: the schema has no such field.
      events: [{ type: 'game_opened', at: '1999-01-01T00:00:00.000Z' }],
    });

    const [event] = await store.listTelemetryEvents(today());
    expect(Date.parse(event.at)).toBeGreaterThan(Date.parse('2026-01-01T00:00:00.000Z'));
    await app.close();
  });

  it('accepts and drops an unknown slug without revealing that it is unknown', async () => {
    const app = await appWith(store);
    const res = await post(app, { slug: 'not-a-game', sessionId, events: [{ type: 'game_opened' }] });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 0 });
    expect(await store.listTelemetryEvents(today())).toHaveLength(0);
    await app.close();
  });

  it('drops events for a draft — a creator playtesting is not funnel data', async () => {
    const app = await appWith(store, ['space-hop'], ['wip-game']);
    const res = await post(app, { slug: 'wip-game', sessionId, events: [{ type: 'game_opened' }] });

    expect(res.json()).toEqual({ accepted: 0 });
    expect(await store.listTelemetryEvents(today())).toHaveLength(0);
    await app.close();
  });

  it('records events for a store-published slug with no repo-catalog entry', async () => {
    // No telemetryRoutes.publishedSlugs override: exercises the combined gate in app.ts.
    await store.setPublication({
      slug: 'miniature-warfare-2d',
      state: 'published',
      currentVersion: 'v1',
      publishedAt: '2026-07-01T00:00:00.000Z',
    });
    const app = await buildApp({ store, sessionSecret });

    const res = await post(app, {
      slug: 'miniature-warfare-2d',
      sessionId,
      events: [{ type: 'game_opened' }],
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 1 });
    expect(await store.listTelemetryEvents(today(), { slug: 'miniature-warfare-2d' })).toHaveLength(1);
    await app.close();
  });

  it('drops everything when no games repo is configured, rather than trusting the slug', async () => {
    const app = await buildApp({ store, sessionSecret, telemetryRoutes: { publishedSlugs: null } });
    const res = await post(app, { slug: 'space-hop', sessionId, events: [{ type: 'game_opened' }] });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 0 });
    await app.close();
  });

  it('rejects an unknown event type and a malformed payload', async () => {
    const app = await appWith(store);

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
    const app = await appWith(store);
    const res = await post(app, {
      slug: 'space-hop',
      sessionId,
      events: Array.from({ length: 51 }, () => ({ type: 'alive', frames: 60 })),
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('truncates an over-long error message rather than storing it whole', async () => {
    const app = await appWith(store);
    await post(app, { slug: 'space-hop', sessionId, events: [{ type: 'error', message: 'x'.repeat(700) }] });

    const [event] = await store.listTelemetryEvents(today());
    expect(event.message).toHaveLength(200);
    await app.close();
  });

  it('stops recording once a session hits its ceiling', async () => {
    const app = await appWith(store);
    const batch = Array.from({ length: 50 }, () => ({ type: 'alive', frames: 60 }));

    for (let i = 0; i < 8; i++) {
      const res = await post(app, { slug: 'space-hop', sessionId, events: batch });
      expect(res.json()).toEqual({ accepted: 50 });
    }
    // 400 accepted; the ninth flush is dropped whole.
    const res = await post(app, { slug: 'space-hop', sessionId, events: batch });
    expect(res.json()).toEqual({ accepted: 0 });
    expect(await store.listTelemetryEvents(today(), { limit: 10_000 })).toHaveLength(400);
    await app.close();
  });

  it('rate-limits a flood from one address', async () => {
    const app = await appWith(store);
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

  // Play telemetry stays behind the private-beta wall: during closed beta every player is
  // signed in, so walling costs nothing and keeps the intake shut to the open internet.
  // Visit telemetry is the deliberate exception (see visit-telemetry.test.ts).
  it('rejects play events without a session in private-beta mode', async () => {
    const app = await buildApp({
      store,
      sessionSecret,
      betaAllowedUids: 'g:me',
      telemetryRoutes: { publishedSlugs: gateOver(['space-hop']) },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/telemetry',
      payload: { slug: 'space-hop', sessionId, events: [{ type: 'game_opened' }] },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  describe('event timing', () => {
    /**
     * The production session that motivated offsets: `game_opened` flushed at once, then
     * three events generated within the first 15 seconds but not flushed until 5.5
     * minutes later, when the tab was hidden. Every one of them was stored as having
     * happened at the flush instant.
     */
    it('dates events from their own offset rather than from the flush', async () => {
      const app = await appWith(store);
      await post(app, {
        slug: 'space-hop',
        sessionId,
        flushMsSinceOpen: 345_000,
        events: [
          { type: 'alive', frames: 300, msSinceOpen: 5_000 },
          { type: 'play_time', seconds: 15, msSinceOpen: 15_000 },
        ],
      });

      const stored = await listBackdated(store);
      const times = stored.map((event) => Date.parse(event.at));
      // 10 seconds apart, as they were when they happened — not one shared instant.
      expect(times[1] - times[0]).toBe(10_000);
      // And both dated well before the flush that carried them.
      expect(Date.now() - times[0]).toBeGreaterThanOrEqual(340_000);
      expect(stored.map((event) => event.msSinceOpen)).toEqual([5_000, 15_000]);
      await app.close();
    });

    it('falls back to receipt time for a client that sends no offsets', async () => {
      const app = await appWith(store);
      const before = Date.now();
      await post(app, { slug: 'space-hop', sessionId, events: [{ type: 'game_opened' }] });

      const [event] = await store.listTelemetryEvents(today());
      expect(Date.parse(event.at)).toBeGreaterThanOrEqual(before);
      expect(event.msSinceOpen).toBeUndefined();
      await app.close();
    });

    it('refuses to backdate further than the cap, whatever the client claims', async () => {
      const app = await appWith(store);
      const before = Date.now();
      await post(app, {
        slug: 'space-hop',
        sessionId,
        // A client trying to write into an arbitrary past partition: it claims the
        // session is a day old and that this event happened at the very start of it.
        flushMsSinceOpen: 86_400_000,
        events: [{ type: 'game_opened', msSinceOpen: 0 }],
      });

      const sixHours = 6 * 60 * 60 * 1000;
      const [event] = await listBackdated(store);
      expect(event, 'backdated event missing from both candidate partitions').toBeDefined();
      // Clamped to exactly the cap, measured against a clock read before the request
      // so the millisecond the request itself takes cannot fail the assertion.
      expect(Date.parse(event.at)).toBeGreaterThanOrEqual(before - sixHours);
      expect(Date.parse(event.at)).toBeLessThanOrEqual(Date.now() - sixHours + 1_000);
      await app.close();
    });

    it('ignores an offset ordering that would date an event after its own flush', async () => {
      const app = await appWith(store);
      const before = Date.now();
      await post(app, {
        slug: 'space-hop',
        sessionId,
        flushMsSinceOpen: 1_000,
        // Older than the flush is impossible; it must not become a future timestamp.
        events: [{ type: 'game_opened', msSinceOpen: 60_000 }],
      });

      const [event] = await listBackdated(store);
      expect(Date.parse(event.at)).toBeGreaterThanOrEqual(before);
      expect(Date.parse(event.at)).toBeLessThanOrEqual(Date.now());
      await app.close();
    });

    it('rejects an offset outside what a session can be', async () => {
      const app = await appWith(store);
      const res = await post(app, {
        slug: 'space-hop',
        sessionId,
        events: [{ type: 'game_opened', msSinceOpen: -5 }],
      });

      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it('files a flush that straddles midnight into both days', async () => {
      const app = await appWith(store);
      // Anchor "now" just after midnight so a backdated event belongs to yesterday.
      const justAfterMidnight = new Date();
      justAfterMidnight.setUTCHours(0, 5, 0, 0);
      const appAtMidnight = await buildApp({
        store,
        sessionSecret,
        telemetryRoutes: { publishedSlugs: gateOver(['space-hop']), now: () => justAfterMidnight.getTime() },
      });

      await post(appAtMidnight, {
        slug: 'space-hop',
        sessionId,
        flushMsSinceOpen: 600_000,
        events: [
          { type: 'game_opened', msSinceOpen: 0 }, // 23:55 yesterday
          { type: 'game_closed', msSinceOpen: 600_000 }, // 00:05 today
        ],
      });

      const todayStr = justAfterMidnight.toISOString().slice(0, 10);
      const yesterdayStr = new Date(justAfterMidnight.getTime() - 86_400_000).toISOString().slice(0, 10);
      expect((await store.listTelemetryEvents(yesterdayStr)).map((e) => e.type)).toEqual(['game_opened']);
      expect((await store.listTelemetryEvents(todayStr)).map((e) => e.type)).toEqual(['game_closed']);
      await appAtMidnight.close();
      await app.close();
    });
  });

  /**
   * The regression that made this whole path a no-op in production for a day.
   *
   * Intake used to resolve the slug to `submissions/{issueNumber}` and require
   * `publishedAt`. Of 42 playable games, 8 had a submission document and 2 had
   * `publishedAt` — so ~95% of real play was accepted with 202 and silently thrown
   * away. A game in the published catalog must record whether or not this platform
   * has any memory of it having been commissioned.
   */
  it('records a published catalog game that has no submission document at all', async () => {
    const app = await appWith(store, ['arena-tag']);
    expect(await store.getSubmissionBySlug('arena-tag')).toBeNull();

    const res = await post(app, { slug: 'arena-tag', sessionId, events: [{ type: 'game_opened' }] });

    expect(res.json()).toEqual({ accepted: 1 });
    expect(await store.listTelemetryEvents(today(), { slug: 'arena-tag' })).toHaveLength(1);
    await app.close();
  });
});

describe('zone_link', () => {
  let store: InMemoryStore;
  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:me' });
  });

  it('records the rungs the shell reports', async () => {
    const app = await appWith(store);
    const res = await post(app, {
      slug: 'space-hop',
      sessionId,
      events: [
        { type: 'zone_link', step: 'admitted' },
        { type: 'zone_link', step: 'joined' },
      ],
    });

    expect(res.statusCode).toBe(202);
    const stored = await store.listTelemetryEvents(today(), { slug: 'space-hop' });
    expect(stored.map((event) => [event.type, event.step])).toEqual([
      ['zone_link', 'admitted'],
      ['zone_link', 'joined'],
    ]);
    await app.close();
  });

  it('rejects a rung outside the vocabulary', async () => {
    // A free-text step would let a caller mint labels the read side copes with forever,
    // and everything arriving here is untrusted whoever is supposed to have sent it.
    const app = await appWith(store);
    const res = await post(app, {
      slug: 'space-hop',
      sessionId,
      events: [{ type: 'zone_link', step: 'shared' }],
    });

    expect(res.statusCode).toBe(400);
    expect(await store.listTelemetryEvents(today())).toHaveLength(0);
    await app.close();
  });
});
