import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { buildDigestTotals, digestId, isEmptyDigest, isoWeekKey, matchesPrevious, runDigestSweep } from './digest.js';
import type { InternalAuthVerifier } from './internal-auth.js';
import { InMemoryStore, type Scorecard } from './store.js';

/**
 * The digest's design is two silences — no evidence, no digest; nothing changed, no digest
 * — so that is what these mostly test. A weekly email that arrives full of zeros, or that
 * repeats itself, is worse than none: it trains the one person who should be reading it to
 * stop.
 */

const allowAll: InternalAuthVerifier = { verify: async () => true };

function scorecard(partial: Partial<Scorecard> & { slug: string }): Scorecard {
  return {
    computedAt: '2026-07-27T03:00:00.000Z',
    window: { days: ['2026-07-27'], truncated: false },
    sessions: { count: 0, bounces: 0, closes: 0, medianPlaySeconds: 0, totalPlaySeconds: 0 },
    health: { errors: 0, aliveTicks: 0, stalledTicks: 0, stallRate: 0, medianFps: null, resumeTicksIgnored: 0 },
    depth: {
      outcomes: { won: 0, lost: 0, quit: 0 },
      sessionsWithEnding: 0,
      finishRate: null,
      winRate: 0,
      medianBestScore: null,
    },
    votes: { up: 0, down: 0 },
    feedback: { count: 0 },
    untrusted: { errorSamples: [], progressLabels: [], feedbackThemes: [] },
    ...partial,
  } as Scorecard;
}

describe('isoWeekKey', () => {
  it('keys by ISO week', () => {
    expect(isoWeekKey(Date.parse('2026-07-28T00:00:00Z'))).toBe('2026-W31');
    // Same week, different day — the id must not change, or a mid-week retry double-sends.
    expect(isoWeekKey(Date.parse('2026-07-31T23:59:00Z'))).toBe('2026-W31');
    expect(isoWeekKey(Date.parse('2026-08-03T00:00:00Z'))).toBe('2026-W32');
  });

  it('puts the turn of the year in the week that owns its Thursday', () => {
    // 2027-01-01 is a Friday, so it belongs to the last ISO week of 2026 — the case a
    // naive "day of year / 7" gets wrong, and the one that would collide two digests.
    expect(isoWeekKey(Date.parse('2027-01-01T12:00:00Z'))).toBe('2026-W53');
  });
});

describe('buildDigestTotals', () => {
  it('sums across a creator’s games', () => {
    const totals = buildDigestTotals([
      scorecard({
        slug: 'a',
        sessions: { count: 10, bounces: 0, closes: 0, medianPlaySeconds: 0, totalPlaySeconds: 0 },
        votes: { up: 3, down: 1 },
        feedback: { count: 2 },
      }),
      scorecard({
        slug: 'b',
        sessions: { count: 5, bounces: 0, closes: 0, medianPlaySeconds: 0, totalPlaySeconds: 0 },
        votes: { up: 1, down: 0 },
        feedback: { count: 1 },
      }),
    ]);

    expect(totals).toEqual({ games: 2, sessions: 15, votesUp: 4, votesDown: 1, feedback: 3 });
  });

  it('counts games with evidence, not games owned', () => {
    // A scorecard exists only for a game the window saw, so `games` is already the
    // "played" count. Reporting games owned would make a silent week look busy.
    expect(buildDigestTotals([]).games).toBe(0);
  });
});

describe('isEmptyDigest', () => {
  it('is empty when a scorecard exists but nothing happened in it', () => {
    expect(isEmptyDigest(buildDigestTotals([scorecard({ slug: 'a' })]))).toBe(true);
  });

  it('is not empty when even one signal arrived', () => {
    expect(isEmptyDigest({ games: 1, sessions: 0, votesUp: 0, votesDown: 0, feedback: 1 })).toBe(false);
  });
});

describe('matchesPrevious', () => {
  const totals = { games: 1, sessions: 10, votesUp: 2, votesDown: 0, feedback: 1 };

  it('treats a first-ever digest as a change', () => {
    expect(matchesPrevious(null, totals)).toBe(false);
  });

  it('matches identical numbers', () => {
    expect(matchesPrevious({ games: '1', sessions: '10', votesUp: '2', votesDown: '0', feedback: '1' }, totals)).toBe(
      true,
    );
  });

  it('does not match when a single number moved', () => {
    expect(matchesPrevious({ games: '1', sessions: '11', votesUp: '2', votesDown: '0', feedback: '1' }, totals)).toBe(
      false,
    );
  });
});

