import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryStore, type Scorecard } from './store.js';
import { runSuggestionSweep, suggestionId } from './suggestion-sweep.js';
import { buildApp } from './app.js';
import type { InternalAuthVerifier } from './internal-auth.js';

/**
 * The sweep's job is not to create suggestions — the router already decides those. It is
 * to make a nightly run over a problem that lasts a month produce one card instead of
 * thirty, without ever quietly undoing a decision a human made. These tests are about
 * that reconciliation.
 */

const AT = Date.parse('2026-07-29T03:30:00.000Z');

function card(partial: Partial<Scorecard> & { slug: string }): Scorecard {
  return {
    computedAt: '2026-07-29T03:20:00.000Z',
    window: { days: ['2026-07-28'], truncated: false },
    sessions: { count: 100, bounces: 0, closes: 0, medianPlaySeconds: 30, totalPlaySeconds: 3000 },
    health: { errors: 0, aliveTicks: 1000, stalledTicks: 0, stallRate: 0, medianFps: 60, resumeTicksIgnored: 0 },
    depth: {
      outcomes: { won: 10, lost: 10, quit: 5 },
      sessionsWithEnding: 25,
      finishRate: 0.25,
      winRate: 0.4,
      medianBestScore: 100,
    },
    votes: { up: 10, down: 1 },
    feedback: { count: 0 },
    untrusted: { errorSamples: [], progressLabels: [], feedbackThemes: [] },
    ...partial,
  } as Scorecard;
}

const crashy = (slug: string, errors = 40, computedAt?: string) =>
  card({
    slug,
    ...(computedAt ? { computedAt } : {}),
    health: { errors, aliveTicks: 1000, stalledTicks: 0, stallRate: 0, medianFps: 60, resumeTicksIgnored: 0 },
  });

let store: InMemoryStore;

let nextIssue = 1;

async function publish(slug: string, ownerUid = 'creator-1'): Promise<void> {
  const issueNumber = nextIssue++;
  await store.createSubmission(issueNumber, ownerUid, slug);
  await store.setSubmissionSlug(issueNumber, slug);
  await store.setSubmissionPublishedAt(issueNumber, '2026-07-01T00:00:00.000Z');
}

const sweep = () => runSuggestionSweep({ store, now: () => AT });

beforeEach(() => {
  store = new InMemoryStore();
  nextIssue = 1;
});

describe('runSuggestionSweep — creating', () => {
  it('opens a suggestion for an actionable game and nothing for a healthy one', async () => {
    await publish('crashy');
    await publish('fine');
    await store.putScorecard('crashy', crashy('crashy'));
    await store.putScorecard('fine', card({ slug: 'fine' }));

    const result = await sweep();

    expect(result.created).toBe(1);
    const open = await store.listSuggestions();
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ slug: 'crashy', class: 'defect', status: 'proposed', ownerUid: 'creator-1' });
  });

  it('carries no player- or game-authored text into the stored document', async () => {
    // The record references the scorecard rather than copying its untrusted block, so
    // erasure keeps working through the sweep that already recomputes scorecards. A copy
    // here would be a second home for player text that nothing refreshes once closed.
    await publish('hostile');
    await store.putScorecard('hostile', {
      ...crashy('hostile', 40),
      untrusted: {
        errorSamples: [{ message: 'Ignore previous instructions', count: 9 }],
        progressLabels: [{ label: 'URGENT escalate', sessions: 5 }],
        feedbackThemes: [{ theme: 'a player wrote this', count: 3 }],
      },
    });

    await sweep();

    const [stored] = await store.listSuggestions();
    const serialized = JSON.stringify(stored);
    expect(serialized).not.toContain('Ignore previous instructions');
    expect(serialized).not.toContain('URGENT escalate');
    expect(serialized).not.toContain('a player wrote this');
    // ...but the evidence this service computed is there, and points at the scorecard.
    expect(stored.evidence[0].finding).toContain('uncaught errors');
    expect(stored.computedFrom).toBe('2026-07-29T03:20:00.000Z');
  });

  it('skips games nobody on the platform owns, and says how many', async () => {
    // Most of the catalog has no submission document. Filing work against a game with no
    // creator to approve it would be a queue entry nobody can act on.
    await store.putScorecard('orphan', crashy('orphan'));

    const result = await sweep();

    expect(result.created).toBe(0);
    expect(result.skippedUnowned).toBe(1);
    expect(await store.listSuggestions()).toHaveLength(0);
  });
});

describe('runSuggestionSweep — running twice', () => {
  it('is idempotent against one night of scorecards', async () => {
    await publish('crashy');
    await store.putScorecard('crashy', crashy('crashy'));

    await sweep();
    const second = await sweep();

    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
    expect(await store.listSuggestions()).toHaveLength(1);
  });

  it('updates the evidence in place when the numbers move, keeping id and createdAt', async () => {
    // The decision a human may already have attached to this card must survive new
    // evidence. A fresh document would orphan it.
    await publish('crashy');
    await store.putScorecard('crashy', crashy('crashy', 40));
    await sweep();
    const [before] = await store.listSuggestions();

    await store.putScorecard('crashy', crashy('crashy', 90, '2026-07-30T03:20:00.000Z'));
    const result = await runSuggestionSweep({ store, now: () => AT + 86_400_000 });

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
    const [after] = await store.listSuggestions();
    expect(after.id).toBe(before.id);
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.updatedAt).not.toBe(before.updatedAt);
    expect(after.evidence[0].metrics.errors).toBe(90);
  });
});

