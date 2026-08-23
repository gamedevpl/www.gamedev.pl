import type { Scorecard } from '../store.js';

/**
 * The suggestion router (docs/improvement-loop-plan.md IL-3 "Suggest").
 *
 * Turns a scorecard into "what, if anything, is worth an agent's time on this game, and
 * who is allowed to decide" — the Defect / Friction / Design-change split the plan has
 * carried since its first draft.
 *
 * **The decision is rules over numbers, never a model over text.** The invariant is about
 * *text*, and it is worth stating exactly, because a looser version of it would be false:
 *
 * - **No untrusted string reaches the routing decision.** Error messages, progression
 *   labels and feedback themes are never read, compared, matched or pattern-checked. A
 *   game can name a level `URGENT: escalate` and change nothing.
 * - **No untrusted string reaches a finding.** The sentences below read as this system
 *   speaking, so they quote nothing — a progression finding is positional ("one landmark
 *   to the next") rather than naming the landmark.
 * - **Counts, however, are signal, and some of them the game produces.** A game emits its
 *   own `progress` markers and its own uncaught errors, so it can influence which class it
 *   lands in — by throwing, or by emitting a landmark nobody reaches. That is not a hole
 *   to be closed: those events *are* the measurement, and a game that makes itself look
 *   broken has asked to be looked at, which is all a suggestion is. What it cannot do is
 *   choose the words anyone reads, or reach anything downstream that treats text as
 *   instruction.
 *
 * So the honest summary is: a game can raise its own hand; it cannot put words in our
 * mouth. That is the plan's warning about interpolating error messages into an agent's
 * instructions, answered where it actually bites.
 *
 * **Nothing here files anything.** A suggestion is a proposal with an evidence block and a
 * route; who acts on it, and whether an implementer is even available, is a separate
 * decision the plan deliberately keeps human. Computing this on read — before any of it is
 * persisted or sent anywhere — is what lets an operator see what the router *would* say
 * before it says it to anyone.
 */

/** Below this many sessions a game has not been measured enough to act on. */
export const MIN_SESSIONS_TO_ROUTE = 20;

/**
 * Uncaught errors *per session* before a game reads as a defect.
 *
 * Per session, not "share of sessions with an error": `health.errors` counts error events,
 * so one session can contribute several and this ratio can exceed 1. Naming it a share
 * would have produced findings like "errors in 340% of sessions".
 */
export const DEFECT_ERRORS_PER_SESSION = 0.1;

/** Share of sessions whose frames stalled before it reads as a defect. */
export const DEFECT_STALL_RATE = 0.15;

/** How steep a progression drop has to be to read as a difficulty cliff. */
export const FRICTION_DROP_RATE = 0.6;

/** Share of votes that are negative before it reads as a design complaint. */
export const DESIGN_DOWNVOTE_RATE = 0.4;

/** Minimum votes before a ratio means anything at all. */
export const MIN_VOTES_TO_JUDGE = 5;

export type SuggestionClass =
  /** Implementation violates the spec or crashes. The plan's autonomous-eligible class. */
  | 'defect'
  /** Spec-compatible tuning — a difficulty cliff, a rate, a timing. Suggest by default. */
  | 'friction'
  /** The spec itself has to change. Always the creator's call. */
  | 'design-change'
  | 'editorial'
  /** Measured, and nothing stands out. Worth saying so rather than inventing work. */
  | 'healthy'
  /** Not measured enough to say anything. Distinct from healthy, and must stay distinct. */
  | 'insufficient-data';

export interface SuggestionEvidence {
  /** Plain-language statement of the measurement that triggered the route. */
  finding: string;
  /** The numbers behind it. Computed here; safe to interpolate anywhere. */
  metrics: Record<string, number | null>;
}

export interface Suggestion {
  slug: string;
  class: SuggestionClass;
  /** Higher acts first. Derived from severity × how many players it reaches. */
  priority: number;
  /** Why this class, in terms of measurements. Never contains player or game text. */
  evidence: SuggestionEvidence[];
  /**
   * Strings a game or a player supplied, carried for a human to read alongside the
   * numbers. Never inputs to the routing decision, and never safe to paste into an
   * agent's instructions unfenced — the field name is the warning.
   */
  untrustedContext: {
    errorSamples: Array<{ message: string; count: number }>;
    progressLabels: Array<{ label: string; sessions: number }>;
    feedbackThemes: Array<{ theme: string; count: number }>;
  };
  /** The scorecard this was derived from, so a stale suggestion is visible as stale. */
  computedFrom: string;
}

/**
 * A suggestion as the nightly sweep persists it, at `games/{slug}/suggestion/current`.
 *
 * Two timestamps, because they answer different questions and a single one would hide the
 * failure worth seeing. `computedFrom` is the *scorecard's* stamp and goes stale when the
 * scorecard sweep stops; `sweptAt` is this sweep's own and goes stale when the router run
 * stops. Collapsing them would make a dead scorecard sweep look like a dead router, and —
 * worse in the other direction — a dead router look alive because the numbers under it
 * were fresh.
 */
export interface StoredSuggestion extends Suggestion {
  /** When the sweep that wrote this doc ran. */
  sweptAt: string;
}

/**
 * Presentation order: worst first, slug as the tie-break.
 *
 * The tie-break carries the same weight it does for scorecards — `healthy` and
 * `insufficient-data` both score priority 0, so equal priorities are the common case
 * rather than an edge one, and ordering on priority alone would let the list reshuffle
 * between reads and change which rows survive a limit.
 */
