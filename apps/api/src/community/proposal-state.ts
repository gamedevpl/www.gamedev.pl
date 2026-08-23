import { DECLINE_REASONS, type DeclineReason, type ProposalPublicState } from '@gamedevpl/contract';

// The proposal state machine.
//
// A proposal is a change to a game somebody else owns: an immutable candidate version the
// proposer cannot publish, plus the record of who decides and what they decided. It is the
// contribute-back exit that Remix has never had — remixes stay ephemeral and still never
// publish; a proposal is the earned, reviewed form of the same edit.
//
// Everything here is pure — no I/O, no clock of its own — for the same reason `job-state`
// is: the rules are read by the proposer's tracker, the reviewer's card, the ops queue,
// and the sweeps that supersede and expire, and those must not be able to disagree about
// what a proposal is allowed to do next.
//
// The one rule worth stating in prose because no type can carry it: **no transition here
// publishes anything.** `accepted` means the target's owner adopted the version into a job
// of their own, which then goes through the same human publish as every other version. A
// proposal that reaches `merged` did so because that publish happened, not because this
// machine moved it there.

/**
 * Internal proposal vocabulary.
 *
 * Richer than what either side sees: the proposer's tracker collapses `gating` into
 * "checking", and the reviewer never sees a proposal at all before `in_review`. That
 * asymmetry is deliberate and load-bearing — see {@link isReviewerVisible}.
 */
export const PROPOSAL_STATES = [
  /** Being assembled by the proposer (remix session, fork, or agent round). Not yet sent. */
  'draft',
  /** Sent. Text has passed moderation; the version is written; the gate has not run. */
  'submitted',
  /** Our gate is running against the proposed sources. */
  'gating',
  /**
   * Gate green and waiting on the reviewer — the owner-of-record for the target.
   * The first state the reviewer can see.
   */
  'in_review',
  /**
   * Gate red. Back with the proposer, and invisible to the reviewer: a change that does
   * not run is not a change anybody should be asked to judge.
   */
  'needs_work',
  /** Reviewer asked for something specific. Also back with the proposer. */
  'changes_requested',
  /**
   * The reviewer adopted the version into a job of their own. **Not published** — the
   * owner still publishes it the ordinary way.
   */
  'accepted',
  /** The adopted version went live. Terminal, and the only state that means "in the game". */
  'merged',
  /** Reviewer said no. Terminal. */
  'declined',
  /** Proposer took it back. Terminal. */
  'withdrawn',
  /**
   * The target moved on: its published version is no longer the base this was built
   * against, so the diff no longer describes a change anybody can apply. Terminal, but the
   * tracker offers a rebuild that opens a fresh proposal.
   */
  'superseded',
  /** Nobody reviewed it in time. Terminal, and deliberately not a decline. */
  'expired',
] as const;
export type ProposalState = (typeof PROPOSAL_STATES)[number];

export const TERMINAL_PROPOSAL_STATES: ReadonlySet<ProposalState> = new Set<ProposalState>([
  'merged',
  'declined',
  'withdrawn',
  'superseded',
  'expired',
]);

export function isTerminalProposal(state: ProposalState): boolean {
  return TERMINAL_PROPOSAL_STATES.has(state);
}

/**
 * States in which the proposal is the proposer's to move — they can edit and resend, and
 * the reviewer is not waiting on anything.
 */
export const PROPOSER_TURN_STATES: ReadonlySet<ProposalState> = new Set<ProposalState>([
  'draft',
  'needs_work',
  'changes_requested',
]);

export function isProposerTurn(state: ProposalState): boolean {
  return PROPOSER_TURN_STATES.has(state);
}

/**
 * Whether the reviewer can see this proposal at all.
 *
 * A proposal becomes visible when it is green and stays visible once decided, so a
 * reviewer's own history does not vanish. It is never visible while it is red or while the
 * proposer is still working — which is what stops a stranger from using someone's review
 * queue as a notification channel: to reach a creator at all, a change has to compile,
 * run, and pass the same gate their own deliveries pass.
 */
export function isReviewerVisible(state: ProposalState): boolean {
  switch (state) {
    case 'draft':
    case 'submitted':
    case 'gating':
    case 'needs_work':
    case 'withdrawn':
      return false;
    default:
      return true;
  }
}

