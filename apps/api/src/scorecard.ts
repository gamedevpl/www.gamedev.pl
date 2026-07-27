import type { FastifyInstance } from 'fastify';
import type { InternalAuthVerifier } from './internal-auth.js';
import {
  recentPartitions,
  scanPartitions,
  summarizeGameHealth,
  type GameHealth,
  type PartitionScanBudget,
} from './telemetry-health.js';
import type { Scorecard, Store, TelemetryEvent } from './store.js';

/**
 * The scorecard sweep (docs/improvement-loop-plan.md IL-2 "Distill").
 *
 * Rolls a window of raw play events, plus vote and feedback counts, into one
 * `games/{slug}/scorecard/current` doc per game. This is the seam the plan reserves for
 * agents: IL-3 reads scorecards, never raw events, which is what keeps the number of
 * places untrusted game-supplied strings can reach an agent down to one — and that one
 * is quarantined under `untrusted` (see `Scorecard` in store.ts).
 *
 * Why a scheduled batch rather than computing on read, when the operator page already
 * computes on read: the operator page is one human clicking occasionally, and its cost
 * is bounded by that. A scorecard is meant to be read by the babysitter run for *every*
 * game, repeatedly, and to survive the 90-day expiry of the rows it was derived from.
 * Recomputing that per read would be both more expensive and less correct — a scorecard
 * has to keep meaning something after the events behind it are gone.
 *
 * Deliberately **not** attributed: built from play telemetry (which carries no identity
 * by construction) plus vote/feedback *counts*. No uid, and no feedback text, reaches a
 * scorecard.
 */

/** Rolling window the plan specifies for a scorecard. */
export const SCORECARD_WINDOW_DAYS = 28;

/**
 * Read budget for one sweep.
 *
 * Wider than the operator page's, and deliberately so: this runs once a night and every
 * reader of every scorecard shares the cost, where the page pays per click. Still
 * bounded — an unbounded nightly job is how a quiet month and a busy one end up costing
 * the same as an outage. When it binds, `window.truncated` says so on every doc written,
 * so a floor is never mistaken for a total.
 */
const SWEEP_BUDGET: PartitionScanBudget = { perDay: 5_000, total: 50_000 };

export interface ScorecardSweepDeps {
  store: Store;
  now?: () => number;
  windowDays?: number;
  budget?: PartitionScanBudget;
}

export interface ScorecardSweepResult {
  /** Partitions actually read, most recent first. */
  days: string[];
  truncated: boolean;
  /** Games a scorecard was written for. */
  written: number;
  /** Games whose write failed; the sweep continues past them rather than aborting. */
  failed: number;
}

/**
 * Builds one game's scorecard from its health row plus its counts.
 *
 * Pure, so every judgement below is testable without a database: which fields become
 * null for want of evidence, and which attacker-controlled strings get quarantined.
 */
export function buildScorecard(
  health: GameHealth,
  extras: { votes: { up: number; down: number }; feedbackCount: number },
  window: { days: string[]; truncated: boolean },
  computedAt: string,
): Scorecard {
  const endings = health.outcomes.won + health.outcomes.lost + health.outcomes.quit;
  return {
    slug: health.slug,
    computedAt,
    window,
    sessions: {
      count: health.sessions,
      bounces: health.bounces,
      closes: health.closes,
      medianPlaySeconds: health.medianPlaySeconds,
      totalPlaySeconds: health.totalPlaySeconds,
    },
    health: {
      errors: health.errors,
      aliveTicks: health.aliveTicks,
      stalledTicks: health.stalledTicks,
      stallRate: health.stallRate,
      medianFps: health.medianFps,
      resumeTicksIgnored: health.resumeTicksIgnored,
    },
    depth: {
      outcomes: health.outcomes,
      sessionsWithEnding: health.sessionsWithEnding,
      // `summarizeGameHealth` reports 0 here when a game emitted no endings, which reads
      // as "nobody finishes this" when it actually means "this game never says". The
      // scorecard is what an agent acts on, so the difference is made explicit: null
      // when there is no evidence either way.
      finishRate: endings === 0 ? null : health.finishRate,
      winRate: health.winRate,
      medianBestScore: health.medianBestScore,
    },
    votes: extras.votes,
    feedback: { count: extras.feedbackCount },
    untrusted: {
      errorSamples: health.errorSamples,
      progressLabels: health.progressLabels,
    },
  };
}

/**
 * Recomputes every scorecard the window has evidence for.
 *
 * Scoped to games that appear in the telemetry window rather than to the whole catalog:
 * a scorecard for a game nobody opened would be a page of zeros, and zeros are exactly
 * what the "absence of evidence" rule says not to manufacture. The cost is that a game
 * with votes but no plays in the window gets no scorecard — acceptable while the loop's
 * entire purpose is reasoning about games that are actually played.
 */
export async function runScorecardSweep(deps: ScorecardSweepDeps): Promise<ScorecardSweepResult> {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  const budget = deps.budget ?? SWEEP_BUDGET;
  const currentTime = now();

  const requested = recentPartitions(deps.windowDays ?? SCORECARD_WINDOW_DAYS, currentTime);
  const { events, scanned, truncated } = await scanPartitions<TelemetryEvent>(requested, budget, (dateStr, limit) =>
    store.listTelemetryEvents(dateStr, { limit }),
  );

  const window = { days: scanned, truncated };
  const computedAt = new Date(currentTime).toISOString();
  const rows = summarizeGameHealth(events);

  let written = 0;
  let failed = 0;
  for (const health of rows) {
    try {
      const [votes, feedbackCount] = await Promise.all([
        store.getVoteCounts(health.slug),
        store.countPlayerFeedback(health.slug),
      ]);
      await store.putScorecard(health.slug, buildScorecard(health, { votes, feedbackCount }, window, computedAt));
      written += 1;
    } catch {
      // One unwritable game must not cost every later game its scorecard — the same
      // rule the notification sweep follows for one bad submission.
      failed += 1;
    }
  }

  return { days: scanned, truncated, written, failed };
}

export interface ScorecardRoutesOptions {
  store: Store;
  /** OIDC verifier for the scheduler; deny-all when the sweep is not configured. */
  internalAuthVerifier: InternalAuthVerifier;
  now?: () => number;
  windowDays?: number;
  budget?: PartitionScanBudget;
}

export async function registerScorecardRoutes(app: FastifyInstance, options: ScorecardRoutesOptions): Promise<void> {
  const { store, internalAuthVerifier } = options;

  // Cloud Scheduler POSTs here nightly with an OIDC token, exactly as the notification
  // sweep does. The rate ceiling is a runaway guard, not the access control — OIDC is.
  app.post(
    '/api/internal/scorecard-sweep',
    { config: { rateLimit: { max: 24, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!(await internalAuthVerifier.verify(request.headers.authorization))) {
        return reply.status(401).send({ error: 'unauthorized' });
      }

      try {
        const result = await runScorecardSweep({
          store,
          now: options.now,
          windowDays: options.windowDays,
          budget: options.budget,
        });
        request.log.info({ ...result }, 'scorecard sweep complete');
        return reply.send(result);
      } catch (error) {
        request.log.error({ err: error }, 'scorecard sweep failed');
        return reply.status(500).send({ error: 'scorecard sweep failed' });
      }
    },
  );
}
