import type { FastifyInstance } from 'fastify';
import type { InternalAuthVerifier } from './internal-auth.js';
import { routeScorecard, type StoredSuggestion, type SuggestionClass } from './suggestions.js';
import type { Store } from './store.js';

/**
 * The suggestion sweep (docs/improvement-loop-plan.md IL-3 "Suggest").
 *
 * Runs the router in [suggestions.ts](./suggestions.ts) over every scorecard the nightly
 * Distill step produced and writes the answer to `games/{slug}/suggestion/current`.
 *
 * **Why persist at all, when `GET /api/admin/suggestions` already computes this on read.**
 * The read path answers "what does the router think right now" for one operator clicking
 * once. This answers a different question, and it is the one the rest of IL-3 needs: what
 * did the router say *last night*, so that an inbox can carry a decision against it, and
 * so a suggestion outlives the scorecard it came from — scorecards are overwritten by
 * every sweep, and the evidence behind a proposal has to still exist when somebody acts
 * on it. The two must not disagree, which is why both run the same pure `routeScorecard`
 * rather than each deriving its own view.
 *
 * **This still files nothing.** No issue, no assignment, no notification, no agent. The
 * plan's order is deliberate: the router is watched saying what it would do, then it is
 * persisted saying it, and only then does anything downstream read it. Each step is one a
 * human can inspect before the next is built on it.
 *
 * Reads scorecards, never raw events — the same seam the scorecard sweep exists to
 * create, which is what keeps the number of places a game-supplied string can reach an
 * agent down to one, quarantined under `untrustedContext`.
 */

/**
 * Scorecards read in one sweep.
 *
 * Matches the operator page's bound rather than being unbounded: the catalog is the
 * ceiling either way, and an unbounded nightly query is how a quiet month and a runaway
 * one cost the same. When it binds, the result says so — a silently truncated sweep would
 * leave games with a stale suggestion that reads exactly like a current one.
 */
const SWEEP_SCORECARD_LIMIT = 200;

export interface SuggestionSweepDeps {
  store: Store;
  now?: () => number;
  scorecardLimit?: number;
  /** Called per game that could not be written, so a failure has a cause and not just a count. */
  onError?: (slug: string, error: unknown) => void;
}

export interface SuggestionSweepResult {
  /** Scorecards the router was run over. */
  routed: number;
  /** Suggestions actually persisted. */
  written: number;
  /** Games whose write failed; the sweep continues past them rather than aborting. */
  failed: number;
  /**
   * How the routed games split across classes.
   *
   * Every class is present with a count, including the zeros. A summary that omitted
   * empty classes would make "no defects tonight" and "the defect branch stopped being
   * reachable" print identically, and this is a job nobody watches.
   */
  classes: Record<SuggestionClass, number>;
  /** True when `scorecardLimit` bound before every scorecard was routed. */
  truncated: boolean;
  /** Newest scorecard the run saw, or null when there were none — the freshness of the input. */
  computedFrom: string | null;
}

function emptyClassCounts(): Record<SuggestionClass, number> {
  return { defect: 0, friction: 0, 'design-change': 0, healthy: 0, 'insufficient-data': 0 };
}

/**
 * Routes every current scorecard and persists the result.
 *
 * Scoped to games that *have* a scorecard rather than to the whole catalog, inheriting the
 * scorecard sweep's "absence of evidence" rule for free: a game nobody played has no
 * scorecard, so it gets no suggestion, rather than a manufactured `insufficient-data` doc
 * asserting we looked. `insufficient-data` here means the opposite — measured, and not
 * measured *enough* — and the two must stay distinguishable.
 */
export async function runSuggestionSweep(deps: SuggestionSweepDeps): Promise<SuggestionSweepResult> {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  const limit = deps.scorecardLimit ?? SWEEP_SCORECARD_LIMIT;
  const sweptAt = new Date(now()).toISOString();

  // One more than the limit, so a full page is distinguishable from an exactly-full one:
  // reading `limit` rows tells you nothing about whether a `limit + 1`-th existed.
  const scorecards = await store.listScorecards({ limit: limit + 1 });
  const truncated = scorecards.length > limit;
  const routable = truncated ? scorecards.slice(0, limit) : scorecards;

  const classes = emptyClassCounts();
  let written = 0;
  let failed = 0;

  for (const card of routable) {
    try {
      const suggestion: StoredSuggestion = { ...routeScorecard(card), sweptAt };
      await store.putSuggestion(card.slug, suggestion);
      classes[suggestion.class] += 1;
      written += 1;
    } catch (error) {
      // One unwritable game must not cost every later game its suggestion — the same rule
      // the scorecard and notification sweeps follow. And not silent either: the failure
      // most likely here is production-only and uniform (Firestore rejects `undefined`
      // field values and this client sets no `ignoreUndefinedProperties`), so every game
      // would fail identically and a bare count would show the symptom with no cause.
      failed += 1;
      deps.onError?.(card.slug, error);
    }
  }

  return {
    routed: routable.length,
    written,
    failed,
    classes,
    truncated,
    // The newest scorecard, not this run's own clock: it is what says whether the sweep
    // upstream is still alive. A router run over month-old scorecards succeeds, reports
    // every game healthy, and is worthless — and this is the field that shows it.
    computedFrom: routable[0]?.computedAt ?? null,
  };
}

export interface SuggestionRoutesOptions {
  store: Store;
  /** OIDC verifier for the scheduler; deny-all when the sweep is not configured. */
  internalAuthVerifier: InternalAuthVerifier;
  now?: () => number;
  scorecardLimit?: number;
}

export async function registerSuggestionRoutes(app: FastifyInstance, options: SuggestionRoutesOptions): Promise<void> {
  const { store, internalAuthVerifier } = options;

  // Cloud Scheduler POSTs here nightly with an OIDC token, exactly as the scorecard,
  // digest and notification sweeps do. The rate ceiling is a runaway guard, not the
  // access control — OIDC is.
  app.post(
    '/api/internal/suggestion-sweep',
    { config: { rateLimit: { max: 24, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!(await internalAuthVerifier.verify(request.headers.authorization))) {
        return reply.status(401).send({ error: 'unauthorized' });
      }

      try {
        const result = await runSuggestionSweep({
          store,
          now: options.now,
          scorecardLimit: options.scorecardLimit,
          onError: (slug, error) => request.log.error({ err: error, slug }, 'suggestion write failed'),
        });
        // Error level when anything failed: a nightly job nobody watches is exactly the
        // kind that fails quietly for weeks, and `failed > 0` is the signal.
        const log = result.failed > 0 ? request.log.error.bind(request.log) : request.log.info.bind(request.log);
        log({ ...result }, 'suggestion sweep complete');
        return reply.send(result);
      } catch (error) {
        request.log.error({ err: error }, 'suggestion sweep failed');
        return reply.status(500).send({ error: 'suggestion sweep failed' });
      }
    },
  );
}
