import type { FastifyInstance } from 'fastify';
import type { BuilderKind } from '../builder.js';
import type { ManagedUnavailableReason } from '../agent-surface/managed-availability.js';
import type { InternalAuthVerifier } from '../internal-auth.js';
import {
  aggregateCreatorAssessments,
  playSignalWinsOverEditorial,
  routeEditorialAggregate,
} from './editorial-suggestions.js';
import { isReviewableCreatorDraft } from './review.js';
import { routeScorecard, type Suggestion, type SuggestionClass } from './suggestions.js';
import {
  OPEN_SUGGESTION_STATUSES,
  type Scorecard,
  type Store,
  type SubmissionRecord,
  type SuggestionRecord,
} from '../store.js';
import { advanceSuggestionOutcomes } from './suggestion-outcomes.js';
import {
  AUTONOMOUS_ACTOR,
  budgetVerdict,
  DEFAULT_AUTONOMY,
  mayActAutonomously,
  wantsSuggestions,
  type AutonomyMode,
} from '../autonomy.js';
import { hypothesisMetric, metricFromScorecard } from './suggestion-outcomes.js';

/**
 * The analyst run (docs/improvement-loop-plan.md IL-3): persists what the router says.
 *
 * The router itself is pure and computed on read. This is the scheduled half that turns
 * its opinion into documents a creator can be shown and a decision can be attached to.
 * It still **files nothing and notifies nobody** — approving is a separate, human step.
 *
 * The interesting half is not creating suggestions but *not* creating them twice. A
 * nightly sweep over a problem that persists for a month must produce one card, not
 * thirty, so this reconciles against the open set rather than appending:
 *
 * - the same game still routing to the same class **updates** its existing suggestion,
 *   keeping the id, the status and the original `createdAt` — the evidence moves, the
 *   decision it is attached to does not;
 * - a game that now routes to a *different* class marks the old one `obsolete` and opens
 *   a new one, because a difficulty cliff is not the same proposal as a crash;
 * - a game that stops routing to anything actionable marks its open suggestion
 *   `obsolete` too. Problems do go away on their own, and an inbox that can only grow is
 *   one nobody reads twice.
 *
 * Only `proposed` suggestions are revised or closed. Once a human has approved or
 * rejected one, the sweep leaves it alone: work may already be underway, and a cron
 * silently reopening or closing a decision somebody made is exactly the behaviour that
 * teaches people not to trust the queue.
 */

/** Classes worth a card. `healthy` and `insufficient-data` are answers, not work. */
const ACTIONABLE: readonly SuggestionClass[] = ['defect', 'friction', 'design-change', 'editorial'];

export function isActionable(suggestionClass: SuggestionClass): boolean {
  return ACTIONABLE.includes(suggestionClass);
}

/**
 * How many scorecards one run will consider.
 *
 * Same ceiling and the same `limit + 1` probe as the digest, for the same reason: asking
 * for exactly the limit makes a full page indistinguishable from an overflowing one.
 */
export const MAX_SCORECARDS_SAMPLED = 1_000;

/** Leftover per-game suggestion docs deleted per run. See `purgeLegacyGameSuggestions`. */
const LEGACY_PURGE_PER_RUN = 300;

/**
 * The id a suggestion is *created* with: `(slug, class, the scorecard behind it)`.
 *
 * That makes re-running the sweep against one night's scorecards idempotent by
 * construction rather than by a guard — the same evidence produces the same id and
 * overwrites its own document, and a game cannot route to two classes off one scorecard.
 *
 * Stated as "created with" rather than as a standing invariant, because it stops being
 * derivable the moment the evidence moves: an update keeps the id and advances
 * `computedFrom`, deliberately, so a decision already attached to the card survives. An
 * id is therefore a stable handle, not a checksum — do not recompute one to find a
 * record, and do not read `computedFrom` back out of it.
 */
export function suggestionId(slug: string, suggestionClass: string, computedFrom: string): string {
  const stamp = computedFrom.replace(/[^0-9A-Za-z]/g, '-');
  return `sug-${slug}-${suggestionClass}-${stamp}`;
}

