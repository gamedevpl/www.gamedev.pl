import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { InMemoryStore, type Scorecard } from './store.js';
import { runSuggestionSweep } from './suggestion-sweep.js';
import { routeAll } from './suggestions.js';
import type { InternalAuthVerifier } from './internal-auth.js';

/**
 * The sweep's job is narrow — route what the scorecard sweep produced, and write it down —
 * so these tests are about the ways a nightly job nobody watches fails quietly: routing
 * stale input and reporting success, hiding a partial run behind a total, and being open
 * to callers it was never meant to have.
 */

function card(partial: Partial<Scorecard> & { slug: string }): Scorecard {
  return {
    computedAt: '2026-07-30T03:20:00.000Z',
    window: { days: ['2026-07-30'], truncated: false },
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
    feedback: { count: 2 },
    untrusted: { errorSamples: [], progressLabels: [], feedbackThemes: [] },
    ...partial,
  } as Scorecard;
}

const crashing = (slug: string) =>
  card({
    slug,
    health: { errors: 50, aliveTicks: 1000, stalledTicks: 0, stallRate: 0, medianFps: 60, resumeTicksIgnored: 0 },
  });

const allowAll: InternalAuthVerifier = { verify: async () => true };
const denyAll: InternalAuthVerifier = { verify: async () => false };

const at = (iso: string) => () => Date.parse(iso);

describe('runSuggestionSweep', () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('persists one suggestion per scorecard, with the evidence the router gave', async () => {
    await store.putScorecard('brick-storm', crashing('brick-storm'));

    const result = await runSuggestionSweep({ store, now: at('2026-07-30T03:30:00.000Z') });

    expect(result).toMatchObject({ routed: 1, written: 1, failed: 0, truncated: false });
    const stored = await store.getSuggestion('brick-storm');
    expect(stored?.class).toBe('defect');
    expect(stored?.evidence[0].metrics).toMatchObject({ errors: 50, sessions: 100 });
  });

  it('keeps both timestamps, so a dead scorecard sweep is distinguishable from a dead router', async () => {
    // The input is a month old; the run is tonight. One stamp would report whichever half
    // is fresh and hide the other — and "router ran fine over stale numbers" is exactly
    // the failure that produces confident, worthless output.
    await store.putScorecard('stale-game', card({ slug: 'stale-game', computedAt: '2026-06-30T03:20:00.000Z' }));

    const result = await runSuggestionSweep({ store, now: at('2026-07-30T03:30:00.000Z') });

    expect(result.computedFrom).toBe('2026-06-30T03:20:00.000Z');
    const stored = await store.getSuggestion('stale-game');
    expect(stored?.computedFrom).toBe('2026-06-30T03:20:00.000Z');
    expect(stored?.sweptAt).toBe('2026-07-30T03:30:00.000Z');
  });

  it('counts every class including the empty ones', async () => {
    // A summary that omitted zeros would print identically whether there were no defects
    // tonight or the defect branch had stopped being reachable at all.
    await store.putScorecard('fine', card({ slug: 'fine' }));

    const result = await runSuggestionSweep({ store });

    expect(result.classes).toEqual({
      defect: 0,
      friction: 0,
      'design-change': 0,
      healthy: 1,
      'insufficient-data': 0,
    });
  });

  it('writes no suggestion for a game that has no scorecard', async () => {
    // Absence of evidence, inherited from the sweep upstream: a game nobody played must
    // not get a doc asserting we looked at it. `insufficient-data` means the opposite —
    // measured, and not measured enough — and the two have to stay distinguishable.
    const result = await runSuggestionSweep({ store });

    expect(result).toMatchObject({ routed: 0, written: 0, computedFrom: null });
    expect(await store.getSuggestion('never-played')).toBeNull();
  });

  it('reports truncation rather than presenting a floor as a total', async () => {
    for (const slug of ['a-game', 'b-game', 'c-game']) await store.putScorecard(slug, card({ slug }));

    const result = await runSuggestionSweep({ store, scorecardLimit: 2 });

    expect(result).toMatchObject({ routed: 2, written: 2, truncated: true });
  });

  it('does not call a run of exactly the limit truncated', async () => {
    // The off-by-one that would make every full sweep cry wolf: reading `limit` rows says
    // nothing about whether a `limit + 1`-th existed, which is why the read asks for one more.
    for (const slug of ['a-game', 'b-game']) await store.putScorecard(slug, card({ slug }));

    const result = await runSuggestionSweep({ store, scorecardLimit: 2 });

    expect(result).toMatchObject({ routed: 2, truncated: false });
  });

  it('continues past a game it cannot write, and says which one failed', async () => {
    // One unwritable game must not cost every later game its suggestion — but the count
    // alone would show a symptom with no cause, and the likeliest failure here is uniform
    // across every game.
    await store.putScorecard('good-game', card({ slug: 'good-game' }));
    await store.putScorecard('bad-game', card({ slug: 'bad-game' }));
    const failures: string[] = [];
    const put = store.putSuggestion.bind(store);
    store.putSuggestion = async (slug, suggestion) => {
      if (slug === 'bad-game') throw new Error('firestore rejected the write');
      await put(slug, suggestion);
    };

    const result = await runSuggestionSweep({ store, onError: (slug) => failures.push(slug) });

    expect(result).toMatchObject({ routed: 2, written: 1, failed: 1 });
    expect(failures).toEqual(['bad-game']);
  });

  it('agrees with the read-path router, because both run the same routing function', async () => {
    // The persisted answer and the operator page's on-read answer disagreeing is the one
    // bug that would be invisible from either side alone.
    await store.putScorecard('brick-storm', crashing('brick-storm'));
    await runSuggestionSweep({ store });

    const stored = await store.getSuggestion('brick-storm');
    const onRead = routeAll(await store.listScorecards())[0];
    // The stored doc is the read-path answer, plus the stamp saying when it was stored.
    expect(stored).toEqual({ ...onRead, sweptAt: stored?.sweptAt });
  });

  it('orders the listing worst first, with slug as the tie-break', async () => {
    // Every doc a sweep writes shares one `sweptAt` and the passed-over ones all score 0,
    // so equal priorities are the normal case rather than an edge one.
    await store.putScorecard('zeta', card({ slug: 'zeta' }));
    await store.putScorecard('alpha', card({ slug: 'alpha' }));
    await store.putScorecard('crashy', crashing('crashy'));
    await runSuggestionSweep({ store });

    expect((await store.listSuggestions()).map((s) => s.slug)).toEqual(['crashy', 'alpha', 'zeta']);
  });
});

describe('POST /api/internal/suggestion-sweep', () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('rejects a caller without a valid scheduler token', async () => {
    const app = await buildApp({ store, suggestionRoutes: { internalAuthVerifier: denyAll } });
    const res = await app.inject({ method: 'POST', url: '/api/internal/suggestion-sweep' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('is closed by default, so an unconfigured deploy cannot be swept by anyone', async () => {
    // No verifier injected and no SUGGESTION_SWEEP_AUDIENCE in env: deny-all.
    const app = await buildApp({ store });
    const res = await app.inject({ method: 'POST', url: '/api/internal/suggestion-sweep' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('runs the sweep for an authenticated scheduler call', async () => {
    await store.putScorecard('brick-storm', crashing('brick-storm'));
    const app = await buildApp({ store, suggestionRoutes: { internalAuthVerifier: allowAll } });

    const res = await app.inject({ method: 'POST', url: '/api/internal/suggestion-sweep' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ routed: 1, written: 1, failed: 0 });
    expect(await store.getSuggestion('brick-storm')).not.toBeNull();
    await app.close();
  });
});
