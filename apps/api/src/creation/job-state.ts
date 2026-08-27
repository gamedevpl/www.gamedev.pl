// The build job state machine.
//
// Today a submission's status is *derived*: every status poll reads GitHub's issue and
// PR state and translates it (see submission-status.ts). That is why the product cannot
// answer "is it stuck or just slow?", cannot cancel or retry, and cannot show a queue —
// there is nowhere for those facts to live, because we own no state of our own.
//
// This module is the other half: a state a job *has*, moved by transitions somebody
// writes, with GitHub demoted to one of several signals that can cause a transition
// rather than being the truth itself. Everything here is pure — no I/O, no clock of its
// own — so the rules can be tested directly and reused by the status route, the
// reconciler sweep, and the operator surface alike.

import type { AgentTaskState } from './agent-state.js';
import type { ManagedBudgetStop, ManagedSessionUsage } from '../agent-surface/managed-agent.js';
import { JOB_STALL_VALUES, JOB_STATES, type BuilderKind, type JobStall, type JobState } from '@gamedevpl/contract';
import type { SubmissionStatus } from '../platform/submission-status.js';

export { JOB_STALL_VALUES, JOB_STATES, type JobStall, type JobState };

export const TERMINAL_JOB_STATES: ReadonlySet<JobState> = new Set<JobState>([
  'published',
  'failed',
  'canceled',
  'abandoned',
]);

export function isTerminal(state: JobState): boolean {
  return TERMINAL_JOB_STATES.has(state);
}

/**
 * Legal transitions. Deliberately explicit rather than "anything goes": the reconciler
 * runs on a timer against a third party's state, so the one bug worth designing out is a
 * late or duplicated observation dragging a finished job backwards — resurrecting a
 * canceled build, or un-publishing a live game.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<JobState, readonly JobState[]>> = {
  queued: ['dispatched', 'building', 'canceled', 'abandoned', 'failed'],
  dispatched: ['building', 'submitted', 'failed', 'canceled', 'abandoned'],
  // `dispatched` / `queued` let a new agent session start without pretending the session
  // is already coding — resumeBuild hands work to Copilot long before GitHub reports
  // `in_progress`, and a self→platform handoff often leaves the job in `building` or
  // `submitted` from the previous round.
  building: [
    'submitted',
    'ready_for_review',
    'needs_changes',
    'failed',
    'canceled',
    'abandoned',
    'dispatched',
    'queued',
  ],
  // The verdict is read off the version manifest in a single poll, so a delivered job
  // reaches its outcome without ever being seen in `gating`. Listing only `gating` here
  // made `submitted` a trap: reconcileGateVerdict computes `ready_for_review` or
  // `needs_changes`, canTransition refused both, and nothing else writes `gating` — so
  // every job that arrived here stayed, showing "delivered, gate never started" for as
  // long as the creator kept the page open.
  //
  // `dispatched` / `queued`: a creator handoff or revision can start a new agent
  // session after delivery, before (or instead of) the gate finishing. Do not list
  // `building` here — `toSubmissionStatus(submitted)` is already `building`, and
  // allowing that edge lets the lossy derived-status reconciler yank a delivery back
  // to `building` on every sweep.
  submitted: ['ready_for_review', 'needs_changes', 'failed', 'canceled', 'abandoned', 'dispatched', 'queued'],
  // `building` (and the queue/dispatch that precede a fresh round) let a creator or
  // their agent continue iterating after a green gate without waiting on publish —
  // Studio feedback and MCP `continue_draft` both land here. Reviewer reject still
  // goes through `needs_changes`; publish still goes through `publishing`.
  ready_for_review: ['publishing', 'needs_changes', 'building', 'queued', 'dispatched', 'canceled', 'abandoned'],
  // A failed bake must be able to fall back, or a job strands with no way home.
  publishing: ['published', 'needs_changes', 'failed'],
  // Improvements start a *new* job, so publishing is terminal for this one.
  published: [],
  // Another round: back to the queue, which is what dispatching a follow-up means.
  //
  // `submitted` is here because a gate-red round is not always over. The session that
  // delivered is often still alive, and `mustFixGate` tells it exactly that: fix the
  // cause and deliver again, in the same session, with no new dispatch. That repaired
  // upload has to be recordable — agent-channel only writes `submitted` when this allows
  // it, and reconcileGateVerdict only reads a verdict from `submitted`/`gating`. Without
  // this, a game the agent had already fixed sat in `needs_changes` with a green verdict
  // nobody would look at, waiting on a round the creator should never have had to start.
  needs_changes: ['queued', 'dispatched', 'building', 'submitted', 'canceled', 'abandoned'],
  // Same shape as needs_changes, for the same reason: a dead round must not orphan
  // the job, and feedback after a failure *is* the retry. Still terminal to the
  // reconciler — `isTerminal` guards it, so only a creator or operator moves it.
  failed: ['queued', 'dispatched', 'building', 'canceled', 'abandoned'],
  canceled: [],
  abandoned: [],
};

export function canTransition(from: JobState, to: JobState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Whether committing this transition ends the current build round — and must therefore
 * bump the job's `roundGeneration` so the round's channel token dies.
 *
 * Closing events written through `recordJobTransition`:
 * - delivery accepted (`ready_for_review`, typically `gate_green`)
 * - round rejected into `needs_changes`, except `gate_red` / `kit_outdated` — those keep
 *   the round open so the live session can repair (or refresh the kit) and re-deliver
 *   without a new token
 * - creator/operator cancel or abandon
 * - agent failure (`failed`) — terminal for the round
 *
 * Starting another round (creator feedback, operator retry) bumps in `resumeBuild`
 * *before* the new token is minted, so the mint and the bump cannot race. That path
 * is not classified here — a `building` → `building` `operator_retry` transition must
 * not bump again after the mint.
 */
