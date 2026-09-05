import type { ContributionMode } from '@gamedevpl/contract';
import type { DeclineReason, ProposalState, ProposalTransition } from '../../community/proposal-state.js';

/**
 * Where a suggestion is in its life (docs/improvement-loop-plan.md IL-3).
 *
 * Named for what this platform does, not for GitHub. `dispatched` and `published` were
 * `issue-filed` and `merged` in the first draft — from a time when work reached an agent
 * as an issue and shipped as a merge. Neither is true now: an improvement is a job we
 * dispatch, and it goes live through the gate and review rather than through a merge.
 *
 * `no-implementer` is a state rather than an error: a creator who approved something
 * deserves to see "nobody was available to do this" instead of an approval that appears
 * to have worked and then silently does nothing.
 *
 * `obsolete` is the one the sweep can reach on its own — a defect that stopped showing up
 * in the evidence. Closing it by measurement rather than leaving it open forever is what
 * keeps an inbox from filling with problems that already went away.
 */
export type SuggestionStatus =
  'proposed' | 'approved' | 'rejected' | 'dispatched' | 'no-implementer' | 'published' | 'measured' | 'obsolete';

/** Statuses where nobody has decided yet, so the sweep may still revise or close them. */
export const OPEN_SUGGESTION_STATUSES: readonly SuggestionStatus[] = ['proposed'];

/**
 * A persisted suggestion.
 *
 * **Deliberately carries no untrusted text.** The in-memory `Suggestion` the router
 * returns has an `untrustedContext` block of game- and player-authored strings; this
 * record drops it and keeps only `slug` + `computedFrom`, so a reader that wants those
 * strings joins the *live* scorecard for them.
 *
 * That is a privacy decision, not a size one. Feedback themes are derived from player
 * text, and the erase path works by making the nightly sweep recompute a scorecard
 * without the erased rows. A suggestion that copied those strings would be a second
 * place they live — one no sweep refreshes once the suggestion is closed, and one the
 * erase path knows nothing about. Referencing beats copying: erasure keeps working
 * through the machinery that already implements it.
 */