export interface SuggestionSweepResult {
  scanned: number;
  /** Suggestions the platform started work on itself, within budget (IL-4). */
  autoDispatched: number;
  /** Eligible, but a budget ceiling stopped it. Counted so a quiet night is explicable. */
  autoWithheld: number;
  /** Games whose creator set `digest-only`. Counted rather than skipped silently. */
  mutedByCreator: number;
  /**
   * Documents removed from the superseded per-game suggestion collection.
   *
   * Expected to drain to zero within a run or two and stay there. A number that keeps
   * appearing means something is still writing them.
   */
  legacyPurged: number;
  /** True when there were more scorecards than the sample limit — a floor, not a total. */
  truncated: boolean;
  created: number;
  updated: number;
  obsoleted: number;
  /** Games with no submission, unpublished, or abandoned — nobody to propose work to. */
  skippedUnowned: number;
  skippedPlayWins: number;
  failed: number;
}

export interface SuggestionSweepDeps {
  store: Store;
  now?: () => number;
  scorecardSampleLimit?: number;
  onError?: (slug: string, error: unknown) => void;
  /**
   * Starts work without asking, for games whose creator opted in.
   *
   * Absent means the sweep proposes and never acts — which is also what every game gets
   * regardless, unless its owner changed the setting.
   */
  startImprovementRound?: (input: {
    issueNumber: number;
    text: string;
    title: string;
    locale: string;
    log: { error: (context: object, message: string) => void };
    builder?: BuilderKind;
  }) => Promise<{ route: 'job'; jobId: number } | { route: 'unavailable'; reason: ManagedUnavailableReason } | null>;
  /** Builds the brief an autonomously dispatched agent receives. */
  buildBrief?: (record: SuggestionRecord, untrusted: Scorecard['untrusted'] | null) => string;
  log?: { error: (context: object, message: string) => void };
}

function evidenceOf(routed: Suggestion): SuggestionRecord['evidence'] {
  // The router's `untrustedContext` is deliberately dropped here — see SuggestionRecord.
  return routed.evidence.map((item) => ({ finding: item.finding, metrics: { ...item.metrics } }));
}

function sameEvidence(a: SuggestionRecord, routed: Suggestion): boolean {
  return (
    a.priority === routed.priority &&
    a.computedFrom === routed.computedFrom &&
    JSON.stringify(a.evidence) === JSON.stringify(evidenceOf(routed))
  );
}

