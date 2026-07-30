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

import type { AgentTaskState } from './agent-tasks.js';
import type { SubmissionStatus } from './submission-status.js';

/**
 * Internal job vocabulary. Richer than the creator-facing {@link SubmissionStatus},
 * because several distinct situations currently collapse into "building" and stay
 * invisible: sources delivered but unverified, our own gate running, an agent that
 * failed outright.
 */
export const JOB_STATES = [
  /** Accepted and paid for out of quota; not yet handed to an agent. */
  'queued',
  /** Handed to an agent backend; the agent has not started working yet. */
  'dispatched',
  /** An agent session is actively working. */
  'building',
  /** The agent delivered candidate sources; nothing has verified them yet. */
  'submitted',
  /** Our own gate is running against the delivered sources. */
  'gating',
  /** Gate green. Waiting on the human review that is the moderation boundary. */
  'ready_for_review',
  /** Approved; the snapshot bake is in flight. */
  'publishing',
  /** Live on the site. Terminal. */
  'published',
  /** Bounced back for another round — gate red past retries, or reviewer rejected. */
  'needs_changes',
  /**
   * The agent failed, timed out, or finished without delivering. Terminal for the
   * round — no observation reopens it — but creator feedback dispatches another.
   */
  'failed',
  /** Stopped by the creator or the operator. Terminal. */
  'canceled',
  /** Creator walked away. Terminal, and distinct from canceled for reporting. */
  'abandoned',
] as const;
export type JobState = (typeof JOB_STATES)[number];

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
  building: ['submitted', 'ready_for_review', 'needs_changes', 'failed', 'canceled', 'abandoned'],
  submitted: ['gating', 'failed', 'canceled', 'abandoned'],
  gating: ['ready_for_review', 'needs_changes', 'failed', 'canceled', 'abandoned'],
  ready_for_review: ['publishing', 'needs_changes', 'canceled', 'abandoned'],
  // A failed bake must be able to fall back, or a job strands with no way home.
  publishing: ['published', 'needs_changes', 'failed'],
  // Improvements start a *new* job, so publishing is terminal for this one.
  published: [],
  // Another round: back to the queue, which is what dispatching a follow-up means.
  needs_changes: ['queued', 'dispatched', 'building', 'canceled', 'abandoned'],
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
    case 'gating':
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
}

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
  const pastAgent: readonly JobState[] = ['submitted', 'gating', 'ready_for_review', 'publishing'];
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
        return { to: 'canceled', reason: 'task_cancelled' };
    }
  })();

  if (!next || next.to === current) return null;
  return canTransition(current, next.to) ? next : null;
}

/**
 * Why a job looks stuck. This is the answer to the creator-experience finding that we
 * "still have no way to tell **stuck** from **slow**" — with an agent state machine and
 * our own transition timestamps, most of it stops being guesswork.
 */
export type JobStall =
  /** The agent is explicitly blocked on an answer. Known, not inferred. */
  | 'awaiting_input'
  /** Accepted but never handed to an agent — dispatch itself is wedged. */
  | 'not_dispatched'
  /** A live session that has said nothing for a while. The old heuristic, kept. */
  | 'quiet'
  /** Delivered, but our own gate never picked it up. Our bug, not the agent's. */
  | 'gate_not_started';

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
  now: number;
  thresholds?: StallThresholds;
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
  if (!Number.isFinite(sinceState)) return null;

  if ((input.state === 'queued' || input.state === 'dispatched') && sinceState > thresholds.notDispatchedMs) {
    return 'not_dispatched';
  }

  if (input.state === 'submitted' && sinceState > thresholds.gateNotStartedMs) {
    return 'gate_not_started';
  }

  if (input.state === 'building') {
    // Fall back to when the build entered `building` when the agent has never spoken —
    // otherwise a session that dies before its first report would never register as
    // quiet at all, which is the worst case to miss.
    const lastSignal = input.lastAgentSignalAt ? Date.parse(input.lastAgentSignalAt) : NaN;
    const silenceFrom = Number.isFinite(lastSignal) ? lastSignal : Date.parse(input.stateSince);
    if (Number.isFinite(silenceFrom) && input.now - silenceFrom > thresholds.quietMs) return 'quiet';
  }

  return null;
}
