import { detectStall, type JobStall } from '../job-state.js';
import type { Scorecard, Store, SuggestionRecord } from '../store.js';

/**
 * Closing the loop (docs/improvement-loop-plan.md IL-3 "Closing the loop: measurement").
 *
 * A suggestion is not done when an agent is dispatched, and not done when the work goes
 * live either. It is done when we can say whether it helped. This pass runs alongside the
 * nightly analyst run and moves suggestions along the only two edges a machine can
 * legitimately decide:
 *
 * - `dispatched` → `published`, when the job the work went into actually shipped;
 * - `published` → `measured`, once there is enough post-change play to compare against
 *   the baseline captured at approval.
 *
 * **It never invents a verdict.** A game with no scorecard yet, or fewer sessions since
 * the change than the router needs to route on, stays `published` and is reported as
 * not-yet-measurable. Absence of evidence renders as absence — the same rule the operator
 * page and the router already follow, and the one most likely to be quietly broken here,
 * because "no change detected" and "not enough data to detect a change" look identical in
 * a table and mean opposite things.
 *
 * **Stalls are reported, not acted on.** `detectStall` already classifies a job that
 * stopped making progress, and the operator queue already ranks by it. What this adds is
 * the link back to the suggestion that commissioned the work, so a creator's approved
 * improvement going quiet is visible as *that*, rather than as an anonymous stuck job.
 */

/** How long after publication before a comparison means anything. */
export const MEASUREMENT_WINDOW_DAYS = 14;

/** Minimum sessions in the post-change window before a verdict is allowed. */
export const MIN_SESSIONS_TO_MEASURE = 20;

/**
 * How much the hypothesis metric must move before it counts as a change.
 *
 * Relative, not absolute, because the metrics have different units and scales. Wide on
 * purpose: this decides whether an agent's work is recorded as having helped, and a
 * threshold that calls noise "improved" would make the loop's own quality signal — the
 * thing IL-4 is meant to tighten the router against — worse than useless.
 */
export const MEANINGFUL_CHANGE = 0.2;

export type SuggestionVerdict = 'improved' | 'neutral' | 'regressed';

/**
 * The metric a class is judged on, and which direction is better.
 *
 * Stated per class rather than measured across the board because a defect fix that also
 * happened to change the vote ratio has not been vindicated by the votes — the claim was
 * about crashes, and the honest test is the claim that was made.
 */
export function hypothesisMetric(suggestionClass: string): { key: string; lowerIsBetter: boolean } | null {
  if (suggestionClass === 'defect') return { key: 'errorsPerSession', lowerIsBetter: true };
  if (suggestionClass === 'friction') return { key: 'dropRate', lowerIsBetter: true };
  if (suggestionClass === 'design-change') return { key: 'downvoteRate', lowerIsBetter: true };
  return null;
}

/** Reads the hypothesis metric off a scorecard, mirroring how the router derives it. */
export function metricFromScorecard(card: Scorecard, key: string): number | null {
  if (key === 'errorsPerSession') {
    return card.sessions.count > 0 ? card.health.errors / card.sessions.count : null;
  }
  if (key === 'downvoteRate') {
    const votes = card.votes.up + card.votes.down;
    return votes > 0 ? card.votes.down / votes : null;
  }
  if (key === 'dropRate') {
    const labels = card.untrusted.progressLabels;
    let worst: number | null = null;
    for (let index = 0; index + 1 < labels.length; index += 1) {
      const from = labels[index].sessions;
      if (from <= 0) continue;
      const rate = (from - labels[index + 1].sessions) / from;
      if (worst === null || rate > worst) worst = rate;
    }
    return worst;
  }
  return null;
}

/**
 * Compares before and after on the hypothesis metric.
 *
 * Returns null when no honest comparison exists — either side missing, or a baseline of
 * zero, where "relative change" has no meaning rather than an infinite one.
 */