export function transitionClosesRound(transition: JobTransition): boolean {
  switch (transition.to) {
    case 'ready_for_review':
      return true;
    case 'canceled':
    case 'abandoned':
    case 'failed':
      return true;
    case 'needs_changes':
      // Same-session repair after a red gate / stale kit still holds the current token.
      // `gate_crashed`/`session_crashed` join them: our own detection failed, so
      // charging the creator a fresh round to work around it would bill them for it.
      return (
        transition.reason !== 'gate_red' &&
        transition.reason !== 'kit_outdated' &&
        transition.reason !== 'gate_crashed' &&
        transition.reason !== 'session_crashed'
      );
    default:
      return false;
  }
}

/**
 * Next channel-token generation after a round-closing transition.
 *
 * Legacy jobs have no field yet: the first close initializes it to `1`, which is what
 * makes every subsequent round generation-scoped and stops old copied tokens. Jobs
 * created with a generation already set simply increment.
 */
export function nextRoundGeneration(current: number | undefined): number {
  return current === undefined ? 1 : current + 1;
}

/**
 * Why a job moved. Written onto every transition so the history explains itself — the
 * difference between "the build took 40 minutes" and "the build took 40 minutes because
 * it was re-dispatched twice after gate failures".
 */
export type TransitionActor = 'creator' | 'operator' | 'agent' | 'gate' | 'reconciler' | 'system';

export interface JobTransition {
  to: JobState;
  at: string;
  by: TransitionActor;
  /** Short machine-readable cause, e.g. `task_failed`, `gate_red`, `approved`. */
  reason?: string;
}

/**
 * Creator-facing projection.
 *
 * The public status vocabulary does not change with this work — the web client, the
 * notification mapping and the status route all keep their contract, and the richer
 * internal state is additive. Two deliberate collapses:
 *
 * - `submitted` and `gating` read as `building`. From the creator's side the game is
 *   still being worked on; that our gate rather than the agent is doing the work is our
 *   business, not theirs.
 * - `failed` reads as `needs_changes`, because the existing vocabulary has no terminal
 *   failure and inventing one would change what the client renders. This is the one
 *   place the projection is lossy on purpose: `stalled`/`failed` are exposed separately
 *   (see {@link JobStall}) so the UI can adopt them deliberately rather than by surprise.
 */