/**
 * Legal transitions.
 *
 * Explicit rather than permissive for the same reason the job machine is: sweeps run on
 * timers (supersede on publish, expire on age) and a late one must not be able to drag a
 * decided proposal backwards — reviving a withdrawn proposal, or un-merging a live change.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<ProposalState, readonly ProposalState[]>> = {
  // Nothing but sending it, abandoning it, or the target moving under it.
  draft: ['submitted', 'withdrawn', 'superseded'],
  submitted: ['gating', 'in_review', 'needs_work', 'withdrawn', 'superseded'],
  // `in_review` direct from gating is the ordinary green path; `needs_work` the red one.
  gating: ['in_review', 'needs_work', 'withdrawn', 'superseded'],
  in_review: ['accepted', 'declined', 'changes_requested', 'withdrawn', 'superseded', 'expired'],
  // A repaired proposal goes back through the gate rather than straight to the reviewer:
  // the verdict on the manifest must describe the sources the reviewer is looking at.
  needs_work: ['submitted', 'withdrawn', 'superseded'],
  changes_requested: ['submitted', 'withdrawn', 'superseded', 'expired'],
  // Accepted is not the end: the owner still has to publish, and that can fail or be
  // abandoned, in which case the proposal goes back to being a decision they have not made.
  accepted: ['merged', 'in_review', 'declined', 'superseded'],
  merged: [],
  declined: [],
  withdrawn: [],
  superseded: [],
  expired: [],
};

export function canTransitionProposal(from: ProposalState, to: ProposalState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Who moved a proposal. Mirrors {@link import('../job-state.js').TransitionActor}. */
export type ProposalActor = 'proposer' | 'reviewer' | 'operator' | 'gate' | 'system';

export interface ProposalTransition {
  to: ProposalState;
  at: string;
  by: ProposalActor;
  /** Short machine-readable cause, e.g. `gate_green`, `stale_base`, `owner_silent`. */
  reason?: string;
}

/** Capped like the job machine's, and for the same reason: a document, not a log. */
export const MAX_PROPOSAL_TRANSITIONS = 50;

/**
 * Why a reviewer said no.
 *
 * `off_topic` and `quality` are taste; `unsafe` and `infringing` are moderation. Only the
 * moderation ones make a *platform* decline reportable, which is why they are named apart
 * rather than collapsed into one "no".
 */
export { DECLINE_REASONS, type DeclineReason };

const MODERATION_DECLINE_REASONS: ReadonlySet<DeclineReason> = new Set<DeclineReason>(['unsafe', 'infringing']);

/**
 * Whether a decline is a moderation act rather than a matter of taste.
 *
 * The distinction decides whether we owe a statement of reasons. A creator declining a
 * change to their own game is exercising authorship — they owe the proposer nothing but
 * courtesy. The platform refusing content is a moderation decision under the DSA, and the
 * terms already promise the reasons for one.
 */
export function isModerationDecline(reason: DeclineReason): boolean {
  return MODERATION_DECLINE_REASONS.has(reason);
}

/**
 * Whether this decision owes the proposer a statement of reasons.
 *
 * Both halves have to be true: the decision has to be the platform's, and it has to be
 * moderation. A creator declining `unsafe` is reporting content, not adjudicating it —
 * that routes to the ordinary report path, which produces its own statement, rather than
 * making every creator a moderator whose taste generates legal notices.
 */
export function owesStatementOfReasons(input: { reviewer: 'platform' | 'creator'; reason: DeclineReason }): boolean {
  return input.reviewer === 'platform' && isModerationDecline(input.reason);
}

/**
 * How long a green proposal waits on a silent reviewer before it expires.
 *
 * Thirty days, and expiry is deliberately not a decline: a creator who has stopped
 * building has not rejected anything, and a queue that grows forever against inactive
 * creators is a queue that eventually shames them into either bad reviews or leaving.
 * The proposer is told the game went quiet, not that they were turned down.
 */
export const PROPOSAL_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

/** Open proposals one person may hold against one game at a time. */
export const MAX_OPEN_PROPOSALS_PER_TARGET = 3;

/** Open proposals one person may hold across the whole platform. */
export const MAX_OPEN_PROPOSALS_PER_PROPOSER = 10;

/**
 * States that count against those caps: everything not yet decided.
 *
 * `accepted` counts too. The owner has said yes but has not published, and the version is
 * still occupying their attention and our storage; letting a proposer open another slot
 * the moment they are accepted would let a fast contributor keep a permanent queue.
 */
export function countsAsOpen(state: ProposalState): boolean {
  return !isTerminalProposal(state);
}

/**
 * Whether a proposal built against `base` still describes an applicable change to a target
 * now published at `current`.
 *
 * Compared by identity rather than ordering: version ids are timestamped but a target can
 * also be rolled back, and "the base is not what is live" is the condition that matters
 * either way. An absent current version means the target is no longer published at all,
 * which is equally stale.
 */
export function isBaseStale(base: string | undefined, current: string | undefined): boolean {
  if (!base) return false;
  if (!current) return true;
  return base !== current;
}

/**
 * The proposer-facing projection.
 *
 * Two collapses, both deliberate. `submitted` and `gating` read as `checking`, because
 * whether our gate or the queue in front of it is busy is our business. `needs_work` and
 * `changes_requested` stay distinct, because "it did not run" and "the owner wants
 * something different" are answered by different work.
 */
export type { ProposalPublicState } from '@gamedevpl/contract';

export function toPublicProposalState(state: ProposalState): ProposalPublicState {
  switch (state) {
    case 'submitted':
    case 'gating':
      return 'checking';
    default:
      return state;
  }
}