export async function runSuggestionSweep(deps: SuggestionSweepDeps): Promise<SuggestionSweepResult> {
  const { store } = deps;
  const currentTime = deps.now ? deps.now() : Date.now();
  const at = new Date(currentTime).toISOString();

  const sampleLimit = deps.scorecardSampleLimit ?? MAX_SCORECARDS_SAMPLED;
  const sampled = await store.listScorecards({ limit: sampleLimit + 1 });
  const truncated = sampled.length > sampleLimit;
  const cards: Scorecard[] = sampled.slice(0, sampleLimit);

  // One read for the whole open set rather than one per game: the sweep already holds
  // every scorecard, and a per-slug lookup would be a query per catalog entry to answer
  // a question one query answers.
  // No limit: this is the set the reconciliation is checked against, and a bounded read
  // that quietly dropped an open suggestion would open a second one for the same game.
  const open = await store.listSuggestions({ status: [...OPEN_SUGGESTION_STATUSES] });
  const openBySlug = new Map<string, SuggestionRecord>();
  for (const record of open) {
    // Ordered worst-first by the shared comparator, so the first per slug is the one a
    // reader would have acted on. A second is not expected; keeping the first rather
    // than the last makes the choice deterministic if one ever appears.
    if (!openBySlug.has(record.slug)) openBySlug.set(record.slug, record);
  }

  let created = 0;
  let updated = 0;
  let obsoleted = 0;
  let skippedUnowned = 0;
  let skippedPlayWins = 0;
  let failed = 0;
  let autoDispatched = 0;
  let autoWithheld = 0;
  let mutedByCreator = 0;

  // Finishing the previous design's migration rather than tidying: those documents hold a
  // frozen copy of player- and game-authored text that nothing refreshes and the erase
  // path cannot find. Bounded per run so a large backlog is drained over a few nights
  // instead of turning one nightly job into an unbounded delete.
  const legacyPurged = await store.purgeLegacyGameSuggestions(LEGACY_PURGE_PER_RUN);

  // Read once for the whole run: the budget is a property of the day and the week, not of
  // whichever game happens to be considered first.
  const decided = await store.listSuggestions({ status: ['dispatched', 'published', 'measured'] });

  const closeOpen = async (record: SuggestionRecord, reason: string): Promise<void> => {
    await store.putSuggestion({ ...record, status: 'obsolete', statusReason: reason, updatedAt: at });
    obsoleted += 1;
  };

  for (const card of cards) {
    try {
      const routed = routeScorecard(card);
      const existing = openBySlug.get(card.slug);

      if (!isActionable(routed.class)) {
        // Closed by measurement rather than by a human: the evidence that opened it is
        // no longer there. Worth recording the reason, because "it fixed itself" and
        // "somebody dismissed it" should not look the same later.
        if (existing) await closeOpen(existing, `no longer routed as ${existing.class}`);
        continue;
      }

      // The *published* job, not the newest one touching this slug. An improvement is a
      // new job on an existing game, so a game with work in flight has an unpublished
      // submission as its most recent — and asking for the newest would read that as
      // "no longer published" and close the very suggestion that commissioned the work.
      //
      // A game with no submission at all has no creator on this platform to propose to.
      // Counted rather than skipped silently: this is most of the catalog, and a reader
      // comparing `scanned` against `created` deserves to see where the rest went.
      const submission = await store.getPublishedSubmissionBySlug(card.slug);
      if (!submission) {
        if (existing) await closeOpen(existing, 'game is no longer published');
        skippedUnowned += 1;
        continue;
      }

      if (existing && existing.class === routed.class) {
        if (sameEvidence(existing, routed)) continue;
        await store.putSuggestion({
          ...existing,
          priority: routed.priority,
          evidence: evidenceOf(routed),
          computedFrom: routed.computedFrom,
          updatedAt: at,
        });
        updated += 1;
        continue;
      }

      if (existing) {
        await closeOpen(existing, `evidence now routes this game as ${routed.class}`);
      }

      const fresh: SuggestionRecord = {
        id: suggestionId(card.slug, routed.class, routed.computedFrom),
        slug: card.slug,
        ownerUid: submission.ownerUid,
        class: routed.class,
        priority: routed.priority,
        evidence: evidenceOf(routed),
        status: 'proposed',
        computedFrom: routed.computedFrom,
        createdAt: at,
        updatedAt: at,
      };

      // IL-4. Default is `suggest`, so a game whose owner never touched this setting is
      // only ever proposed to — acting on it would be work nobody agreed to.
      const mode = ((await store.getGameAutonomy(card.slug)) ?? DEFAULT_AUTONOMY) as AutonomyMode;

      // `digest-only` is "leave me alone": no card, and nothing acted on. The digest still
      // reports the game's numbers, which is the whole point of the setting having a name
      // rather than being an off switch.
      if (!wantsSuggestions(mode)) {
        mutedByCreator += 1;
        continue;
      }

      if (!mayActAutonomously(mode, routed.class) || !deps.startImprovementRound || !deps.buildBrief) {
        await store.putSuggestion(fresh);
        created += 1;
        continue;
      }

      const verdict = budgetVerdict({ decided, slug: card.slug, now: currentTime });
      if (!verdict.allowed) {
        // Left `proposed` rather than dropped: the creator can still approve it by hand,
        // and a budget ceiling is a reason to wait, not a reason to forget.
        await store.putSuggestion({ ...fresh, statusReason: verdict.reason });
        created += 1;
        autoWithheld += 1;
        continue;
      }

      const metric = hypothesisMetric(routed.class);
      const outcome = await deps.startImprovementRound({
        issueNumber: submission.issueNumber,
        text: deps.buildBrief(fresh, card.untrusted),
        title: `Improve ${card.slug}: ${routed.class}`,
        locale: submission.locale ?? 'en',
        log: deps.log ?? { error: () => {} },
      });
      // No creator waiting on the reason — treated like any other failed start.
      const started = outcome?.route === 'job' ? outcome : null;

      await store.putSuggestion({
        ...fresh,
        // Attributed to the platform, not to a person. That is what lets the budget read
        // above tell autonomous starts apart from creator approvals, and what lets a
        // creator see that they did not ask for this.
        decidedBy: AUTONOMOUS_ACTOR,
        decidedAt: at,
        ...(metric ? { baseline: { at, metrics: { [metric.key]: metricFromScorecard(card, metric.key) } } } : {}),
        ...(started
          ? { status: 'dispatched' as const, jobId: started.jobId }
          : {
              status: 'no-implementer' as const,
              statusReason: 'could not start a round of work; this can be retried',
            }),
      });
      created += 1;
      if (started) {
        autoDispatched += 1;
        // Counted against this run's own budget too, so two eligible games cannot both
        // spend the last slot.
        decided.push({ ...fresh, decidedBy: AUTONOMOUS_ACTOR, decidedAt: at });
      }
    } catch (error) {
      // One game's failure must not cost the rest of the sweep. Counted so a run that
      // wrote nothing because everything threw cannot read as a quiet night.
      failed += 1;
      deps.onError?.(card.slug, error);
    }
  }

  // Refresh open map so editorial sees play winners.
  openBySlug.clear();
  for (const record of await store.listSuggestions({ status: [...OPEN_SUGGESTION_STATUSES] })) {
    if (!openBySlug.has(record.slug)) openBySlug.set(record.slug, record);
  }

  await applyEditorialSuggestions({
    store,
    at,
    openBySlug,
    closeOpen: async (record, reason) => {
      await closeOpen(record, reason);
    },
    onCreated: () => {
      created += 1;
    },
    onUpdated: () => {
      updated += 1;
    },
    onSkippedUnowned: () => {
      skippedUnowned += 1;
    },
    onSkippedPlayWins: () => {
      skippedPlayWins += 1;
    },
    onMuted: () => {
      mutedByCreator += 1;
    },
    onError: (slug, error) => {
      failed += 1;
      deps.onError?.(slug, error);
    },
  });

  return {
    scanned: cards.length,
    truncated,
    created,
    updated,
    obsoleted,
    skippedUnowned,
    skippedPlayWins,
    failed,
    autoDispatched,
    autoWithheld,
    mutedByCreator,
    legacyPurged,
  };
}