export function toSubmissionStatus(state: JobState): SubmissionStatus {
  switch (state) {
    case 'queued':
    case 'dispatched':
      return 'queued';
    case 'building':
    case 'submitted':
      return 'building';
    case 'ready_for_review':
      return 'in_review';
    case 'publishing':
      return 'publishing';
    case 'published':
      return 'published';
    case 'canceled':
    case 'abandoned':
      return 'abandoned';
    case 'needs_changes':
    case 'failed':
      return 'needs_changes';
  }
}

/**
 * The inverse projection: the job state implied by a status derived the old way.
 *
 * Every submission that predates the job model — and every one still dispatched through
 * an issue — has only a derived {@link SubmissionStatus}. This is how those get adopted
 * into the state machine without a migration: the derivation keeps running, and its
 * result is recorded as an observation rather than answered directly.
 *
 * Necessarily lossy, because the public vocabulary is smaller: `needs_changes` cannot
 * distinguish a rejection from an outright failure, and `abandoned` cannot distinguish a
 * creator walking away from an operator cancelling. That is fine here — the loss only
 * affects jobs whose richer state we never observed in the first place, and transitions
 * written by an actor who *does* know (the operator, the gate) carry the precise state.
 */
export function fromSubmissionStatus(status: SubmissionStatus): JobState {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'building':
      return 'building';
    case 'in_review':
      return 'ready_for_review';
    case 'publishing':
      return 'publishing';
    case 'published':
      return 'published';
    case 'needs_changes':
      return 'needs_changes';
    case 'abandoned':
      return 'abandoned';
  }
}

/**
 * The state a stored job is in, as far as anything can tell.
 *
 * A record adopted into the job model carries its own state; one that has not been
 * polled since the model shipped carries only the last derived status. Readers that
 * skipped the second case filled in gradually rather than being complete on the first
 * request, and every one of them wrote the same three lines — so the fallback lives
 * here, structurally typed to avoid dragging the store's record type into a pure module.
 */
export function resolveJobState(record: { state?: JobState; lastStatus?: SubmissionStatus }): JobState | undefined {
  return record.state ?? (record.lastStatus ? fromSubmissionStatus(record.lastStatus) : undefined);
}

/**
 * Decides what to write when a derived status is observed for a job — the bridge that
 * lets the existing GitHub derivation feed the state machine instead of bypassing it.
 *
 * Returns null when nothing should change, which is the usual answer: a job is polled
 * far more often than it moves.
 *
 * A record with no `state` yet is *adopted* here rather than migrated, and its
 * `stateSince` deliberately starts at the moment of adoption rather than being
 * backdated. Backdating would be a guess, and a wrong guess would immediately report
 * every in-flight legacy build as stalled — the one outcome worse than saying nothing.
 */
export function planObservedStatusTransition(
  current: JobState | undefined,
  observed: SubmissionStatus,
  at: string,
  by: TransitionActor = 'reconciler',
): JobTransition | null {
  const to = fromSubmissionStatus(observed);
  if (!current) return { to, at, by, reason: 'adopted_from_derived_status' };
  if (to === current) return null;
  // Richer internal states project onto a coarser public status (`submitted`→`building`,
  // `failed`→`needs_changes`, …). When the derivation only re-states that projection,
  // keep the precise state — otherwise every poll would erase it.
  if (toSubmissionStatus(current) === observed) return null;
  if (!canTransition(current, to)) return null;
  return { to, at, by, reason: 'derived_from_github' };
}

/**
 * What an agent backend observed, normalized away from any one vendor's vocabulary.
 * The Copilot adapter maps GitHub's task states onto this; a future SDK-runtime backend
 * maps its execution states onto the same shape, and the rules below do not change.
 */
export interface AgentObservation {
  state: AgentTaskState;
  /**
   * Whether the job has a candidate to review — delivered sources, or a branch with work
   * on it. An agent reporting `completed` means something entirely different depending on
   * this: with a candidate it is done, without one it stopped without producing anything.
   */
  hasCandidate: boolean;
  /**
   * Where the work is happening, once the backend can say. A freshly created task has no
   * branch yet, so this is the only moment it can be learned — and without it a revision
   * round cannot resume the work, it can only start again somewhere else.
   */
  workspace?: string;
  /**
   * Credits billed across every session on this task, once usage is known.
   *
   * The ledger books a placeholder of 1 credit at dispatch (usage is not on the create
   * response). Observation is what replaces it with the real figure — which can arrive
   * after the job has already moved past the agent, so cost reconciliation must not be
   * gated on job state the way lifecycle reconciliation is.
   */
  sessionCredits?: number;
  // Tokens, for token-billed backends; not convertible to credits.
  sessionTokens?: AgentSessionTokens;
  sessionUsage?: ManagedSessionUsage;
  stopReason?: string;
  budgetStop?: ManagedBudgetStop;
}