export interface SuggestionRecord {
  id: string;
  slug: string;
  /** Null for the majority of the catalog that has no submission, so no creator to ask. */
  ownerUid: string | null;
  class: string;
  priority: number;
  /** Findings and metrics computed by this service. Safe to render and to interpolate. */
  evidence: Array<{ finding: string; metrics: Record<string, number | null> }>;
  status: SuggestionStatus;
  /** Why it reached its current status, when a human or the sweep had a reason. */
  statusReason?: string;
  /**
   * The job this became once an implementer was handed the work.
   *
   * A native improvement is a new job, so this is that job's id — which is also how the
   * measurement pass finds out whether the work ever shipped. Only a legacy submission
   * puts a GitHub issue number here, and that leg is on its way out.
   */
  jobId?: number;
  /** Who decided, and when — so an approval is attributable rather than ambient. */
  decidedBy?: string;
  decidedAt?: string;
  /**
   * The hypothesis metric as it stood when the work was approved.
   *
   * Captured at approval rather than read back later, because the scorecard is a rolling
   * window: by the time an improvement ships, the "before" it should be judged against
   * has already been partly overwritten by play from during the change.
   */
  baseline?: { at: string; metrics: Record<string, number | null> };
  /** When the job carrying this improvement went live. */
  publishedAt?: string;
  /** The verdict, once there is enough post-change play to reach one honestly. */
  outcome?: {
    at: string;
    verdict: 'improved' | 'neutral' | 'regressed';
    metric: string;
    before: number | null;
    after: number | null;
  };
  /** `computedAt` of the scorecard behind it, so a stale suggestion reads as stale. */
  computedFrom: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * What a proposal was built on top of.
 *
 * Two shapes because the catalog has two lanes. A store-lane game's base is the published
 * version id, which is what `isBaseStale` compares. A repo-lane game has no store version
 * — its sources come out of the games-repo archive at the ref the published snapshot was
 * baked from — so the base pins that snapshot and commit instead. Keeping both in one
 * discriminated union means the proposal record never has to ask which lane it is in;
 * only the two places that resolve or re-check a base do.
 */
export type ProposalBase = { kind: 'store'; version: string } | { kind: 'repo'; snapshotId: string; sha: string };

/** One turn in a proposal's conversation. Text is data — never instructions. */
export interface ProposalMessage {
  id: string;
  /** `proposer` or `reviewer`. Not an actor union: only these two ever write here. */
  from: 'proposer' | 'reviewer';
  text: string;
  createdAt: string;
}

/** Transitions and thread entries are capped the same way a job's are, for the same reason. */
export const MAX_PROPOSAL_MESSAGES = 40;

/**
 * A proposed change to a game somebody else owns.
 *
 * The record is deliberately thin on content: it holds *about* the change (who, what
 * target, which base, what state, what was decided) and points at the stored version that
 * holds the change itself. That split is what keeps a proposal cheap to list — the ops
 * queue and the proposer's tracker both read many of these and none of the sources.
 *
 * `targetOwnerUid` is denormalised from the owner-of-record at open time so the reviewer's
 * queue is a single equality query rather than a join against every game's newest job. It
 * is refreshed on every decision, so a slug that changes hands mid-review routes to
 * whoever holds it when the decision is actually made.
 */
export interface ProposalRecord {
  id: string;
  targetSlug: string;
  /** The owner-of-record when the proposal opened. `null` means platform-owned. */
  targetOwnerUid: string | null;
  proposerUid: string;
  base: ProposalBase;
  /**
   * The stored version carrying the change, once one exists.
   *
   * Absent only in `draft`: a proposal that has never been sent has no version, which is
   * also why nothing but `draft` may be missing it.
   */
  version?: string;
  state: ProposalState;
  stateSince: string;
  // Gate runs this proposal has started. Each is a full Cloud Build.
  submitCount?: number;
  transitions: ProposalTransition[];
  /** Creator-supplied, moderated, sanitized. Rendered as text, never as markup. */
  title: string;
  description: string;
  thread: ProposalMessage[];
  /** Read off the version manifest — never trusted from `state`. */
  gate?: { green: boolean; ranAt: string; report?: string; screenshot?: string };
  /**
   * Set when the gate found the proposal changes committed behavioural goldens
   * (a TRACE diff). A finding for the reviewer, never an automatic refusal.
   */
  behaviouralDiff?: boolean;
  decision?: {
    at: string;
    /** Who decided — the reviewing uid, or `platform` for an ops decision. */
    byUid: string | null;
    reviewer: 'platform' | 'creator';
    reason?: DeclineReason;
    /** Optional free text from the reviewer, moderated like any creator text. */
    note?: string;
    /** Set when a decline was reportable and a statement of reasons was sent. */
    statementSentAt?: string;
  };
  /** The improvement job created on accept, so the merge can be followed to `merged`. */
  adoptedJobId?: number;
  /** Repo-lane only: the games-repo PR the apply-bot opened. */
  mergePr?: { number: number; url: string; openedAt: string; mergedAt?: string };
  createdAt: string;
  updatedAt: string;
}

/**
 * Ordering for every proposal list, defined once so the two stores cannot disagree.
 *
 * Newest first, because both audiences read these as "what happened lately". The id
 * tie-break is not decorative: a supersede sweep stamps one timestamp across every
 * proposal against a game that just published, so equal `updatedAt` is the norm rather
 * than the exception, and Firestore guarantees no order among equal keys.
 */
export function compareProposals(a: ProposalRecord, b: ProposalRecord): number {
  return b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
}

/**
 * Whether a game accepts proposals at all, and from whom.
 *
 * Default `off`, and the default is the product decision rather than a placeholder: a
 * creator who never asked for contributions must never discover them by being sent one.
 * Stored per slug rather than per creator because it is a property of the game — a creator
 * may well want help on one and not on another.
 */
export interface GameContributionSettings {
  slug: string;
  mode: ContributionMode;
  updatedAt: string;
  /** Who last changed it. Absent on platform defaults nobody has touched. */
  updatedByUid?: string;
}

/**
 * One person a creator will not take proposals from.
 *
 * Kept per blocking creator rather than as a global flag on the blocked account: blocking
 * is a personal boundary, not a moderation verdict, and one creator's decision must not
 * quietly become a platform-wide ban. Platform-wide refusal already exists and is
 * `User.tier === 'blocked'`.
 */
export interface ContributorBlockRecord {
  /** The creator who blocked. */
  ownerUid: string;
  /** The person blocked. */
  blockedUid: string;
  createdAt: string;
}
