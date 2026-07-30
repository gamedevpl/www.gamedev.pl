import type { FastifyInstance } from 'fastify';
import type { InternalAuthVerifier } from './internal-auth.js';
import { routeScorecard, type Suggestion, type SuggestionClass } from './suggestions.js';
import { OPEN_SUGGESTION_STATUSES, type Scorecard, type Store, type SuggestionRecord } from './store.js';

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
const ACTIONABLE: readonly SuggestionClass[] = ['defect', 'friction', 'design-change'];

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

/**
 * A suggestion's id is `(slug, class, the scorecard it was computed from)`.
 *
 * That makes re-running the sweep against one night's scorecards idempotent by
 * construction rather than by a guard: the same evidence produces the same id and
 * overwrites its own document. A game cannot route to two classes off one scorecard, so
 * the triple is unique per routing decision.
 */
export function suggestionId(slug: string, suggestionClass: string, computedFrom: string): string {
  const stamp = computedFrom.replace(/[^0-9A-Za-z]/g, '-');
  return `sug-${slug}-${suggestionClass}-${stamp}`;
}

export interface SuggestionSweepResult {
  scanned: number;
  /** True when there were more scorecards than the sample limit — a floor, not a total. */
  truncated: boolean;
  created: number;
  updated: number;
  obsoleted: number;
  /** Games with no submission, unpublished, or abandoned — nobody to propose work to. */
  skippedUnowned: number;
  failed: number;
}

export interface SuggestionSweepDeps {
  store: Store;
  now?: () => number;
  scorecardSampleLimit?: number;
  onError?: (slug: string, error: unknown) => void;
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
  const open = await store.listSuggestions({
    status: [...OPEN_SUGGESTION_STATUSES],
    limit: sampleLimit,
  });
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
  let failed = 0;

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

      await store.putSuggestion({
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
      });
      created += 1;
    } catch (error) {
      // One game's failure must not cost the rest of the sweep. Counted so a run that
      // wrote nothing because everything threw cannot read as a quiet night.
      failed += 1;
      deps.onError?.(card.slug, error);
    }
  }

  return { scanned: cards.length, truncated, created, updated, obsoleted, skippedUnowned, failed };
}

export interface SuggestionSweepRoutesOptions {
  store: Store;
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
        });
        // Error level when anything failed, matching the other sweeps: a scheduled job
        // nobody watches is the kind that fails quietly for weeks.
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