async function resolveEditorialOwner(store: Store, slug: string): Promise<SubmissionRecord | null> {
  const published = await store.getPublishedSubmissionBySlug(slug);
  if (published) return published;
  const jobs = await store.listSubmissionsBySlug(slug);
  return jobs.find(isReviewableCreatorDraft) ?? null;
}

async function applyEditorialSuggestions(opts: {
  store: Store;
  at: string;
  openBySlug: Map<string, SuggestionRecord>;
  closeOpen: (record: SuggestionRecord, reason: string) => Promise<void>;
  onCreated: () => void;
  onUpdated: () => void;
  onSkippedUnowned: () => void;
  onSkippedPlayWins: () => void;
  onMuted: () => void;
  onError: (slug: string, error: unknown) => void;
}): Promise<void> {
  const rows = await opts.store.listGameAssessmentsBySource('creator');
  const aggregates = aggregateCreatorAssessments(rows);

  for (const agg of aggregates) {
    try {
      const routed = routeEditorialAggregate(agg);
      if (!routed) continue;

      const existing = opts.openBySlug.get(agg.slug);
      if (existing && playSignalWinsOverEditorial(existing.class)) {
        opts.onSkippedPlayWins();
        continue;
      }

      const submission = await resolveEditorialOwner(opts.store, agg.slug);
      if (!submission) {
        if (existing?.class === 'editorial') {
          await opts.closeOpen(existing, 'game is no longer reviewable');
        }
        opts.onSkippedUnowned();
        continue;
      }

      const mode = ((await opts.store.getGameAutonomy(agg.slug)) ?? DEFAULT_AUTONOMY) as AutonomyMode;
      if (!wantsSuggestions(mode)) {
        opts.onMuted();
        continue;
      }

      if (existing && existing.class === routed.class) {
        if (sameEvidence(existing, routed)) continue;
        await opts.store.putSuggestion({
          ...existing,
          priority: routed.priority,
          evidence: evidenceOf(routed),
          computedFrom: routed.computedFrom,
          updatedAt: opts.at,
        });
        opts.onUpdated();
        continue;
      }

      if (existing) {
        await opts.closeOpen(existing, `evidence now routes this game as ${routed.class}`);
      }

      const fresh: SuggestionRecord = {
        id: suggestionId(agg.slug, routed.class, routed.computedFrom),
        slug: agg.slug,
        ownerUid: submission.ownerUid,
        class: routed.class,
        priority: routed.priority,
        evidence: evidenceOf(routed),
        status: 'proposed',
        computedFrom: routed.computedFrom,
        createdAt: opts.at,
        updatedAt: opts.at,
      };
      // Editorial is never autonomous.
      await opts.store.putSuggestion(fresh);
      opts.openBySlug.set(agg.slug, fresh);
      opts.onCreated();
    } catch (error) {
      opts.onError(agg.slug, error);
    }
  }
}

