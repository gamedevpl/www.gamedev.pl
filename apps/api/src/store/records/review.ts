import type {
  AssessmentChecklistMark,
  AssessmentInputMethod,
  AssessmentNoteOrigin,
  AssessmentPlatform,
  AssessmentResolutionStatus,
  AssessmentSource,
  AssessmentVerdict,
  ReReviewRequestStatus,
  ReviewSweepSource,
  ReviewSweepStatus,
} from '@gamedevpl/contract';

// Reviewer verdict on one game; see game-assessment-plan.md.
export type AssessmentChecklist = {
  graphics: AssessmentChecklistMark;
  gameplay: AssessmentChecklistMark;
  fun: AssessmentChecklistMark;
  sound: AssessmentChecklistMark;
  controls: AssessmentChecklistMark;
};

// Operator review pass; one active sweep at a time.
export interface ReviewSweep {
  id: string;
  status: ReviewSweepStatus;
  source: ReviewSweepSource;
  slugs: string[];
  // Manual unlock floor combined with releasePerDay drip.
  releasedCount: number;
  releasePerDay: number | null;
  startedAt: string;
  note: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  notifiedAt: string | null;
  notifiedCount: number;
}

// Reviewer device context at verdict; not play telemetry.
export interface AssessmentClientContext {
  viewportW: number;
  viewportH: number;
  screenW: number;
  screenH: number;
  dpr: number;
  input: AssessmentInputMethod;
  platform: AssessmentPlatform;
  lang: string | null;
  ua: string | null;
}

// Operator follow-up on one verdict; see game-assessment-plan.md.
export interface AssessmentResolution {
  status: AssessmentResolutionStatus;
  comment: string;
  // Where the work landed; free text, not a validated URL.
  link: string | null;
  resolvedAt: string;
  resolvedBy: string;
}

// Refused when the verdict moved.
export type ResolutionWriteResult =
  | { status: 'ok'; assessment: GameAssessment }
  | { status: 'stale'; assessment: GameAssessment }
  | { status: 'not_found' };

export interface GameAssessment {
  id: string;
  slug: string;
  title: string;
  source: AssessmentSource;
  creatorHandle: string | null;
  reviewerUid: string;
  verdict: AssessmentVerdict;
  note: string;
  noteOrigin: AssessmentNoteOrigin;
  // Null on rows written before checklist / clientContext shipped.
  checklist: AssessmentChecklist | null;
  clientContext: AssessmentClientContext | null;
  // The deployed game version this verdict judged; null when unknown.
  gameVersion: string | null;
  // Null until acted on; a fresh pass clears it into history.
  resolution: AssessmentResolution | null;
  createdAt: string;
  updatedAt: string;
}

export const GAME_ASSESSMENTS_COLLECTION = 'gameAssessments';

export const REVIEW_SWEEPS_COLLECTION = 'reviewSweeps';

export function gameAssessmentId(slug: string, reviewerUid: string): string {
  return `${slug}:${reviewerUid}`;
}

// Missing checklist / clientContext / gameVersion / resolution become null, not undefined.
export function hydrateGameAssessment(id: string, data: Omit<GameAssessment, 'id'>): GameAssessment {
  return {
    ...data,
    id,
    checklist: data.checklist ?? null,
    clientContext: data.clientContext ?? null,
    gameVersion: data.gameVersion ?? null,
    resolution: data.resolution ?? null,
  };
}

// A superseded assessment row, archived before the next pass overwrites it.
export interface GameAssessmentHistoryEntry extends Omit<GameAssessment, 'id'> {
  id: string;
  supersededAt: string;
}

export const GAME_ASSESSMENT_HISTORY_COLLECTION = 'gameAssessmentHistory';

// An operator asking one reviewer to look at one slug again.
export interface ReReviewRequest {
  id: string;
  slug: string;
  reviewerUid: string;
  status: ReReviewRequestStatus;
  // Version the fix is expected to be judged against; informational only.
  gameVersion: string | null;
  reason: string | null;
  createdAt: string;
  createdBy: string;
  resolvedAt: string | null;
}