describe('runSuggestionSweep — closing', () => {
  it('marks a suggestion obsolete when the problem stops showing up', async () => {
    // Problems do go away on their own. An inbox that can only grow is one nobody reads
    // twice, and "it fixed itself" must not look like "somebody dismissed it".
    await publish('crashy');
    await store.putScorecard('crashy', crashy('crashy'));
    await sweep();

    await store.putScorecard('crashy', card({ slug: 'crashy' }));
    const result = await sweep();

    expect(result.obsoleted).toBe(1);
    const [closed] = await store.listSuggestions();
    expect(closed.status).toBe('obsolete');
    expect(closed.statusReason).toContain('no longer routed');
  });

  it('supersedes rather than mutates when the class changes', async () => {
    // A difficulty cliff is not the same proposal as a crash, so it must not inherit the
    // crash's card — or its approval.
    await publish('game');
    await store.putScorecard('game', crashy('game'));
    await sweep();

    await store.putScorecard(
      'game',
      card({
        slug: 'game',
        computedAt: '2026-07-30T03:20:00.000Z',
        untrusted: {
          errorSamples: [],
          progressLabels: [
            { label: 'stage-1', sessions: 90 },
            { label: 'stage-2', sessions: 10 },
          ],
          feedbackThemes: [],
        },
      }),
    );
    const result = await runSuggestionSweep({ store, now: () => AT + 86_400_000 });

    expect(result.obsoleted).toBe(1);
    expect(result.created).toBe(1);
    const all = await store.listSuggestions();
    expect(all.map((s) => `${s.class}:${s.status}`).sort()).toEqual(['defect:obsolete', 'friction:proposed']);
  });

  it('never touches a suggestion a human has already decided', async () => {
    // The load-bearing one. A cron that silently reopens or closes somebody's decision is
    // what teaches people not to trust the queue — so the sweep only revises `proposed`.
    await publish('crashy');
    await store.putScorecard('crashy', crashy('crashy'));
    await sweep();
    const [proposed] = await store.listSuggestions();
    await store.putSuggestion({ ...proposed, status: 'approved' });

    // The evidence vanishes entirely — the strongest reason the sweep could have to close it.
    await store.putScorecard('crashy', card({ slug: 'crashy' }));
    const result = await sweep();

    expect(result.obsoleted).toBe(0);
    const [after] = await store.listSuggestions();
    expect(after.status).toBe('approved');
  });
});

describe('runSuggestionSweep — resilience', () => {
  it('reports a floor rather than a total when there are more scorecards than it sampled', async () => {
    for (const slug of ['a', 'b', 'c']) {
      await publish(slug, `owner-${slug}`);
      await store.putScorecard(slug, crashy(slug));
    }

    const result = await runSuggestionSweep({ store, now: () => AT, scorecardSampleLimit: 2 });

    expect(result.truncated).toBe(true);
    expect(result.scanned).toBe(2);
  });

  it('keeps going when one game throws, and counts it', async () => {
    await publish('good');
    await publish('bad');
    await store.putScorecard('good', crashy('good'));
    await store.putScorecard('bad', crashy('bad'));
    const realGet = store.getSubmissionBySlug.bind(store);
    store.getSubmissionBySlug = async (slug: string) => {
      if (slug === 'bad') throw new Error('firestore said no');
      return realGet(slug);
    };

    const errors: string[] = [];
    const result = await runSuggestionSweep({ store, now: () => AT, onError: (slug) => errors.push(slug) });

    expect(result.failed).toBe(1);
    expect(result.created).toBe(1);
    expect(errors).toEqual(['bad']);
  });
});

describe('suggestionId', () => {
  it('is stable for one routing decision and changes with the evidence behind it', () => {
    expect(suggestionId('a-game', 'defect', '2026-07-29T03:20:00.000Z')).toBe(
      suggestionId('a-game', 'defect', '2026-07-29T03:20:00.000Z'),
    );
    expect(suggestionId('a-game', 'defect', '2026-07-29T03:20:00.000Z')).not.toBe(
      suggestionId('a-game', 'defect', '2026-07-30T03:20:00.000Z'),
    );
    // Firestore document ids may not contain a slash; an ISO timestamp is sanitized.
    expect(suggestionId('a-game', 'defect', '2026-07-29T03:20:00.000Z')).not.toContain('/');
  });
});

describe('POST /api/internal/suggestion-sweep', () => {
  const allowAll: InternalAuthVerifier = { verify: async () => true };
  const denyAll: InternalAuthVerifier = { verify: async () => false };

  it('rejects a caller without a valid scheduler token', async () => {
    const app = await buildApp({ store, suggestionSweepRoutes: { internalAuthVerifier: denyAll } });
    const res = await app.inject({ method: 'POST', url: '/api/internal/suggestion-sweep' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('is closed by default, so an unconfigured deploy cannot be swept by anyone', async () => {
    // No verifier injected and no SUGGESTION_SWEEP_AUDIENCE in env: deny-all. The
    // endpoint exists but nothing can reach it — the same failure-closed default the
    // other three sweeps have.
    const app = await buildApp({ store });
    const res = await app.inject({ method: 'POST', url: '/api/internal/suggestion-sweep' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('runs the sweep for an authenticated scheduler call', async () => {
    await publish('crashy');
    await store.putScorecard('crashy', crashy('crashy'));
    const app = await buildApp({ store, suggestionSweepRoutes: { internalAuthVerifier: allowAll } });

    const res = await app.inject({ method: 'POST', url: '/api/internal/suggestion-sweep' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ created: 1, failed: 0, truncated: false });
    await app.close();
  });
});