export interface SuggestionSweepRoutesOptions {
  store: Store;
  /** Autonomy (IL-4): absent means the sweep proposes and never acts. */
  startImprovementRound?: SuggestionSweepDeps['startImprovementRound'];
  buildBrief?: SuggestionSweepDeps['buildBrief'];
  /** OIDC verifier for the scheduler; deny-all when the sweep is not configured. */
  internalAuthVerifier: InternalAuthVerifier;
  now?: () => number;
  scorecardSampleLimit?: number;
}

export async function registerSuggestionSweepRoutes(
  app: FastifyInstance,
  options: SuggestionSweepRoutesOptions,
): Promise<void> {
  const { store, internalAuthVerifier } = options;

  // Cloud Scheduler POSTs here after the nightly scorecard sweep, with an OIDC token,
  // exactly as the scorecard and digest sweeps do. The rate ceiling is a runaway guard;
  // OIDC is the access control.
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
          scorecardSampleLimit: options.scorecardSampleLimit,
          onError: (slug, error) => request.log.error({ err: error, slug }, 'suggestion write failed'),
          startImprovementRound: options.startImprovementRound,
          buildBrief: options.buildBrief,
          log: request.log,
        });
        // Same run, same schedule: proposing new work and following up on work already
        // approved are both "what does the evidence say this morning", and splitting them
        // would buy a fifth scheduler job and a fifth audience for nothing.
        const outcomes = await advanceSuggestionOutcomes({
          store,
          now: options.now,
          // A creator's approved improvement going quiet is a different event from an
          // anonymous stuck job, and only this link can say which suggestion it was.
          onStall: (record, stall) =>
            request.log.error(
              { suggestionId: record.id, slug: record.slug, jobId: record.jobId, stall },
              'improvement job stalled',
            ),
          onError: (id, error) => request.log.error({ err: error, suggestionId: id }, 'suggestion outcome failed'),
        });
        // Error level when anything failed, matching the other sweeps: a scheduled job
        // nobody watches is the kind that fails quietly for weeks.
        const anyFailure = result.failed > 0 || outcomes.failed > 0;
        const log = anyFailure ? request.log.error.bind(request.log) : request.log.info.bind(request.log);
        log({ ...result, outcomes }, 'suggestion sweep complete');
        return reply.send({ ...result, outcomes });
      } catch (error) {
        request.log.error({ err: error }, 'suggestion sweep failed');
        return reply.status(500).send({ error: 'suggestion sweep failed' });
      }
    },
  );
}