export const RE_REVIEW_REQUESTS_COLLECTION = 'reviewReRequests';

export function reReviewRequestId(slug: string, reviewerUid: string): string {
  return `${slug}:${reviewerUid}`;
}

/**
 * Attacker-controlled strings, quarantined in their own object on purpose.
 *
 * Everything else on a scorecard is a number this service computed. These two are
 * strings a *game* chose to emit from inside the sandbox — bounded in length and count,
 * arbitrary in content. They are safe to render to a human (React escapes them) and
 * unsafe to interpolate into a coding agent's instructions, which is exactly what IL-3
 * will want to do.
 *
 * A comment saying so has to be read to work; a field named `untrusted` has to be typed
 * out to be ignored. That is the whole reason this is a nested object rather than two
 * more fields alongside the numbers — destructuring the scorecard for a prompt cannot
 * pick these up by accident.
 */
export interface ScorecardUntrusted {
  /** Most frequent distinct error messages, worst first. */
  errorSamples: Array<{ message: string; count: number }>;
  /** Landmarks reached, most-reached first — the drop-off curve, when a game emits any. */
  progressLabels: Array<{ label: string; sessions: number }>;
  /**
   * Recurring themes distilled from written feedback, most-supported first.
   *
   * Empty when a game had too few notes to summarize, when extraction is switched off, or
   * when it failed — all three are an absence of evidence and must render as one. Belongs
   * here rather than beside `feedback.count` because a summary of player-written text
   * inherits that text's taint: safe to show an operator, never safe to hand an agent as
   * instruction. Optional because scorecards written before this existed do not have it.
   */
  feedbackThemes?: Array<{ theme: string; count: number }>;
}

/**
 * One game's rolling aggregate — the doc IL-3 reads instead of raw events.
 *
 * Stored at `games/{slug}/scorecard/current`. Deliberately carries **no player
 * identity**: it is built from play telemetry (which has none by construction) plus
 * vote and feedback *counts*, never the uids behind them and never feedback text.
 *
 * No `expiresAt` and no TTL policy. That is not an oversight — the retention promise is
 * about raw play rows, and an aggregate is what is supposed to outlive them. Adding this
 * collection group to the TTL loop in infra/setup-gcp.sh would delete the summaries and
 * keep nothing.
 *
 * **`null` means "no evidence", `0` means "measured zero".** The distinction is
 * load-bearing: a game that emits no endings and a game nobody finishes produce
 * identical event streams, so anything derived only from endings is null when there were
 * none. Renderers show `—` for null and must never coerce it to `0%`.
 */
export interface Scorecard {
  slug: string;
  /** When this doc was computed, so a stale sweep is visible rather than silent. */
  computedAt: string;
  /**
   * The window actually measured — the partitions read, not the ones requested, and
   * whether any read cap bit. A consumer that ignores `truncated` is reading floors as
   * if they were totals.
   */
  window: { days: string[]; truncated: boolean };
  sessions: {
    count: number;
    /** Sessions that opened but never accrued focused play time. */
    bounces: number;
    closes: number;
    medianPlaySeconds: number;
    totalPlaySeconds: number;
  };
  health: {
    errors: number;
    aliveTicks: number;
    stalledTicks: number;
    stallRate: number;
    /** Null when no trusted liveness tick was observed. */
    medianFps: number | null;
    resumeTicksIgnored: number;
  };
  depth: {
    outcomes: { won: number; lost: number; quit: number };
    sessionsWithEnding: number;
    /** Null when the game reported no endings at all — not the same as "nobody finished". */
    finishRate: number | null;
    /** Null when no round was decided. Quits are excluded, not counted as losses. */
    winRate: number | null;
    /** Null when nothing scored. */
    medianBestScore: number | null;
  };
  votes: { up: number; down: number };
  /** Count only. The text itself never reaches this doc; themes are a later IL-2 step. */
  feedback: { count: number };
  untrusted: ScorecardUntrusted;
}