export type AgentSessionTokens =
  | { input: number; output: number; vendor?: 'anthropic' | 'copilot'; model?: string }
  | {
      vendor: 'gemini';
      model: string;
      input: number;
      output: number;
      total: number;
      thought: number;
      cached: number;
      toolUse: number;
    }
  | {
      vendor: 'openai';
      model: string;
      input: number;
      output: number;
      total: number;
      reasoning: number;
      cached: number;
    };

export interface ReconcileResult {
  to: JobState;
  reason: string;
}

/**
 * Maps an agent observation onto the next job state, or null when nothing should move.
 *
 * Null is the common answer and the important one: the reconciler runs on a timer, so
 * it must be idempotent, and a job whose state already reflects reality has to stay put.
 */
export function reconcileAgentObservation(current: JobState, observation: AgentObservation): ReconcileResult | null {
  // A finished job is never reopened by an observation. Late polls, duplicate deliveries
  // and out-of-order webhooks all land here, and all should do nothing.
  if (isTerminal(current)) return null;

  // Once the work has been delivered, the agent's own lifecycle stops being interesting:
  // the gate and the reviewer own what happens next, and an agent session reporting
  // `completed` (or even `failed`) after a successful upload must not disturb them.
  const pastAgent: readonly JobState[] = ['submitted', 'ready_for_review', 'publishing'];
  if (pastAgent.includes(current)) return null;

  const next = ((): ReconcileResult | null => {
    switch (observation.state) {
      case 'queued':
        return { to: 'dispatched', reason: 'task_queued' };
      case 'in_progress':
        return { to: 'building', reason: 'task_in_progress' };
      // Both mean a live session that is not making progress on its own. They are stalls
      // to surface (see detectStall), not state changes — the job is still building.
      case 'idle':
      case 'waiting_for_user':
        return { to: 'building', reason: 'task_active' };
      case 'completed':
        return observation.hasCandidate
          ? { to: 'ready_for_review', reason: 'task_completed' }
          : { to: 'failed', reason: 'task_completed_without_delivery' };
      case 'failed':
        return { to: 'failed', reason: 'task_failed' };
      case 'timed_out':
        return { to: 'failed', reason: 'task_timed_out' };
      case 'cancelled':
        return { to: 'canceled', reason: observation.stopReason ?? 'task_cancelled' };
    }
  })();

  if (!next || next.to === current) return null;
  return canTransition(current, next.to) ? next : null;
}

export interface StallThresholds {
  notDispatchedMs: number;
  quietMs: number;
  gateNotStartedMs: number;
}

/**
 * Chosen against measured behaviour rather than intuition: dispatch through to a first
 * session is seconds, and trivial tasks complete in single-digit minutes, so a job that
 * has not been picked up in 10 minutes is wedged rather than busy. The 15-minute quiet
 * window matches what the status page already tells creators today.
 */
export const DEFAULT_STALL_THRESHOLDS: StallThresholds = {
  notDispatchedMs: 10 * 60 * 1000,
  quietMs: 15 * 60 * 1000,
  gateNotStartedMs: 10 * 60 * 1000,
};

export interface StallInput {
  state: JobState;
  /** When the job entered its current state. */
  stateSince: string;
  /** Last build-channel event from the agent, when there has been one. */
  lastAgentSignalAt?: string;
  /** Latest agent observation, when we have one. */
  agentState?: AgentTaskState;
  /**
   * When the agent explicitly ended this round (MCP `end`). Cleared on the next
   * channel write so a resumed session is not stuck as handed-off.
   */
  agentEndedAt?: string;
  now: number;
  thresholds?: StallThresholds;
  /**
   * When `'self'`, silence before the first channel signal is `no_agent_yet` rather
   * than a stall — the platform is waiting on purpose.
   */
  builder?: BuilderKind;
}