describe('runDigestSweep', () => {
  let store: InMemoryStore;
  const now = () => Date.parse('2026-07-28T06:00:00Z');

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:alice' });
    await store.createSubmission(1, 'g:alice', 'Brick Storm');
    await store.setSubmissionSlug(1, 'brick-storm');
    await store.setSubmissionPublishedAt(1, '2026-07-02T00:00:00.000Z');
  });

  async function played(slug: string, sessions: number, feedback = 0) {
    await store.putScorecard(
      slug,
      scorecard({
        slug,
        sessions: { count: sessions, bounces: 0, closes: 0, medianPlaySeconds: 0, totalPlaySeconds: 0 },
        feedback: { count: feedback },
      }),
    );
  }

  it('sends a digest to a creator whose games were played', async () => {
    await played('brick-storm', 12, 3);

    const result = await runDigestSweep({ store, now });

    expect(result.sent).toBe(1);
    const [notification] = await store.listNotifications('g:alice');
    expect(notification.type).toBe('creator.digest');
    expect(notification.id).toBe(digestId('2026-W31'));
    expect(notification.params).toMatchObject({ games: '1', sessions: '12', feedback: '3' });
    // The studio is where the numbers behind the digest live, per game, with the themes
    // the digest itself does not carry. Anywhere else makes the reader go looking.
    expect(notification.link).toBe('/studio');
  });

  it('sends nothing to a creator whose games nobody played', async () => {
    await played('brick-storm', 0);

    const result = await runDigestSweep({ store, now });

    expect(result.sent).toBe(0);
    expect(result.skippedEmpty).toBe(1);
    // Not "a digest of zeros" — no digest. A weekly nothing is a reason to stop reading.
    expect(await store.listNotifications('g:alice')).toEqual([]);
  });

  it('sends nothing when a game has no scorecard at all', async () => {
    const result = await runDigestSweep({ store, now });

    // Not even considered: the sweep enumerates evidence, and a game with no scorecard
    // has none to enumerate.
    expect(result.creators).toBe(0);
    expect(await store.listNotifications('g:alice')).toEqual([]);
  });

  it('reaches the creator of an older game that is still being played', async () => {
    // The bug this ordering fixes. Enumerating creators from recently-published
    // submissions drops whoever published long enough ago to fall off that list — the
    // exact person a "your games are still being played" message exists for. Starting
    // from scorecards means publication date cannot decide who hears from us.
    await store.createSubmission(99, 'g:veteran', 'Ancient Game');
    await store.setSubmissionSlug(99, 'ancient-game');
    await store.setSubmissionPublishedAt(99, '2024-01-01T00:00:00.000Z');
    await store.upsertUser({ uid: 'g:veteran' });
    await played('ancient-game', 40);

    const result = await runDigestSweep({ store, now });

    expect(result.sent).toBe(1);
    expect(await store.listNotifications('g:veteran')).toHaveLength(1);
  });

  it('reports truncation only when there was actually more', async () => {
    await played('brick-storm', 5);
    await store.createSubmission(97, 'g:alice', 'Second');
    await store.setSubmissionSlug(97, 'second-game');
    await store.setSubmissionPublishedAt(97, '2026-07-02T00:00:00.000Z');
    await played('second-game', 5);

    // Exactly at the ceiling is not truncation. Asking for exactly the limit would make a
    // full page look identical to an overflowing one and cry wolf about lost digests.
    expect((await runDigestSweep({ store, now, scorecardSampleLimit: 2 })).truncated).toBe(false);
    expect((await runDigestSweep({ store, now, scorecardSampleLimit: 1 })).truncated).toBe(true);
  });

  it('does not repeat itself when the numbers have not moved', async () => {
    await played('brick-storm', 12, 3);
    await runDigestSweep({ store, now });

    const nextWeek = () => Date.parse('2026-08-04T06:00:00Z');
    const result = await runDigestSweep({ store, now: nextWeek });

    expect(result.sent).toBe(0);
    expect(result.skippedUnchanged).toBe(1);
    expect(await store.listNotifications('g:alice')).toHaveLength(1);
  });

  it('sends again once something actually changed', async () => {
    await played('brick-storm', 12, 3);
    await runDigestSweep({ store, now });

    await played('brick-storm', 20, 3);
    const result = await runDigestSweep({ store, now: () => Date.parse('2026-08-04T06:00:00Z') });

    expect(result.sent).toBe(1);
    expect(await store.listNotifications('g:alice')).toHaveLength(2);
  });

  it('is idempotent within a week', async () => {
    await played('brick-storm', 12, 3);

    await runDigestSweep({ store, now });
    // A retry after a partial failure, or a scheduler that fires twice: one notification,
    // because the id is the week.
    await runDigestSweep({ store, now: () => Date.parse('2026-07-29T06:00:00Z') });

    expect(await store.listNotifications('g:alice')).toHaveLength(1);
  });

  it('sends nothing to a creator who opted out of the digest', async () => {
    await played('brick-storm', 12, 3);
    await store.setDigestOptOut('g:alice', '2026-07-20T00:00:00.000Z');

    const result = await runDigestSweep({ store, now });

    expect(result.sent).toBe(0);
    expect(result.optedOut).toBe(1);
    expect(await store.listNotifications('g:alice')).toEqual([]);
  });

  it('still sends to a creator who unsubscribed from email but not the digest', async () => {
    // The two switches mean different things. A global email unsubscribe silences the
    // email channel — the in-app bell and push are still theirs to receive.
    await played('brick-storm', 12, 3);
    await store.setEmailUnsubscribed('g:alice', '2026-07-20T00:00:00.000Z');

    const result = await runDigestSweep({ store, now });

    expect(result.sent).toBe(1);
  });

  it('leaves automation accounts alone', async () => {
    await store.upsertUser({ uid: 'bot:e2e' });
    await store.createSubmission(2, 'bot:e2e', 'Bot Game');
    await store.setSubmissionSlug(2, 'bot-game');
    await store.setSubmissionPublishedAt(2, '2026-07-02T00:00:00.000Z');
    await played('bot-game', 50);

    await runDigestSweep({ store, now });

    expect(await store.listNotifications('bot:e2e')).toEqual([]);
  });

  it('keeps going when one creator fails', async () => {
    await played('brick-storm', 12);
    const failures: string[] = [];
    const brokenStore = Object.create(store) as InMemoryStore;
    brokenStore.listNotifications = () => Promise.reject(new Error('firestore down'));

    const result = await runDigestSweep({ store: brokenStore, now, onError: (uid) => failures.push(uid) });

    expect(result.failed).toBe(1);
    expect(failures).toEqual(['g:alice']);
  });

  it('skips a game whose creator never published it', async () => {
    await store.createSubmission(98, 'g:alice', 'Draft');
    await store.setSubmissionSlug(98, 'draft-game');
    await played('draft-game', 30);

    const result = await runDigestSweep({ store, now });

    // A draft's numbers belong on its status page; the digest is about live games.
    expect(result.creators).toBe(0);
    expect(await store.listNotifications('g:alice')).toEqual([]);
  });
});

describe('POST /api/internal/digest-sweep', () => {
  it('rejects a caller without a valid scheduler token', async () => {
    const app = await buildApp({
      store: new InMemoryStore(),
      digestRoutes: { internalAuthVerifier: { verify: async () => false } },
    });
    const response = await app.inject({ method: 'POST', url: '/api/internal/digest-sweep' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('is closed by default, so an unconfigured deploy cannot be swept by anyone', async () => {
    const app = await buildApp({ store: new InMemoryStore() });
    const response = await app.inject({ method: 'POST', url: '/api/internal/digest-sweep' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('runs the sweep for an authenticated scheduler call', async () => {
    const app = await buildApp({ store: new InMemoryStore(), digestRoutes: { internalAuthVerifier: allowAll } });
    const response = await app.inject({ method: 'POST', url: '/api/internal/digest-sweep' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ sent: 0, creators: 0 });
    await app.close();
  });
});