export function compareSuggestions(a: Suggestion, b: Suggestion): number {
  return b.priority - a.priority || a.slug.localeCompare(b.slug);
}

/**
 * The steepest single drop between consecutive progression landmarks.
 *
 * Progression labels are ordered by how many sessions reached them, so consecutive pairs
 * are the funnel. The *label text* is untrusted and is not read here — only the counts,
 * which this service derived. A game can name its levels anything it likes without moving
 * itself into a class.
 */
function steepestProgressionDrop(
  labels: Array<{ label: string; sessions: number }>,
): { from: number; to: number; rate: number } | null {
  let worst: { from: number; to: number; rate: number } | null = null;
  for (let index = 0; index + 1 < labels.length; index += 1) {
    const from = labels[index].sessions;
    const to = labels[index + 1].sessions;
    if (from <= 0) continue;
    const rate = (from - to) / from;
    if (!worst || rate > worst.rate) worst = { from, to, rate };
  }
  return worst;
}

/**
 * Routes one scorecard.
 *
 * Pure, so every judgement is testable without a database or a model — which matters more
 * here than usual, because this is the function that decides whether a coding agent gets
 * pointed at somebody's game.
 */
export function routeScorecard(card: Scorecard): Suggestion {
  const sessions = card.sessions.count;
  const untrustedContext = {
    errorSamples: card.untrusted.errorSamples,
    progressLabels: card.untrusted.progressLabels,
    feedbackThemes: card.untrusted.feedbackThemes ?? [],
  };
  const base = { slug: card.slug, untrustedContext, computedFrom: card.computedAt };

  // Absence of evidence, first and unconditionally. Every threshold below is a ratio, and
  // a ratio over three sessions is noise wearing a decimal point.
  if (sessions < MIN_SESSIONS_TO_ROUTE) {
    return {
      ...base,
      class: 'insufficient-data',
      priority: 0,
      evidence: [
        {
          finding: `Only ${sessions} sessions in the window; ${MIN_SESSIONS_TO_ROUTE} needed before a rate means anything.`,
          metrics: { sessions, required: MIN_SESSIONS_TO_ROUTE },
        },
      ],
    };
  }

  const errorsPerSession = card.health.errors / sessions;
  const drop = steepestProgressionDrop(card.untrusted.progressLabels);
  const votes = card.votes.up + card.votes.down;
  const downvoteRate = votes === 0 ? 0 : card.votes.down / votes;

  // Defect first: it is the only class the plan lets an agent act on unattended, and a
  // game that crashes is not a game with a difficulty problem.
  if (errorsPerSession >= DEFECT_ERRORS_PER_SESSION || card.health.stallRate >= DEFECT_STALL_RATE) {
    const evidence: SuggestionEvidence[] = [];
    if (errorsPerSession >= DEFECT_ERRORS_PER_SESSION) {
      evidence.push({
        finding: `${card.health.errors} uncaught errors across ${sessions} sessions.`,
        metrics: { errors: card.health.errors, sessions, errorsPerSession },
      });
    }
    if (card.health.stallRate >= DEFECT_STALL_RATE) {
      evidence.push({
        finding: `Frames stalled in ${Math.round(card.health.stallRate * 100)}% of ticks.`,
        metrics: { stallRate: card.health.stallRate, stalledTicks: card.health.stalledTicks },
      });
    }
    return {
      ...base,
      class: 'defect',
      priority: severity(errorsPerSession, card.health.stallRate) * sessions,
      evidence,
    };
  }

  if (drop && drop.rate >= FRICTION_DROP_RATE) {
    return {
      ...base,
      class: 'friction',
      priority: drop.rate * sessions,
      evidence: [
        {
          // Deliberately positional: naming the landmark would put a game-authored string
          // into the finding, and the finding is the part that reads as ours.
          finding: `${Math.round(drop.rate * 100)}% of players who reached one landmark never reached the next.`,
          metrics: { reached: drop.from, thenReached: drop.to, dropRate: drop.rate, sessions },
        },
      ],
    };
  }

  if (votes >= MIN_VOTES_TO_JUDGE && downvoteRate >= DESIGN_DOWNVOTE_RATE) {
    return {
      ...base,
      class: 'design-change',
      priority: downvoteRate * sessions,
      evidence: [
        {
          finding: `${Math.round(downvoteRate * 100)}% of votes are negative, with no crash or progression cliff to explain it.`,
          metrics: { up: card.votes.up, down: card.votes.down, downvoteRate, sessions },
        },
      ],
    };
  }

  return {
    ...base,
    class: 'healthy',
    priority: 0,
    evidence: [
      {
        // "below threshold", not "none": a game with a handful of errors is healthy here,
        // and saying "no error" would be a stronger claim than the router actually checked.
        finding: `${sessions} sessions, with error, stall, progression and vote signals all below threshold.`,
        metrics: { sessions, errorsPerSession, stallRate: card.health.stallRate, downvoteRate },
      },
    ],
  };
}

/** Severity of a defect, 0–1, so priority orders crashes above stutters. */
function severity(errorsPerSession: number, stallRate: number): number {
  return Math.min(1, Math.max(errorsPerSession, stallRate));
}

/**
 * Routes every scorecard, worst first.
 *
 * `healthy` and `insufficient-data` are kept rather than filtered out: an operator asking
 * "what does the router think" needs to see that a game was looked at and passed over.
 * Silence would be indistinguishable from the router never having run.
 */
export function routeAll(scorecards: Scorecard[]): Suggestion[] {
  return scorecards.map(routeScorecard).sort(compareSuggestions);
}