/**
 * Returns why a job looks stuck, or null when its silence is still within tolerance.
 *
 * Note what this deliberately does *not* do: report a stall for a job that is simply
 * taking a long time while visibly working. A build that reports progress every few
 * minutes for two hours is slow, and saying "stuck" about it would be exactly the lie
 * this is meant to remove.
 */
export function detectStall(input: StallInput): JobStall | null {
  const thresholds = input.thresholds ?? DEFAULT_STALL_THRESHOLDS;
  if (isTerminal(input.state)) return null;

  // Explicit beats inferred: if the agent says it is waiting for us, there is nothing to
  // deduce from timestamps and no waiting period worth observing.
  if (input.agentState === 'waiting_for_user') return 'awaiting_input';

  const sinceState = input.now - Date.parse(input.stateSince);
  const sinceOk = Number.isFinite(sinceState);

  // Our gate failing to start outranks MCP `end`: an agent that correctly ends after
  // submit must not hide a wedged gate from operator alerts / admin. Handoff still
  // unlocks via `agentEndedAt` on the handoff predicate (not only stall === 'ended').
  if (input.state === 'submitted' && sinceOk && sinceState > thresholds.gateNotStartedMs) {
    return 'gate_not_started';
  }

  // MCP `end` is an explicit "I am done iterating" — do not wait for the quiet window.
  if (input.agentEndedAt) return 'ended';

  // Self rounds before the first channel signal are waiting, not stalled. After the
  // first signal, ordinary quiet detection applies.
  if (
    input.builder === 'self' &&
    !input.lastAgentSignalAt &&
    (input.state === 'queued' || input.state === 'dispatched' || input.state === 'building')
  ) {
    return 'no_agent_yet';
  }

  if (!sinceOk) return null;

  // `not_dispatched` is only for rounds that never showed channel/session life. Once
  // the agent has spoken, silence is `quiet` even if the job is still `dispatched`
  // (resume lands there until `in_progress` / first progress) — otherwise self→platform
  // handoff would stay locked forever on a quiet dispatched round.
  if (
    (input.state === 'queued' || input.state === 'dispatched') &&
    !input.lastAgentSignalAt &&
    sinceState > thresholds.notDispatchedMs
  ) {
    return 'not_dispatched';
  }

  if (
    input.state === 'building' ||
    ((input.state === 'queued' || input.state === 'dispatched') && input.lastAgentSignalAt)
  ) {
    // Fall back to when the build entered this state when the agent has never spoken —
    // otherwise a session that dies before its first report would never register as
    // quiet at all, which is the worst case to miss. (queued/dispatched only reach this
    // branch when a signal exists, so the fallback is for `building` alone.)
    const lastSignal = input.lastAgentSignalAt ? Date.parse(input.lastAgentSignalAt) : NaN;
    const silenceFrom = Number.isFinite(lastSignal) ? lastSignal : Date.parse(input.stateSince);
    if (Number.isFinite(silenceFrom) && input.now - silenceFrom > thresholds.quietMs) return 'quiet';
  }

  return null;
}

/**
 * Whether a self round with no agent signal has outlived the connect window and should
 * be auto-abandoned. Pure: the sweep supplies the clock and the configured window.
 */
export function shouldAutoAbandonSelfRound(input: {
  builder?: BuilderKind;
  lastAgentSignalAt?: string;
  abandonedAt?: string;
  state?: JobState;
  /** When the current round opened (typically `stateSince` after dispatch). */
  roundOpenedAt: string;
  now: number;
  connectDays: number;
}): boolean {
  if (input.builder !== 'self') return false;
  if (input.lastAgentSignalAt || input.abandonedAt) return false;
  if (input.state && isTerminal(input.state)) return false;
  const opened = Date.parse(input.roundOpenedAt);
  if (!Number.isFinite(opened)) return false;
  const windowMs = input.connectDays * 24 * 60 * 60 * 1000;
  return input.now - opened >= windowMs;
}