export function judge(before: number | null, after: number | null, lowerIsBetter: boolean): SuggestionVerdict | null {
  if (before === null || after === null) return null;
  if (before === 0) {
    // Nothing to improve on. Getting worse from zero is still a real regression, and
    // saying "neutral" about a game that started crashing would be the wrong answer.
    if (after === 0) return 'neutral';
    return lowerIsBetter ? 'regressed' : 'improved';
  }
  const change = (after - before) / before;
  if (Math.abs(change) < MEANINGFUL_CHANGE) return 'neutral';
  const wentDown = change < 0;
  return wentDown === lowerIsBetter ? 'improved' : 'regressed';
}

export interface SuggestionOutcomeResult {
  /** Dispatched suggestions whose job has now shipped. */
  shipped: number;
  /** Published suggestions that reached a verdict. */
  measured: number;
  improved: number;
  neutral: number;
  regressed: number;
  /** Published, past the window, but still without enough play to judge. */
  notYetMeasurable: number;
  /** Dispatched suggestions whose job looks stuck. Reported, never acted on. */
  stalled: number;
  failed: number;
}

export interface SuggestionOutcomeDeps {
  store: Store;
  now?: () => number;
  /** Called for each stalled job so it lands in the logs with its suggestion attached. */
  onStall?: (record: SuggestionRecord, stall: JobStall) => void;
  onError?: (id: string, error: unknown) => void;
}

export async function advanceSuggestionOutcomes(deps: SuggestionOutcomeDeps): Promise<SuggestionOutcomeResult> {
  const { store } = deps;
  const currentTime = deps.now ? deps.now() : Date.now();
  const at = new Date(currentTime).toISOString();

  const result: SuggestionOutcomeResult = {
    shipped: 0,
    measured: 0,
    improved: 0,
    neutral: 0,
    regressed: 0,
    notYetMeasurable: 0,
    stalled: 0,
    failed: 0,
  };

  // Unbounded on purpose: a suggestion missed here is work nobody follows up on.
  const inFlight = await store.listSuggestions({ status: ['dispatched', 'published'] });

  for (const record of inFlight) {
    try {
      if (record.status === 'dispatched') {
        // No job to follow means nothing to observe. It stays dispatched rather than
        // being invented into a terminal state.
        if (record.jobId === undefined) continue;
        const job = await store.getSubmission(record.jobId);
        if (!job) continue;

        if (job.publishedAt) {
          await store.putSuggestion({
            ...record,
            status: 'published',
            publishedAt: job.publishedAt,
            updatedAt: at,
          });
          result.shipped += 1;
          continue;
        }

        const stall = detectStall({
          state: job.state ?? 'queued',
          stateSince: job.stateSince ?? job.createdAt,
          lastAgentSignalAt: job.lastAgentSignalAt,
          agentState: job.agentState,
          agentEndedAt: job.agentEndedAt,
          now: currentTime,
        });
        if (stall) {
          result.stalled += 1;
          deps.onStall?.(record, stall);
        }
        continue;
      }

      // status === 'published': is it old enough, and is there enough play, to judge?
      const since = record.publishedAt ? currentTime - Date.parse(record.publishedAt) : 0;
      if (!Number.isFinite(since) || since < MEASUREMENT_WINDOW_DAYS * 86_400_000) continue;

      const metric = hypothesisMetric(record.class);
      const card = await store.getScorecard(record.slug);
      if (!metric || !card || card.sessions.count < MIN_SESSIONS_TO_MEASURE) {
        // Past the window and still unmeasurable. Counted rather than silently skipped,
        // because a queue of these is the signal that the window is too short or the
        // game too quiet — not that improvements are having no effect.
        result.notYetMeasurable += 1;
        continue;
      }

      const before = record.baseline?.metrics?.[metric.key] ?? null;
      const after = metricFromScorecard(card, metric.key);
      const verdict = judge(before, after, metric.lowerIsBetter);
      if (!verdict) {
        result.notYetMeasurable += 1;
        continue;
      }

      await store.putSuggestion({
        ...record,
        status: 'measured',
        outcome: { at, verdict, metric: metric.key, before, after },
        updatedAt: at,
      });
      result.measured += 1;
      result[verdict] += 1;
    } catch (error) {
      result.failed += 1;
      deps.onError?.(record.id, error);
    }
  }

  return result;
}
