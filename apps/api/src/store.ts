import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { FieldValue, Firestore, type DocumentData, type Query } from '@google-cloud/firestore';
import type { AssessmentSource, VoteValue, WaitlistStatus } from '@gamedevpl/contract';
import { MANAGED_AGENT_VENDORS } from '@gamedevpl/contract';
import type { AgentTaskState } from './agent-state.js';
import type { SeedFiles } from './agent-backend.js';
import type { BuilderKind } from './builder.js';
import type { PublicationHealthCheck, PublicationRecord } from './games-store.js';
import type { AvatarMode } from './creator-profile.js';
import {
  nextRoundGeneration,
  transitionClosesRound,
  type AgentSessionTokens,
  type JobTransition,
} from './job-state.js';
import { isSweepActive } from './sweep-scope.js';
import type { ProposalState } from './proposal-state.js';
import type { BuildEvent, SubmissionStatus } from './submission-status.js';

/**
 * Uid namespace for automation accounts (docs/agent-access-tokens.md).
 *
 * Alongside `g:` (Google) and `dev:` (local sign-in). Keeping bots in their own
 * namespace is what lets product measurement tell them apart from people — the creator
 * metrics exclude them by this prefix — and it is why minting a token cannot
 * accidentally call a mistyped `g:` account into existence.
 */
export const BOT_UID_PREFIX = 'bot:';

const PUBLIC_PLAY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BETA_INVITE_CODE_BYTES = 24;

function hashBetaInviteCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// Set preserves insertion order — this list is a rotation, not a set.
function normalizeFeaturedPoolSlugs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.flatMap((entry) => {
        if (typeof entry !== 'string') return [];
        const slug = entry.trim().toLowerCase();
        return PUBLIC_PLAY_SLUG_PATTERN.test(slug) ? [slug] : [];
      }),
    ),
  ];
}

function normalizePublicPlaySlugs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.flatMap((entry) => {
        if (typeof entry !== 'string') return [];
        const slug = entry.trim().toLowerCase();
        return PUBLIC_PLAY_SLUG_PATTERN.test(slug) ? [slug] : [];
      }),
    ),
  ];
}

// Record types moved to store/records/*.ts (Phase 2 wave 1). Re-exported here so
// every existing importer keeps working unchanged; each slice's own consumers
// migrate to the direct path as that slice is carved out in a later wave.
import type { User, HandleRecord, AccountIdentityDeletionResult, ClaimHandleResult } from './store/records/identity.js';
export type { User, HandleRecord, AccountIdentityDeletionResult, ClaimHandleResult };
import { DELETED_ACCOUNT_UID, ACTIVE_DAYS_KEPT, withActiveDay } from './store/records/identity.js';
export { DELETED_ACCOUNT_UID, ACTIVE_DAYS_KEPT, withActiveDay };
import type { BuilderHandoff, AgentEndedBy } from './store/records/rounds.js';
export type { BuilderHandoff, AgentEndedBy };
import type { SubmissionRecord } from './store/records/submission.js';
export type { SubmissionRecord };
import type { JobSeedOutcome, JobCostEntry } from './store/records/dispatch.js';
export type { JobSeedOutcome, JobCostEntry };
import {
  MAX_JOB_COSTS,
  applyMeasuredTokens,
  MAX_JOB_TRANSITIONS,
  JOB_ID_FLOOR,
  dispatchAttempt,
} from './store/records/dispatch.js';
export { MAX_JOB_COSTS, applyMeasuredTokens, MAX_JOB_TRANSITIONS, JOB_ID_FLOOR, dispatchAttempt };
import type {
  CreatorMessage,
  CreatorMessageOrigin,
  BuildShot,
  BuildShotSummary,
  BuildPreview,
  BuildPreviewSummary,
} from './store/records/build-log.js';
export type { CreatorMessage, CreatorMessageOrigin, BuildShot, BuildShotSummary, BuildPreview, BuildPreviewSummary };
import { isStudioOrigin } from './store/records/build-log.js';
export { isStudioOrigin };
import type { CreationLimits, PublicPlayConfig, FeaturedPoolConfig, UsageCounters } from './store/records/quota.js';
export type { CreationLimits, PublicPlayConfig, FeaturedPoolConfig, UsageCounters };
import type { TelemetryEventType, TelemetryEvent, VisitEvent } from './store/records/telemetry.js';
export type { TelemetryEventType, TelemetryEvent, VisitEvent };
import {
  TELEMETRY_RETENTION_DAYS,
  TELEMETRY_TTL_FIELD,
  TELEMETRY_COLLECTION,
  VISIT_COLLECTION,
  telemetryExpiresAt,
} from './store/records/telemetry.js';
export { TELEMETRY_RETENTION_DAYS, TELEMETRY_TTL_FIELD, TELEMETRY_COLLECTION, VISIT_COLLECTION, telemetryExpiresAt };
import type {
  NotificationType,
  ProposalNotificationType,
  SubmissionNotificationType,
  OperatorNotificationType,
  StoredNotification,
  PushSubscriptionRecord,
} from './store/records/notifications.js';
export type {
  NotificationType,
  ProposalNotificationType,
  SubmissionNotificationType,
  OperatorNotificationType,
  StoredNotification,
  PushSubscriptionRecord,
};
import type { GameVoteCounts, PlayerFeedbackRecord } from './store/records/social.js';
export type { GameVoteCounts, PlayerFeedbackRecord };
import type {
  AssessmentChecklist,
  ReviewSweep,
  AssessmentClientContext,
  AssessmentResolution,
  ResolutionWriteResult,
  GameAssessment,
  GameAssessmentHistoryEntry,
  ReReviewRequest,
  ScorecardUntrusted,
  Scorecard,
} from './store/records/review.js';
export type {
  AssessmentChecklist,
  ReviewSweep,
  AssessmentClientContext,
  AssessmentResolution,
  ResolutionWriteResult,
  GameAssessment,
  GameAssessmentHistoryEntry,
  ReReviewRequest,
  ScorecardUntrusted,
  Scorecard,
};
import {
  GAME_ASSESSMENTS_COLLECTION,
  REVIEW_SWEEPS_COLLECTION,
  gameAssessmentId,
  hydrateGameAssessment,
  GAME_ASSESSMENT_HISTORY_COLLECTION,
  RE_REVIEW_REQUESTS_COLLECTION,
  reReviewRequestId,
} from './store/records/review.js';
export {
  GAME_ASSESSMENTS_COLLECTION,
  REVIEW_SWEEPS_COLLECTION,
  gameAssessmentId,
  hydrateGameAssessment,
  GAME_ASSESSMENT_HISTORY_COLLECTION,
  RE_REVIEW_REQUESTS_COLLECTION,
  reReviewRequestId,
};
import type {
  GameSaveRecord,
  EditorDraftRecord,
  PlayAffinityRecord,
  WorldEntryRecord,
} from './store/records/player-data.js';
export type { GameSaveRecord, EditorDraftRecord, PlayAffinityRecord, WorldEntryRecord };
import {
  MAX_EDITOR_DRAFT_BYTES,
  MAX_PLAY_AFFINITY_GAMES,
  MAX_PLAY_AFFINITY_OPENS,
  MAX_GAME_SAVE_BYTES,
} from './store/records/player-data.js';
export { MAX_EDITOR_DRAFT_BYTES, MAX_PLAY_AFFINITY_GAMES, MAX_PLAY_AFFINITY_OPENS, MAX_GAME_SAVE_BYTES };
import type {
  SuggestionStatus,
  SuggestionRecord,
  ProposalBase,
  ProposalMessage,
  ProposalRecord,
  GameContributionSettings,
  ContributorBlockRecord,
} from './store/records/contribution.js';
export type {
  SuggestionStatus,
  SuggestionRecord,
  ProposalBase,
  ProposalMessage,
  ProposalRecord,
  GameContributionSettings,
  ContributorBlockRecord,
};
import { OPEN_SUGGESTION_STATUSES, MAX_PROPOSAL_MESSAGES, compareProposals } from './store/records/contribution.js';
export { OPEN_SUGGESTION_STATUSES, MAX_PROPOSAL_MESSAGES, compareProposals };
import type { WaitlistEntry, BetaInvite, CreatedBetaInvite, ClaimBetaInviteResult } from './store/records/access.js';
export type { WaitlistEntry, BetaInvite, CreatedBetaInvite, ClaimBetaInviteResult };
import type { AccessTokenRecord } from './store/records/access-tokens.js';
export type { AccessTokenRecord };
import type { GameAgentKeyRecord, CreatorAgentKeyRecord } from './store/records/agent-keys.js';
export type { GameAgentKeyRecord, CreatorAgentKeyRecord };
import type {
  OAuthClientRecord,
  OAuthGrantRecord,
  OAuthAccessTokenRecord,
  OAuthAuthCodeRecord,
  RotateRefreshTokenResult,
} from './store/records/oauth.js';
export type {
  OAuthClientRecord,
  OAuthGrantRecord,
  OAuthAccessTokenRecord,
  OAuthAuthCodeRecord,
  RotateRefreshTokenResult,
};

export interface IdentityStore {
  getUser(uid: string): Promise<User | null>;

  /** Public profile lookup by unique handle (case-insensitive). */
  getUserByHandle(handle: string): Promise<User | null>;

  /**
   * Raw reservation row, including cooldown-held released handles. Availability checks
   * need this — `getUserByHandle` deliberately hides released rows.
   */
  getHandleReservation(handle: string): Promise<HandleRecord | null>;

  /**
   * Claim or rename a handle. Transactional against the `handles` reservation so two
   * creators cannot both win the same name.
   */
  claimHandle(uid: string, handle: string, at: string): Promise<ClaimHandleResult>;

  /** Update profileName / bio / avatarMode. Does not touch the handle. */
  updateCreatorProfile(
    uid: string,
    patch: { profileName?: string; bio?: string; avatarMode?: AvatarMode },
  ): Promise<User | null>;

  /**
   * Drop every handle reservation this uid holds (active or cooldown) and clear profile
   * fields on the user. Used by the account-erasure path so a deleted account cannot
   * keep a handle forever.
   */
  releaseCreatorHandles(uid: string, at: string): Promise<string[]>;

  /**
   * Remove the account record and every credential/subscription tied to it. Published
   * submissions are retained under a non-personal platform owner; unfinished ones are
   * abandoned and likewise unlinked. Player contributions are erased separately first.
   */
  deleteAccountIdentity(uid: string, at: string): Promise<AccountIdentityDeletionResult>;

  /** Mark an account for later erasure without removing any data yet. */
  scheduleAccountDeletion(uid: string, requestedAt: string, scheduledFor: string): Promise<User | null>;

  /** Remove a pending deletion marker, normally when the person signs in again. */
  cancelAccountDeletion(uid: string): Promise<boolean>;

  /** Accounts whose recovery window has elapsed, oldest deadline first. */
  listAccountsDueForDeletion(at: string, limit: number): Promise<User[]>;

  /**
   * Find the single account holding this email, or null.
   *
   * Exists for one caller: linking a Sign in with Apple identity onto the Google account
   * the same person already has (`resolveAppleAccount` in `apple-account.ts`). Without it
   * a creator who taps the Apple button lands in an empty account and their games look
   * deleted.
   *
   * Returns null when *more than one* account matches, not an arbitrary one. An ambiguous
   * match means signing somebody into an account that may not be theirs; a null means
   * they get a fresh account, which is recoverable. Only ever called with an address the
   * identity provider says it verified — see the callers.
   */
  findUserByEmail(email: string): Promise<User | null>;

  upsertUser(userData: Partial<User> & { uid: string }): Promise<User>;

  /** Set (or clear, with null) the global email-unsubscribe timestamp for a user. */
  setEmailUnsubscribed(uid: string, at: string | null): Promise<void>;

  /** Set (or clear, with null) the weekly-digest opt-out for a user. */
  setDigestOptOut(uid: string, at: string | null): Promise<void>;
}

export interface RoundsStore {
  /**
   * Advances `roundGeneration` without a state change — used when a new round starts
   * (creator feedback / operator retry) so the mint that follows binds to the new
   * generation. Returns the new value, or null when the job is gone.
   */
  bumpRoundGeneration(issueNumber: number): Promise<number | null>;

  /**
   * Returns the job's active generation, initializing it to `1` when absent.
   *
   * Used when minting a round-scoped channel token for a legacy job that has never
   * closed a round under the new model: the mint must write the field it claims, or
   * validation rejects the brand-new key (`active === undefined`).
   */
  ensureRoundGeneration(issueNumber: number): Promise<number | null>;

  // Clears stale agentEndedAt/lastAgentSignalAt/lastAgentPresence without touching round counters.
  clearAgentEnded(issueNumber: number): Promise<void>;

  // Fixes the round's kit engine and returns it; first caller wins.
  // `replace` overrides the pin: kit_outdated recovery, or a kit gone.
  pinRoundKitEngineRef(issueNumber: number, engineRef: string, replace?: boolean): Promise<string | null>;

  /** Records the agent backend's last reported state, for stall detection. */
  setSubmissionAgentState(issueNumber: number, agentState: AgentTaskState): Promise<void>;

  /**
   * Records which builder owns the current round and updates the game's default.
   * Starting a new round also resets per-round counters (deliveries, stored seed).
   */
  setRoundBuilder(issueNumber: number, builder: BuilderKind, options?: { resetRoundBudget?: boolean }): Promise<void>;

  requestBuilderHandoff(
    issueNumber: number,
    to: BuilderKind,
    requestedAt: string,
    awaitsAgentAck?: boolean,
  ): Promise<boolean>;

  acknowledgeBuilderHandoff(issueNumber: number, acknowledgedAt: string): Promise<BuilderHandoff | null>;

  clearBuilderHandoff(issueNumber: number): Promise<void>;

  /** Stores (or clears) the generated seed draft on a self-build job. */
  setSubmissionSeed(issueNumber: number, seed: SeedFiles | null): Promise<void>;

  /** Marks seed generation pending / unavailable (available is set via {@link setSubmissionSeed}). */
  setSeedStatus(issueNumber: number, status: 'pending' | 'unavailable'): Promise<void>;

  // Increments and returns how many seed regenerations this job has asked for.
  incrementSeedRegenerations(issueNumber: number): Promise<number>;

  /** Increments and returns the per-round sources-delivery count. */
  incrementRoundDeliveryCount(issueNumber: number): Promise<number>;

  // Bump typecheck-preflight refusal count for this round.
  incrementRoundTypecheckPreflightRefusals(issueNumber: number): Promise<number>;

  // Store or clear bypass diagnostics after the refusal cap.
  setRoundTypecheckPreflightBypassErrors(issueNumber: number, message: string | null): Promise<void>;

  // Bump submit attempts (every deliver call that reaches preflight).
  incrementRoundSubmitAttempts(issueNumber: number): Promise<number>;

  // Bump audio or symbols preflight refusal count.
  incrementRoundPreflightRefusal(issueNumber: number, kind: 'audio' | 'symbols'): Promise<number>;

  // Record that a gate metric was logged for this version/status key.
  setRoundLastGateMetricKey(issueNumber: number, key: string): Promise<void>;
}

export interface DispatchStore {
  /**
   * Moves a job to `transition.to`, stamping `stateSince` and appending to the history.
   *
   * Callers decide *whether* to move (the rules live in job-state.ts); this only records
   * the decision. Returns false when the record is gone, so a caller can tell a no-op
   * from a write. Round-closing transitions also bump `roundGeneration` in the same
   * write (see `transitionClosesRound`).
   */
  recordJobTransition(issueNumber: number, transition: JobTransition): Promise<boolean>;

  /** Appends a dispatch ref, recording which backend is building this job and where. */
  recordDispatch(
    issueNumber: number,
    dispatch: { backend: string; ref: string; workspace?: string; seedWorkspace?: string; credentialRef?: string },
  ): Promise<void>;

  /**
   * Appends one billed thing to a job's ledger. Best-effort by contract: a cost that
   * fails to record must never fail the work it was recording, because the alternative
   * is dropping a build to keep the books.
   */
  recordJobCost(issueNumber: number, entry: JobCostEntry): Promise<void>;

  /**
   * Records what a seeded build's draft achieved. Written once, after dispatch, because
   * that is the first moment both halves are known: the generator says whether it
   * compiles, and only the backend can say whether it was placed.
   */
  recordSeedOutcome(issueNumber: number, outcome: JobSeedOutcome): Promise<void>;

  /**
   * Every seed outcome recorded at or after `since`, newest first.
   *
   * Its own query rather than a filter over `listActiveSubmissions`, because that set
   * drops published jobs — and a *successful* seed is exactly the one whose job is most
   * likely to have published within the window. Reading the alert off that set would
   * quietly hide the successes and report degradation that is not happening.
   */
  listSeedOutcomesSince(since: string): Promise<JobSeedOutcome[]>;

  /**
   * Overwrites the credits on an existing `agent_session` ledger entry identified by
   * `ref`, once the vendor has reported real usage. No-op when no matching entry exists.
   * Best-effort like {@link recordJobCost}: must never fail the poll that discovered it.
   */
  setJobCostCredits(issueNumber: number, ref: string, credits: number): Promise<void>;

  // Token-billed twin of setJobCostCredits; drops the credit placeholder.
  setJobCostTokens(issueNumber: number, ref: string, tokens: AgentSessionTokens): Promise<void>;

  /**
   * Records where a dispatched job's work actually lives, once the backend can say.
   *
   * Deliberately not `recordDispatch`: that appends a session ref, and the ref list is
   * how many agent sessions a build has cost. Learning the branch is not another
   * session, and counting it as one would inflate every per-build cost figure.
   */
  setDispatchWorkspace(issueNumber: number, workspace: string): Promise<void>;

  /**
   * Forgets a released seed branch, so nothing tries to delete it twice.
   *
   * The record is what a later release path reads, so leaving a deleted branch on it
   * would have the job asking GitHub to delete the same ref on every poll — a 404 loop
   * against the one credential that also dispatches.
   */
  clearDispatchSeedWorkspace(issueNumber: number): Promise<void>;

  /**
   * Allocates a job id of our own.
   *
   * Job identity used to be a GitHub issue number, which meant creating a work item in
   * someone else's system before we could name our own job — and made every store key,
   * every token and the whole build channel depend on that call succeeding.
   *
   * Ids stay numeric so none of that has to change; only their *source* moves. They are
   * allocated from {@link JOB_ID_FLOOR} upward, well clear of any real issue number, so
   * the two eras are distinguishable by value alone: below the floor is a legacy
   * issue-keyed job, at or above it is one of ours. That is what lets both be served
   * side by side without a migration or a discriminator column.
   */
  allocateJobId(): Promise<number>;

  claimDispatchReaperAttempt(issueNumber: number, at: string): Promise<boolean>;
}

export interface SubmissionStore {
  createSubmission(issueNumber: number, ownerUid: string, title: string): Promise<SubmissionRecord>;

  getSubmission(issueNumber: number): Promise<SubmissionRecord | null>;

  setSubmissionNotifiedStatus(issueNumber: number, status: SubmissionStatus): Promise<void>;

  /** Records the status last derived from GitHub, whether or not it notified anyone. */
  setSubmissionLastStatus(issueNumber: number, status: SubmissionStatus): Promise<void>;

  /** Records the game directory a submission is building, once it is known. */
  setSubmissionSlug(issueNumber: number, slug: string): Promise<void>;

  /**
   * Updates the name shown on the shelf, in the studio, and in notifications.
   *
   * The creator confirms a title at submission, but games that predate that step were
   * named by truncating the prompt — "A game tycoon like where I run a tv busi" — and
   * that string stuck even after the agent wrote a real title into SPEC.md. Delivery
   * (and the operator backfill) adopt the SPEC title so the shelf matches the game.
   */
  setSubmissionTitle(issueNumber: number, title: string): Promise<void>;

  /** Records the candidate version a delivery just stored, for the preview to read. */
  setSubmissionDeliveredVersion(issueNumber: number, version: string): Promise<void>;

  /** Latest playable version for Studio (preview or publish). */
  setSubmissionPreviewVersion(issueNumber: number, version: string): Promise<void>;

  /** Counts a send-back for finishing without delivering. Returns the new total. */
  recordDeliveryNudge(issueNumber: number): Promise<number>;

  /** Stamps the moment a submission was first seen published (for build-time stats). */
  setSubmissionPublishedAt(issueNumber: number, at: string): Promise<void>;

  /** Marks a submission abandoned by its creator. */
  setSubmissionAbandoned(issueNumber: number, at: string): Promise<void>;

  /** Turns the creator's shared draft link on (a timestamp) or off (null). */
  setDraftShared(issueNumber: number, at: string | null): Promise<void>;

  /** Records the creator's language, so the agent can report progress in it. */
  setSubmissionLocale(issueNumber: number, locale: string): Promise<void>;

  /** Records how many QA answers reached the agent with this submission. */
  setSubmissionClarificationCount(issueNumber: number, count: number): Promise<void>;

  /**
   * Persists the concept the agent will build from (brief.spec / brief.qa).
   * Written once at submission create; not cleared on round boundaries — the
   * game's brief is the job's brief for its whole life.
   */
  setSubmissionBrief(
    issueNumber: number,
    brief: { spec: string; qa: string[]; specIsSystemGenerated?: boolean },
  ): Promise<void>;

  /** Most recently published submissions, newest first — the build-time sample. */
  listRecentlyPublished(limit: number): Promise<SubmissionRecord[]>;

  /**
   * Resolves a slug back to its submission — the lookup behind shareable draft
   * links. Returns null for a slug no submission has claimed.
   *
   * **Newest first when more than one job claims the slug**, which is now the normal
   * case rather than a curiosity: an improvement is a new job on an existing game, so a
   * published game plus an in-flight improvement is two submissions with one slug.
   */
  getSubmissionBySlug(slug: string): Promise<SubmissionRecord | null>;

  /**
   * Every submission that claims this slug, newest first. A published game plus an
   * in-flight improvement is the normal case — two jobs, one slug.
   */
  listSubmissionsBySlug(slug: string): Promise<SubmissionRecord[]>;

  /**
   * The *published* submission for a slug, ignoring in-flight work on the same game.
   *
   * Separate from the lookup above because "who owns this game" and "what is the latest
   * job touching it" stopped being the same question the moment improvements became new
   * jobs. Asking the newest for ownership would mean a game with an improvement running
   * reads as unpublished — and anything that treats unpublished as "no longer live"
   * would quietly retract work it had just commissioned.
   */
  getPublishedSubmissionBySlug(slug: string): Promise<SubmissionRecord | null>;

  /**
   * Submissions the sweep should still check: those not yet in a terminal,
   * already-notified state (published / needs_changes recorded as last-notified).
   */
  listActiveSubmissions(): Promise<SubmissionRecord[]>;

  /**
   * Submissions a creator can still see that have no slug — the backfill's work list.
   *
   * Every submission has been given a slug at creation since the studio started
   * addressing games by name, so this is legacy records plus anything that crashed in
   * the window between the record being written and its slug being set. Oldest first,
   * so a bounded run works through the backlog in a stable order.
   *
   * Abandoned builds are left out deliberately. The shelf hides them, so they are never
   * addressed by anyone, and minting names for them would reserve every one against the
   * games that might want it later.
   */
  listSubmissionsMissingSlug(): Promise<SubmissionRecord[]>;

  /**
   * Delivered (or published) games whose shelf title may still be the truncated prompt
   * from before the naming step — the title-backfill's work list.
   *
   * A delivery writes the SPEC title onto the record now, so this is the backlog of
   * games that arrived before that. Needs a slug and a delivered version so the SPEC
   * can be read from the games store. Abandoned builds are left out for the same
   * reason as {@link listSubmissionsMissingSlug}.
   */
  listSubmissionsWithDelivery(): Promise<SubmissionRecord[]>;

  /**
   * Every submission a creator owns, newest first. Backs the "my games" rail, so a
   * creator finds their work-in-progress without having saved the tracking link
   * (and on a device that never had it in localStorage).
   *
   * Omit `limit` to read the full job history; shelf endpoints collapse to distinct
   * games before applying their own ceiling — a raw job limit is not a game limit.
   */
  listSubmissionsByOwner(ownerUid: string, opts?: { limit?: number }): Promise<SubmissionRecord[]>;

  listQueuedSubmissions(): Promise<SubmissionRecord[]>;
}

export interface BuildLogStore {
  /** Appends a progress event. Returns it with its assigned id and timestamp. */
  appendBuildEvent(
    issueNumber: number,
    event: Omit<BuildEvent, 'id' | 'createdAt'> & { createdAt?: string },
    options?: { preserveEnded?: boolean },
  ): Promise<BuildEvent>;

  /**
   * Refreshes {@link SubmissionRecord.lastAgentSignalAt} without writing a chat event.
   * Used by MCP presence heartbeats so kit-browse activity clears `no_agent_yet` / quiet
   * stalls without stuffing "Browsing the Creator Kit…" into the Studio thread.
   * When `presence` is set, also stores a short-lived thought key for the Studio bar.
   * Clears `agentEndedAt` unless `options.preserveEnded` — gate-poll presence must not
   * relock self→platform handoff after submit auto-end.
   */
  touchLastAgentSignalAt(
    issueNumber: number,
    at?: string,
    presence?: { key: string },
    options?: { preserveEnded?: boolean },
  ): Promise<void>;

  /**
   * Marks that the agent finished iterating this round (MCP `end`). Idempotent.
   * Does not bump generation or stop the channel — creator handoff does that.
   */
  markAgentEnded(issueNumber: number, at?: string, by?: AgentEndedBy): Promise<void>;

  /** Agent progress events for a build, newest first. */
  listBuildEvents(issueNumber: number, opts?: { limit?: number }): Promise<BuildEvent[]>;

  /** How many events a build has recorded — the cap that bounds a runaway agent. */
  countBuildEvents(issueNumber: number): Promise<number>;

  /** Stores a screenshot the agent pushed straight to us, before any commit. */
  appendBuildShot(
    issueNumber: number,
    shot: Omit<BuildShot, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildShot>;

  /** A build's pushed screenshots, newest first. Bytes are omitted unless asked for. */
  listBuildShots(issueNumber: number, opts?: { limit?: number }): Promise<BuildShotSummary[]>;

  /** One pushed screenshot, bytes included — the read behind serving it. */
  getBuildShot(issueNumber: number, id: string): Promise<BuildShot | null>;

  /** How many screenshots a build has pushed — the cap that bounds a runaway agent. */
  countBuildShots(issueNumber: number): Promise<number>;

  appendBuildPreview(
    issueNumber: number,
    preview: Omit<BuildPreview, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildPreview>;

  listBuildPreviews(issueNumber: number, opts?: { limit?: number }): Promise<BuildPreviewSummary[]>;

  getBuildPreview(issueNumber: number, id: string): Promise<BuildPreview | null>;

  countBuildPreviews(issueNumber: number): Promise<number>;

  /** Drops all but the newest `keep` previews, returning how many were removed. */
  pruneBuildPreviews(issueNumber: number, keep: number): Promise<number>;

  /**
   * Queues a creator change request for the agent to collect. `origin` records who
   * typed it — omit it for the Studio composer, pass `agent` when an agent relayed the
   * request on the creator's behalf (@see CreatorMessage.origin).
   *
   * `delivered` writes it already collected, for a request the agent is receiving by
   * another route — a new improvement round, whose brief already *is* this text. It
   * still belongs in the thread (it is what the creator asked for), but queueing it
   * would hand the agent the same instruction twice: once as its brief, once as a
   * pending note that reads like something new to act on.
   */
  appendCreatorMessage(
    issueNumber: number,
    text: string,
    opts?: { origin?: CreatorMessageOrigin; delivered?: boolean; textLocalized?: string; locale?: string },
  ): Promise<CreatorMessage>;

  // Undelivered messages, oldest first — the agent's inbox. Never a 'studio' row.
  listPendingCreatorMessages(issueNumber: number, opts?: { limit?: number }): Promise<CreatorMessage[]>;

  /**
   * Every creator message on a build, delivered or not, oldest first. The status page
   * reads this to echo the creator's own revision history back to them: on jobs without
   * a pull request there is no comment thread to re-read it from, so the store copy is
   * the only durable record of what they asked for.
   */
  listCreatorMessages(issueNumber: number, opts?: { limit?: number }): Promise<CreatorMessage[]>;

  /** Marks messages collected, so the agent is not handed the same request twice. */
  markCreatorMessagesDelivered(issueNumber: number, ids: string[]): Promise<void>;
}

export interface PublicationStore {
  /**
   * Reads what is currently published for a slug, or null when nothing ever was.
   *
   * This — not the presence of an object in the bucket, and not a merge having happened —
   * is publication authority. Keeping it here is what makes a takedown immediate and
   * total: one write withdraws a game, and no leftover storage can contradict it.
   */
  getPublication(slug: string): Promise<PublicationRecord | null>;

  /** Publishes (or re-publishes) a slug at a specific stored version. */
  setPublication(record: PublicationRecord): Promise<void>;

  /**
   * Withdraws a game.
   *
   * Separate from `setPublication` because a takedown is not a publish with different
   * arguments: it must record *why* and *when*, which is what a DSA statement of reasons
   * is written from, and it must be impossible to perform by accident while editing a
   * version pointer.
   */
  takedownPublication(slug: string, reason: string, at: string): Promise<boolean>;

  archivePublication(slug: string, reason: string, at: string): Promise<boolean>;

  /**
   * Records or updates the publication's health re-gate (request, verdict, and
   * notified-at are all patches of the same record — see PublicationHealthCheck).
   * False when the slug has no publication to attach it to.
   */
  setPublicationHealthCheck(slug: string, check: PublicationHealthCheck): Promise<boolean>;

  /** Every slug currently live — the input the snapshot bake reads. */
  listPublications(): Promise<PublicationRecord[]>;

  /**
   * Every slug that has a `games/{slug}` entry — including games whose document does
   * not exist but which have subcollections (votes, feedback, scorecard).
   *
   * Exists for the erase path. A vote's uid is its *document id* and not a field, so
   * unlike feedback there is no query that finds one user's votes across games; the only
   * way is to look under each game. Bounded by the catalog, so a walk is affordable.
   */
  listGameSlugs(): Promise<string[]>;
}

export interface TelemetryStore {
  /**
   * Appends validated play-session events. Date-partitioned so a TTL policy can
   * expire a whole day at once and the aggregation job reads one partition rather
   * than fanning out across every submission.
   */
  appendTelemetryEvents(dateStr: string, events: TelemetryEvent[]): Promise<void>;

  /** One day's events for a game — the read the aggregation job (IL-2) will use. */
  listTelemetryEvents(dateStr: string, opts?: { slug?: string; limit?: number }): Promise<TelemetryEvent[]>;

  /** Appends visit-level events to one day's partition. */
  appendVisitEvents(dateStr: string, events: VisitEvent[]): Promise<void>;

  /** One day's visit events — funnel, depth, and acquisition reads. */
  listVisitEvents(
    dateStr: string,
    opts?: { visitId?: string; limit?: number; type?: VisitEvent['type']; excludeType?: VisitEvent['type'] },
  ): Promise<VisitEvent[]>;
}

export interface QuotaStore {
  /** Today's usage counters for a user, without incrementing anything. */
  getUsage(uid: string, dateStr: string): Promise<UsageCounters>;

  checkAndIncrementQuota(
    uid: string,
    dateStr: string,
    limit: number,
    action: keyof UsageCounters,
  ): Promise<{ allowed: boolean; current: number; tier: User['tier'] }>;

  /** The stored circuit-breaker, or null when nobody has ever set one. */
  getCreationLimits(): Promise<CreationLimits | null>;

  /** Merges a change into the stored breaker and returns the result. */
  setCreationLimits(patch: Partial<Omit<CreationLimits, 'updatedAt'>>, updatedBy: string): Promise<CreationLimits>;

  getPublicPlayConfig(): Promise<PublicPlayConfig | null>;

  setPublicPlaySlugs(slugs: string[], updatedBy: string): Promise<PublicPlayConfig>;

  // Stored curated pool, or null when nobody has set one.
  getFeaturedPoolConfig(): Promise<FeaturedPoolConfig | null>;

  setFeaturedPoolSlugs(slugs: string[], updatedBy: string): Promise<FeaturedPoolConfig>;

  /** How many submissions everyone together has made on `dateStr`. */
  getGlobalSubmissionCount(dateStr: string): Promise<number>;

  // Tab-complete tokens everyone together has spent on `dateStr`.
  getGlobalTabCompleteTokenCount(dateStr: string): Promise<number>;

  /**
   * The global counterpart of checkAndIncrementQuota: takes one slot out of the day's
   * shared allowance, or refuses. Transactional for the same reason the per-user
   * version is — a cap that a burst can walk past is not a cap.
   */
  checkAndIncrementGlobalSubmissions(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }>;

  /** Same shape for the editing lanes' shared daily allowance of model calls. */
  checkAndIncrementGlobalEdits(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }>;

  /** Same shape, for the chat agent's own shared daily allowance. */
  checkAndIncrementGlobalChats(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }>;

  // Same shape as chats, but counts tokens for ghost-text completion.
  checkAndIncrementGlobalTabCompleteTokens(
    dateStr: string,
    tokens: number,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }>;

  // Reconciles a reservation against real usage — never refused, floors at 0.
  adjustGlobalTabCompleteTokens(dateStr: string, delta: number): Promise<number>;

  // Platform rounds everyone together has started on `dateStr`.
  getGlobalManagedBuildCount(dateStr: string): Promise<number>;

  // Same shape, for the shared daily ceiling.
  checkAndIncrementGlobalManagedBuilds(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }>;
}

export interface AccessStore {
  upsertWaitlistEntry(entry: { uid: string; email?: string; name?: string; locale?: string }): Promise<WaitlistEntry>;

  getWaitlistEntry(uid: string): Promise<WaitlistEntry | null>;

  isWaitlistApproved(uid: string, email?: string): Promise<boolean>;

  setWaitlistStatus(uid: string, status: WaitlistStatus): Promise<WaitlistEntry | null>;

  /**
   * Operator listing of the closed-beta waitlist.
   *
   * Sorted newest-request first. When `status` is set, only that status is returned.
   * Bounded by `limit` (default 200) so a growing list cannot ship the whole collection
   * in one console poll — at closed-beta scale the cap is generous; past that the panel
   * filters by status rather than paging.
   */
  listWaitlistEntries(opts?: { status?: WaitlistStatus; limit?: number }): Promise<WaitlistEntry[]>;

  /** Cheap count for the console tab badge. Optional status filter. */
  countWaitlistEntries(status?: WaitlistStatus): Promise<number>;

  /**
   * Approve / reject / reset by email — including pre-approval before the person has
   * ever visited. Mirrors `npm run beta:approve`: finds an existing row by email, or
   * creates `waitlist/email:<lower>` with the requested status.
   */
  setWaitlistStatusByEmail(email: string, status: WaitlistStatus): Promise<WaitlistEntry>;

  // Invite claim becomes membership; keeps requestedAt. See docs/deployment.md.
  recordBetaInviteAdmission(entry: {
    uid: string;
    email?: string;
    name?: string;
    locale?: string;
  }): Promise<WaitlistEntry>;

  createBetaInvite(createdByUid: string): Promise<CreatedBetaInvite>;

  listBetaInvites(opts?: { limit?: number }): Promise<BetaInvite[]>;

  claimBetaInvite(code: string, uid: string): Promise<ClaimBetaInviteResult>;

  revokeBetaInvite(id: string, revokedByUid: string): Promise<BetaInvite | null>;
}

export interface NotificationsStore {
  /**
   * Idempotent by notification id: a second emit for the same id is a no-op and
   * returns `created: false` (a crashed/re-run sweep can safely re-emit).
   */
  createNotification(
    uid: string,
    notification: Omit<StoredNotification, 'readAt' | 'emailedAt'> & { createdAt?: string },
  ): Promise<{ created: boolean; notification: StoredNotification }>;

  listNotifications(uid: string, opts?: { limit?: number }): Promise<StoredNotification[]>;

  markNotificationsRead(uid: string, ids: string[] | 'all'): Promise<void>;

  /** Delete notifications by id, or all of them ('all') — the bell's dismiss/clear. */
  deleteNotifications(uid: string, ids: string[] | 'all'): Promise<void>;

  /** Stamp emailedAt after a successful send so retries don't re-send. */
  markNotificationEmailed(uid: string, id: string, at?: string): Promise<void>;

  /** Upsert a browser push subscription (idempotent by endpoint). */
  savePushSubscription(uid: string, subscription: Omit<PushSubscriptionRecord, 'createdAt'>): Promise<void>;

  /** All push subscriptions for a user — the push fan-out sends to each. */
  listPushSubscriptions(uid: string): Promise<PushSubscriptionRecord[]>;

  /** Remove a subscription (client unsubscribe, or pruning a dead endpoint). */
  deletePushSubscription(uid: string, endpoint: string): Promise<void>;
}

export interface SocialStore {
  /** A user's current vote on a game, or null if they have not voted. */
  getVote(slug: string, uid: string): Promise<VoteValue | null>;

  /**
   * Casts or changes a vote. Repeating the same value is a no-op; voting the other way
   * flips it. Returns the game's updated aggregate counts.
   */
  castVote(slug: string, uid: string, value: VoteValue): Promise<GameVoteCounts>;

  /** Removes a user's vote. Returns the game's updated aggregate counts. */
  clearVote(slug: string, uid: string): Promise<GameVoteCounts>;

  /**
   * Follow / unfollow a game. Stored as `games/{slug}/followers/{uid}` beside votes,
   * with the count denormalised onto the game document the same way vote tallies are —
   * a follower count is read on every page view and must not cost a subcollection scan.
   */
  setGameFollow(slug: string, uid: string, at: string): Promise<number>;

  clearGameFollow(slug: string, uid: string): Promise<number>;

  isFollowingGame(slug: string, uid: string): Promise<boolean>;

  countGameFollowers(slug: string): Promise<number>;

  /**
   * The uids to notify when a game publishes, newest follower first.
   *
   * Bounded rather than complete: fanout is best-effort courtesy beside a publish, and
   * a game with more followers than the cap is a good problem that must not turn one
   * operator click into an unbounded write burst.
   */
  listGameFollowers(slug: string, opts?: { limit?: number }): Promise<string[]>;

  /** A game's aggregate vote counts — the public read, no uid involved. */
  getVoteCounts(slug: string): Promise<GameVoteCounts>;

  /** Appends one already-moderated, already-sanitized feedback row. Returns it with its id. */
  addPlayerFeedback(slug: string, uid: string, text: string): Promise<PlayerFeedbackRecord>;

  /**
   * A game's feedback, newest first.
   *
   * `limit` bounds the read for the scorecard sweep's theme extraction, so one game with
   * thousands of notes cannot dominate a nightly job. Unbounded without it, because the
   * erase preview needs every row it is about to delete.
   */
  listPlayerFeedback(slug: string, opts?: { limit?: number }): Promise<PlayerFeedbackRecord[]>;

  /**
   * How many feedback rows a game has, without reading them.
   *
   * A count rather than a length: the scorecard sweep needs this for every game it
   * touches, and `listPlayerFeedback().length` would bill one document read per row per
   * night. Firestore's aggregate query is billed per index scan instead, so a game with
   * a thousand notes costs about the same as one with three.
   */
  countPlayerFeedback(slug: string): Promise<number>;

  /**
   * Deletes every feedback row a user wrote, across all games. Returns how many.
   *
   * Feedback *is* findable by uid because the row carries it as a field, which is the
   * asymmetry with votes above.
   */
  deletePlayerFeedbackByUid(uid: string): Promise<number>;

  /**
   * How many feedback rows a user wrote, across all games — the dry run for the delete
   * above.
   *
   * Deliberately the *same* predicate as `deletePlayerFeedbackByUid`, differing only in
   * `.count()` versus `.get()`. A preview of a destructive operation that finds its rows
   * by a different route than the deletion does is a preview that can quietly disagree
   * with what follows, and the direction it disagrees in — under-reporting — is the one
   * an operator would not catch.
   */
  countPlayerFeedbackByUid(uid: string): Promise<number>;
}

export interface ReviewStore {
  // Upsert reviewer verdict; second pass overwrites in place.
  upsertGameAssessment(
    input: Omit<GameAssessment, 'id' | 'createdAt' | 'updatedAt' | 'gameVersion' | 'resolution'> & {
      createdAt?: string;
      gameVersion?: string | null;
    },
  ): Promise<GameAssessment>;

  getGameAssessment(slug: string, reviewerUid: string): Promise<GameAssessment | null>;

  // Records or withdraws the follow-up; expectedUpdatedAt pins the verdict.
  setGameAssessmentResolution(
    slug: string,
    reviewerUid: string,
    resolution: AssessmentResolution | null,
    expectedUpdatedAt?: string,
  ): Promise<ResolutionWriteResult>;

  // Every reviewer's row for one game.
  listGameAssessmentsBySlug(slug: string): Promise<GameAssessment[]>;

  listGameAssessmentsByReviewer(reviewerUid: string): Promise<GameAssessment[]>;

  // Recent assessments across reviewers; bounded operator page.
  listGameAssessments(opts?: { limit?: number }): Promise<GameAssessment[]>;

  listGameAssessmentsBySource(source: AssessmentSource): Promise<GameAssessment[]>;

  countGameAssessmentsByUid(uid: string): Promise<number>;

  deleteGameAssessmentsByUid(uid: string): Promise<number>;

  // Superseded rows for one reviewer's one game, newest first.
  listGameAssessmentHistory(slug: string, reviewerUid: string): Promise<GameAssessmentHistoryEntry[]>;

  // Opens or re-opens one re-review request per (slug, reviewerUid) pair.
  upsertReReviewRequests(
    requests: Array<Pick<ReReviewRequest, 'slug' | 'reviewerUid' | 'gameVersion' | 'reason' | 'createdBy'>>,
  ): Promise<ReReviewRequest[]>;

  getReReviewRequest(slug: string, reviewerUid: string): Promise<ReReviewRequest | null>;

  listOpenReReviewRequestsForReviewer(reviewerUid: string): Promise<ReReviewRequest[]>;

  // Recent targeted requests across reviewers; bounded operator page.
  listReReviewRequests(opts?: { limit?: number }): Promise<ReReviewRequest[]>;

  resolveReReviewRequest(slug: string, reviewerUid: string): Promise<ReReviewRequest | null>;

  getOpenReviewSweep(): Promise<ReviewSweep | null>;

  getReviewSweep(id: string): Promise<ReviewSweep | null>;

  listReviewSweeps(opts?: { limit?: number }): Promise<ReviewSweep[]>;

  createReviewSweep(sweep: ReviewSweep): Promise<ReviewSweep>;

  updateReviewSweep(
    id: string,
    patch: Partial<Omit<ReviewSweep, 'id' | 'createdAt' | 'createdBy' | 'slugs' | 'source'>>,
  ): Promise<ReviewSweep | null>;

  /** Overwrites a game's current scorecard (docs/improvement-loop-plan.md IL-2). */
  putScorecard(slug: string, scorecard: Scorecard): Promise<void>;

  /** A game's current scorecard, or null before the first sweep has run for it. */
  getScorecard(slug: string): Promise<Scorecard | null>;

  /**
   * Every game's current scorecard, newest computation first.
   *
   * Exists so the sweep's output is *readable*. Writing an aggregate nobody can look at
   * is the same shape of mistake as a silently-dropping branch: the first sign it had
   * been producing nonsense would be an agent acting on the nonsense. Bounded, because
   * this is one query behind an operator page rather than a paginated surface.
   */
  listScorecards(opts?: { limit?: number }): Promise<Scorecard[]>;
}

export interface PlayerDataStore {
  /** One player's save for one game, or null if they have none. */
  getGameSave(uid: string, slug: string): Promise<GameSaveRecord | null>;

  /** Writes (or replaces) one player's save. The caller has already size-checked `data`. */
  putGameSave(uid: string, slug: string, data: string, version: number): Promise<GameSaveRecord>;

  deleteGameSave(uid: string, slug: string): Promise<void>;

  /** Every save a person has, across games — the erase path's read. */
  listGameSaves(uid: string): Promise<GameSaveRecord[]>;

  /** Deletes every save a person has. Returns how many went. */
  deleteGameSaves(uid: string): Promise<number>;

  /** A creator's editor draft for one of their games, or null when none exists. */
  getEditorDraft(uid: string, slug: string): Promise<EditorDraftRecord | null>;

  /**
   * Writes a creator's draft, incrementing its revision. The caller has already
   * validated and size-checked `content`.
   *
   * `expectedRevision` makes the multi-tab guard real rather than advisory: the
   * compare and the increment happen in one transaction, so two saves racing on
   * the same base cannot both succeed. A mismatch resolves to
   * `{ conflict: true }` with the revision that actually won — never a throw,
   * because losing that race is an ordinary outcome the caller reports as 409.
   * Omit it to take over deliberately (last write wins).
   */
  putEditorDraft(
    uid: string,
    slug: string,
    content: string,
    expectedRevision?: number,
  ): Promise<{ conflict: false; record: EditorDraftRecord } | { conflict: true; revision: number }>;

  deleteEditorDraft(uid: string, slug: string): Promise<void>;

  /** Every editor draft a person has — the erase path's read, used for preview and for real. */
  listEditorDrafts(uid: string): Promise<EditorDraftRecord[]>;

  /** Deletes every editor draft a person has — the erase path. Returns how many went. */
  deleteEditorDrafts(uid: string): Promise<number>;

  /**
   * Records that a signed-in player opened a published game. Upserts the affinity
   * row, bumps `openCount`, and trims the oldest rows when the per-user ceiling is
   * exceeded so the map cannot grow without bound.
   */
  recordPlayAffinity(uid: string, slug: string, at?: string): Promise<PlayAffinityRecord>;

  /** Every game a person has opened while signed in — recommendations + erase read. */
  listPlayAffinity(uid: string): Promise<PlayAffinityRecord[]>;

  /** Deletes every play-affinity row a person has. Returns how many went. */
  deletePlayAffinity(uid: string): Promise<number>;

  /** Every entry in one shared world. The public read — no uid involved. */
  listWorldEntries(worldId: string): Promise<WorldEntryRecord[]>;

  /** One entry, or null. Used to settle ownership before a write. */
  getWorldEntry(worldId: string, key: string): Promise<WorldEntryRecord | null>;

  /**
   * Claims or updates one entry, atomically.
   *
   * Returns `conflict` when the key already belongs to somebody else, and `quota` when
   * this would take the player past `maxPerPlayer`. Both are decided inside the same
   * transaction as the write: checking first and writing after would let two browsers
   * on one account, or two players racing for the same plot, both pass the check.
   */
  putWorldEntry(options: {
    worldId: string;
    key: string;
    uid: string;
    fields: Record<string, string | number | boolean>;
    maxPerPlayer: number;
    maxEntries: number;
  }): Promise<{ ok: true; entry: WorldEntryRecord } | { ok: false; reason: 'conflict' | 'quota' | 'full' }>;

  /** Deletes an entry the player owns. False when it is missing or somebody else's. */
  deleteWorldEntry(worldId: string, key: string, uid: string): Promise<boolean>;

  /** How many entries a player owns in one world — the quota read. */
  countWorldEntries(worldId: string, uid: string): Promise<number>;

  /** Worlds where a person has written something — the erase path's read. */
  listWorldsForUser(uid: string): Promise<string[]>;

  /** Deletes everything one person wrote across every world. Returns how many went. */
  deleteWorldEntriesForUser(uid: string): Promise<number>;
}

export interface ContributionStore {
  /**
   * What the creator has allowed the platform to do to a game unasked (IL-4).
   *
   * Keyed by slug rather than by submission, like every other per-game fact, because a
   * game now outlives the job that built it — an improvement is a new job, and a setting
   * that lived on a submission would be silently forgotten the first time one ran.
   */
  getGameAutonomy(slug: string): Promise<string | null>;

  setGameAutonomy(slug: string, mode: string): Promise<void>;

  /**
   * Deletes up to `limit` documents left by the superseded per-game suggestion sweep.
   *
   * One-shot cleanup, not a permanent feature. An earlier IL-3 slice wrote the router's
   * whole output — including its `untrustedContext` block of game- and player-authored
   * strings — to `games/{slug}/suggestion/current`, overwritten nightly. This design
   * stores no untrusted text and joins the live scorecard instead, which is what keeps
   * erasure working: a player who erases their signals drops out of the next nightly
   * recomputation everywhere that reads it.
   *
   * Those documents are the exception. Nothing reads or refreshes them any more, and the
   * erase path does not know they exist — so a player's words would sit frozen in them
   * indefinitely. Deleting them is finishing the migration, not tidying.
   *
   * Returns how many were removed, so the sweep can report the drain once and then
   * report nothing forever.
   */
  purgeLegacyGameSuggestions(limit: number): Promise<number>;

  /** Writes a suggestion whole (docs/improvement-loop-plan.md IL-3). */
  putSuggestion(record: SuggestionRecord): Promise<void>;

  /** One suggestion by id, or null. */
  getSuggestion(id: string): Promise<SuggestionRecord | null>;

  /**
   * Suggestions, newest first, optionally narrowed.
   *
   * Filtering happens in the query for `status` and `ownerUid` because those are the two
   * a caller always has, and sorting happens in memory: a composite index per filter
   * combination would be real infrastructure for a listing bounded by the catalog.
   */
  listSuggestions(opts?: {
    status?: SuggestionStatus[];
    ownerUid?: string;
    limit?: number;
  }): Promise<SuggestionRecord[]>;

  /** Writes a proposal whole. */
  putProposal(record: ProposalRecord): Promise<void>;

  /** One proposal by id, or null. */
  getProposal(id: string): Promise<ProposalRecord | null>;

  /**
   * Proposals, newest first, optionally narrowed.
   *
   * The three filters are the three questions asked of this collection: "what have I
   * sent?" (`proposerUid`), "what is waiting on me?" (`targetOwnerUid`, with `null`
   * meaning the platform queue), and "what is open against this game?" (`targetSlug`,
   * which the supersede sweep asks after every publish). Sorting is in memory via
   * {@link compareProposals} for the same reason suggestions do it: a composite index per
   * filter combination would be real infrastructure for a listing this size.
   *
   * `targetOwnerUid: null` is a real filter value, not "unset" — it selects
   * platform-owned targets. Callers wanting everything simply omit the key.
   */
  listProposals(opts?: {
    proposerUid?: string;
    targetOwnerUid?: string | null;
    targetSlug?: string;
    state?: ProposalState[];
    limit?: number;
  }): Promise<ProposalRecord[]>;

  /**
   * A game's contribution setting, or null when nobody has ever set one.
   *
   * Null rather than a defaulted `off` on purpose: "never configured" and "deliberately
   * turned off" are the same answer today, but they are different facts, and the day we
   * want to prompt creators to consider contributions we will need to tell them apart.
   */
  getContributionSettings(slug: string): Promise<GameContributionSettings | null>;

  putContributionSettings(record: GameContributionSettings): Promise<void>;

  /** Whether `ownerUid` has blocked `blockedUid` from proposing to their games. */
  isContributorBlocked(ownerUid: string, blockedUid: string): Promise<boolean>;

  blockContributor(record: ContributorBlockRecord): Promise<void>;

  unblockContributor(ownerUid: string, blockedUid: string): Promise<void>;

  /** Everyone this creator has blocked — the settings surface's read. */
  listContributorBlocks(ownerUid: string): Promise<ContributorBlockRecord[]>;
}

export interface AccessTokensStore {
  /** Persist a newly minted personal access token. */
  createAccessToken(record: AccessTokenRecord): Promise<void>;

  /** Point lookup by token id — the hot path on every bearer-authenticated request. */
  getAccessToken(tokenId: string): Promise<AccessTokenRecord | null>;

  /** Every token issued to a user, newest first. Never includes secrets (only hashes). */
  listAccessTokens(uid: string): Promise<AccessTokenRecord[]>;

  /** Revoke by id. Returns false when the token did not exist. */
  deleteAccessToken(tokenId: string): Promise<boolean>;

  /** Best-effort last-use stamp; callers must not let a failure fail the request. */
  touchAccessToken(tokenId: string, at: string): Promise<void>;
}

export interface AgentKeysStore {
  /**
   * Durable per-game opener state (BY-23). Returns null when no key has been issued
   * for this slug yet.
   */
  getGameAgentKey(slug: string): Promise<GameAgentKeyRecord | null>;

  /**
   * Ensures a gameAgentKeys doc exists for (slug, ownerUid), creating generation 1
   * when absent. If the doc exists for a different owner, returns null (caller must
   * refuse — the slug is not theirs to key).
   */
  ensureGameAgentKey(slug: string, ownerUid: string, at: string): Promise<GameAgentKeyRecord | null>;

  /**
   * Transactionally bumps `keyGeneration` for an owned slug. Returns the new record,
   * or null when missing / not owned by `ownerUid`.
   */
  rotateGameAgentKey(slug: string, ownerUid: string, at: string): Promise<GameAgentKeyRecord | null>;

  /**
   * BY-24: admit at most one in-flight `open_round` per slug. Returns false when another
   * caller already holds the lock.
   */
  beginAgentOpenRound(slug: string, at: string): Promise<boolean>;

  /** BY-24: release the admission lock after `open_round` completes or aborts. */
  finishAgentOpenRound(slug: string, at: string): Promise<void>;

  /** Creator-wide opener record, or null when the creator has never minted one. */
  getCreatorAgentKey(ownerUid: string): Promise<CreatorAgentKeyRecord | null>;

  /**
   * Ensures a creatorAgentKeys doc exists for ownerUid, creating generation 1 when
   * absent. Does not clear `revokedAt` — mint after revoke is an explicit reactivate.
   */
  ensureCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord>;

  /**
   * Clears `revokedAt` so a post-revoke mint can issue at the current (already bumped)
   * generation. Creates generation 1 when absent. Does not bump `keyGeneration`.
   */
  reactivateCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord>;

  /**
   * Transactionally bumps `keyGeneration` and clears `revokedAt`. Returns the new
   * record, or null when the creator has no key yet (caller should ensure first).
   */
  rotateCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null>;

  /**
   * Transactionally bumps `keyGeneration` and sets `revokedAt`. Returns the new
   * record, or null when missing. Keeps the doc so generation never resets to 1.
   */
  revokeCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null>;

  /**
   * Re-dates a generation without bumping it, so it mints a valid key again.
   *
   * Mints are anchored to `updatedAt` (one generation, one key), which means a
   * generation older than the key TTL would otherwise mint an expired key forever —
   * and the only escape the panel offers is the destructive Rotate. Re-dating keeps
   * the generation, so nothing that was already dead comes back: every key of this
   * generation had expired before this could run.
   */
  touchCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null>;
}

export interface OAuthStore {
  /** Persist a dynamically registered or CIMD-cached OAuth client. */
  createOAuthClient(record: OAuthClientRecord): Promise<void>;

  getOAuthClient(clientId: string): Promise<OAuthClientRecord | null>;

  createOAuthGrant(record: OAuthGrantRecord): Promise<void>;

  getOAuthGrant(grantId: string): Promise<OAuthGrantRecord | null>;

  getOAuthGrantByRefreshTokenId(refreshTokenId: string): Promise<OAuthGrantRecord | null>;

  listOAuthGrantsByOwner(ownerUid: string): Promise<OAuthGrantRecord[]>;

  revokeOAuthGrant(grantId: string, ownerUid: string): Promise<boolean>;

  createOAuthAccessToken(record: OAuthAccessTokenRecord): Promise<void>;

  getOAuthAccessToken(tokenId: string): Promise<OAuthAccessTokenRecord | null>;

  deleteOAuthAccessToken(tokenId: string): Promise<boolean>;

  createOAuthAuthCode(record: OAuthAuthCodeRecord): Promise<void>;

  /**
   * Single-use: returns the record with `usedAt` set, then deletes the stored
   * row. Already-used or expired codes are deleted and yield null. Wrong-hash
   * presentations leave the row in place.
   */
  consumeOAuthAuthCode(codeId: string, codeHash: string, nowMs: number): Promise<OAuthAuthCodeRecord | null>;

  /**
   * Rotate refresh credentials. When the presented refresh id is not the grant's
   * current one, the whole grant is revoked (reuse detection).
   */
  rotateOAuthRefreshToken(input: {
    refreshTokenId: string;
    refreshSecretHash: string;
    newRefreshTokenId: string;
    newRefreshHash: string;
    newRefreshExpiresAt: string;
    newAccessToken: OAuthAccessTokenRecord;
    nowMs: number;
  }): Promise<RotateRefreshTokenResult>;

  /** First token issue after authorization_code exchange (grant has no refresh yet). */
  issueOAuthTokensFromGrant(input: {
    grantId: string;
    refreshTokenId: string;
    refreshHash: string;
    refreshExpiresAt: string;
    accessToken: OAuthAccessTokenRecord;
    nowMs: number;
  }): Promise<OAuthGrantRecord | null>;
}

export interface Store
  extends
    IdentityStore,
    RoundsStore,
    DispatchStore,
    SubmissionStore,
    BuildLogStore,
    PublicationStore,
    TelemetryStore,
    QuotaStore,
    AccessStore,
    NotificationsStore,
    SocialStore,
    ReviewStore,
    PlayerDataStore,
    ContributionStore,
    AccessTokensStore,
    AgentKeysStore,
    OAuthStore {}

// Stable doc id for a subscription: a hash of its endpoint URL. Endpoints are long
// and contain characters illegal in Firestore doc ids, and hashing gives idempotent
// re-subscribes for free.
export function pushSubscriptionId(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

/**
 * Drop keys whose value is `undefined` before a Firestore write.
 *
 * Firestore rejects `undefined` outright ("Cannot use 'undefined' as a Firestore
 * value") rather than treating it as an absent field, which collides head-on with the
 * TypeScript optional fields (`email?`, `name?`, `picture?`, `locale?`) that this
 * codebase builds records from. The mismatch is invisible in tests because
 * `InMemoryStore` stores whatever it is handed, so it only ever surfaces as a 500 in
 * production — which is exactly how it surfaced: the first `bot:` account (no email, no
 * picture) could not be created, and the waitlist has the same latent fault for anyone
 * whose Google email is unverified, since `auth.ts` deliberately passes `undefined`
 * there rather than store an unverified claim.
 *
 * Applied at the write boundary rather than at each call site so a record can be built
 * naturally, with optional fields left off.
 */
export function stripUndefined<T extends object>(value: T): T {
  // `T extends object`, not `Record<string, unknown>`: interfaces (`User`,
  // `WaitlistEntry`) have no implicit index signature, so the stricter bound rejects
  // every real caller.
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

/**
 * Presentation order for scorecards: newest computation first, slug as the tie-break.
 *
 * The tie-break is the load-bearing half, not a nicety. A sweep stamps **one**
 * `computedAt` onto every game it writes, so equal timestamps are not an edge case —
 * they are every row. Ordering on the timestamp alone leaves the result order undefined
 * (Firestore guarantees nothing among equal values), which would make the operator table
 * reshuffle between reads and, past the read limit, change *which* games appear at all.
 *
 * Shared by both stores so the in-memory one used by tests cannot quietly disagree with
 * the Firestore one used in production — that divergence is what makes an ordering bug
 * invisible until it is in front of a person.
 */
export function compareScorecards(a: Scorecard, b: Scorecard): number {
  return b.computedAt.localeCompare(a.computedAt) || a.slug.localeCompare(b.slug);
}

/**
 * Presentation order for suggestions: worst first, then newest, then slug.
 *
 * Priority leads because this list is a queue of work rather than a log — the question
 * it answers is "what should be looked at first". `createdAt` and `slug` follow for the
 * same reason `compareScorecards` needs a tie-break: one sweep stamps a single timestamp
 * across every row it writes, and equal priorities are common (every `proposed` defect
 * on a game with the same session count sorts alike), so without them the queue would
 * reshuffle between reads.
 *
 * Shared by both stores so the in-memory one used by tests cannot disagree with the
 * Firestore one used in production.
 */
export function compareSuggestions(a: SuggestionRecord, b: SuggestionRecord): number {
  return (
    b.priority - a.priority ||
    b.createdAt.localeCompare(a.createdAt) ||
    a.slug.localeCompare(b.slug) ||
    a.id.localeCompare(b.id)
  );
}

/** A zeroed counter set — the shape every usage read falls back to. */
function emptyUsageCounters(): UsageCounters {
  return {
    submissions: 0,
    previews: 0,
    mocks: 0,
    refines: 0,
    feedback: 0,
    playerFeedback: 0,
    improvements: 0,
    assists: 0,
    chats: 0,
    managedBuilds: 0,
    tabCompletes: 0,
  };
}

/** Newest first, with the id as a stable tie-break for same-millisecond events. */
function byNewestFirst(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

export class InMemoryStore implements Store {
  private users = new Map<string, User>();
  private submissions = new Map<number, SubmissionRecord>();
  private publications = new Map<string, PublicationRecord>();
  private nextJobId = JOB_ID_FLOOR;
  private buildEvents = new Map<number, BuildEvent[]>();
  private buildShots = new Map<number, BuildShot[]>();
  private buildPreviews = new Map<number, BuildPreview[]>();
  private creatorMessages = new Map<number, CreatorMessage[]>();
  private usage = new Map<string, UsageCounters>();
  // yyyy-mm-dd -> submissions accepted that day across every account
  private globalSubmissions = new Map<string, number>();
  private globalEdits = new Map<string, number>();
  private globalChats = new Map<string, number>();
  private globalManagedBuilds = new Map<string, number>();
  private globalTabCompleteTokens = new Map<string, number>();
  private creationLimits: CreationLimits | null = null;
  private publicPlayConfig: PublicPlayConfig | null = null;
  private featuredPoolConfig: FeaturedPoolConfig | null = null;
  private waitlist = new Map<string, WaitlistEntry>();
  private betaInvites = new Map<string, BetaInvite>();
  // yyyymmdd -> events recorded that day
  private telemetry = new Map<string, TelemetryEvent[]>();
  // yyyymmdd -> visit events recorded that day
  private visits = new Map<string, VisitEvent[]>();
  // uid -> (notificationId -> notification)
  private notifications = new Map<string, Map<string, StoredNotification>>();
  // uid -> (endpoint-hash -> subscription)
  private pushSubs = new Map<string, Map<string, PushSubscriptionRecord>>();
  // slug -> (uid -> value)
  private votes = new Map<string, Map<string, VoteValue>>();
  /** slug → uid → followedAt. Mirrors `games/{slug}/followers/{uid}` in Firestore. */
  private follows = new Map<string, Map<string, string>>();
  // slug -> feedback rows, newest last (reversed on read)
  private playerFeedback = new Map<string, PlayerFeedbackRecord[]>();
  private gameAssessments = new Map<string, GameAssessment>();
  // gameAssessmentId -> superseded rows, oldest first.
  private gameAssessmentHistory = new Map<string, GameAssessmentHistoryEntry[]>();
  private reReviewRequests = new Map<string, ReReviewRequest>();
  private reviewSweeps = new Map<string, ReviewSweep>();
  // uid -> (slug -> saved progress)
  private gameSaves = new Map<string, Map<string, GameSaveRecord>>();
  private editorDrafts = new Map<string, Map<string, EditorDraftRecord>>();
  // uid -> (slug -> play affinity for recommendations)
  private playAffinity = new Map<string, Map<string, PlayAffinityRecord>>();
  /** worldId -> key -> entry. Keyed by world, not by player: a world is shared. */
  private worldEntries = new Map<string, Map<string, WorldEntryRecord>>();
  // slug -> current scorecard
  private scorecards = new Map<string, Scorecard>();
  private suggestions = new Map<string, SuggestionRecord>();
  private proposals = new Map<string, ProposalRecord>(); // id -> proposal
  private contributionSettings = new Map<string, GameContributionSettings>(); // slug -> setting
  private contributorBlocks = new Map<string, Map<string, ContributorBlockRecord>>(); // ownerUid -> blockedUid -> row
  private gameAutonomy = new Map<string, string>();
  private legacyGameSuggestions = new Set<string>();
  // tokenId -> personal access token record
  private accessTokens = new Map<string, AccessTokenRecord>();
  // slug -> durable per-game agent opener state (BY-23)
  private gameAgentKeys = new Map<string, GameAgentKeyRecord>();
  private creatorAgentKeys = new Map<string, CreatorAgentKeyRecord>();
  private oauthClients = new Map<string, OAuthClientRecord>();
  private oauthGrants = new Map<string, OAuthGrantRecord>();
  private oauthAccessTokens = new Map<string, OAuthAccessTokenRecord>();
  private oauthAuthCodes = new Map<string, OAuthAuthCodeRecord>();
  /** refresh token id -> grant id — enables reuse detection after rotation. */
  private oauthRefreshTokenIndex = new Map<string, string>();
  // lowercase handle -> reservation
  private handles = new Map<string, HandleRecord>();

  async getUser(uid: string): Promise<User | null> {
    const user = this.users.get(uid);
    return user ? { ...user } : null;
  }

  async getUserByHandle(handle: string): Promise<User | null> {
    const key = handle.trim().toLowerCase();
    const reservation = this.handles.get(key);
    if (!reservation || reservation.releasedAt) return null;
    return this.getUser(reservation.uid);
  }

  async getHandleReservation(handle: string): Promise<HandleRecord | null> {
    const key = handle.trim().toLowerCase();
    const reservation = this.handles.get(key);
    return reservation ? { ...reservation } : null;
  }

  async claimHandle(uid: string, handle: string, at: string): Promise<ClaimHandleResult> {
    const { normalizeHandle, validateHandleShape, HANDLE_RENAME_COOLDOWN_MS } = await import('./creator-profile.js');
    const key = normalizeHandle(handle);
    const shape = validateHandleShape(key);
    if (shape) return { ok: false, reason: shape };

    const user = this.users.get(uid);
    if (!user) return { ok: false, reason: 'not_found' };
    if (user.handle === key) return { ok: false, reason: 'unchanged' };

    if (user.handle && user.handleChangedAt) {
      const elapsed = Date.parse(at) - Date.parse(user.handleChangedAt);
      if (Number.isFinite(elapsed) && elapsed < HANDLE_RENAME_COOLDOWN_MS) {
        return { ok: false, reason: 'cooldown' };
      }
    }

    const existing = this.handles.get(key);
    if (existing && !existing.releasedAt && existing.uid !== uid) {
      return { ok: false, reason: 'taken' };
    }
    if (existing?.releasedAt && existing.previousUid !== uid) {
      const elapsed = Date.parse(at) - Date.parse(existing.releasedAt);
      if (Number.isFinite(elapsed) && elapsed < HANDLE_RENAME_COOLDOWN_MS) {
        return { ok: false, reason: 'taken' };
      }
    }

    if (user.handle) {
      this.handles.set(user.handle, {
        uid: user.uid,
        claimedAt: user.profileCreatedAt ?? at,
        releasedAt: at,
        previousUid: user.uid,
      });
    }

    this.handles.set(key, { uid, claimedAt: user.profileCreatedAt ?? at });
    const updated: User = {
      ...user,
      handle: key,
      profileCreatedAt: user.profileCreatedAt ?? at,
      handleChangedAt: at,
      profileName: user.profileName ?? key,
      // Lettermark until the creator opts into showing their Google picture.
      avatarMode: user.avatarMode ?? 'letter',
    };
    this.users.set(uid, updated);
    return { ok: true, user: { ...updated } };
  }

  async updateCreatorProfile(
    uid: string,
    patch: { profileName?: string; bio?: string; avatarMode?: AvatarMode },
  ): Promise<User | null> {
    const user = this.users.get(uid);
    if (!user) return null;
    const updated: User = {
      ...user,
      ...(patch.profileName !== undefined ? { profileName: patch.profileName } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      ...(patch.avatarMode !== undefined ? { avatarMode: patch.avatarMode } : {}),
    };
    this.users.set(uid, updated);
    return { ...updated };
  }

  async releaseCreatorHandles(uid: string, at: string): Promise<string[]> {
    const released: string[] = [];
    for (const [key, reservation] of [...this.handles.entries()]) {
      const owns =
        (!reservation.releasedAt && reservation.uid === uid) ||
        (Boolean(reservation.releasedAt) && reservation.previousUid === uid);
      if (!owns) continue;
      this.handles.delete(key);
      released.push(key);
    }
    const user = this.users.get(uid);
    if (user) {
      this.users.set(uid, {
        ...user,
        handle: undefined,
        profileName: undefined,
        bio: undefined,
        avatarMode: undefined,
        profileCreatedAt: undefined,
        handleChangedAt: undefined,
      });
    }
    void at;
    return released.sort();
  }

  async deleteAccountIdentity(uid: string, at: string): Promise<AccountIdentityDeletionResult> {
    const user = this.users.get(uid);
    const owned = [...this.submissions.values()].filter((submission) => submission.ownerUid === uid);
    const publishedSlugs = owned
      .filter((submission) => Boolean(submission.publishedAt && submission.slug))
      .map((submission) => submission.slug!)
      .sort();
    const unpublishedSlugs = owned
      .filter((submission) => !submission.publishedAt && submission.slug)
      .map((submission) => submission.slug!)
      .sort();

    for (const submission of owned) {
      this.submissions.set(submission.issueNumber, {
        ...submission,
        ownerUid: DELETED_ACCOUNT_UID,
        ...(!submission.publishedAt ? { abandonedAt: submission.abandonedAt ?? at, draftSharedAt: undefined } : {}),
      });
    }

    for (const [key, reservation] of [...this.handles]) {
      if (reservation.uid === uid || reservation.previousUid === uid) this.handles.delete(key);
    }
    for (const [key, counters] of [...this.usage]) {
      void counters;
      if (key.startsWith(`${uid}:`)) this.usage.delete(key);
    }
    this.waitlist.delete(uid);
    if (user?.email) {
      const email = user.email.toLowerCase();
      for (const [key, entry] of [...this.waitlist]) {
        if (entry.email?.toLowerCase() === email) this.waitlist.delete(key);
      }
    }
    for (const [id, invite] of [...this.betaInvites]) {
      if (invite.createdByUid === uid || invite.claimedUid === uid) this.betaInvites.delete(id);
    }
    this.notifications.delete(uid);
    this.pushSubs.delete(uid);
    this.gameSaves.delete(uid);
    this.editorDrafts.delete(uid);
    this.playAffinity.delete(uid);
    for (const [tokenId, record] of [...this.accessTokens]) {
      if (record.uid === uid) this.accessTokens.delete(tokenId);
    }
    for (const [slug, record] of [...this.gameAgentKeys]) {
      if (record.ownerUid === uid) this.gameAgentKeys.delete(slug);
    }
    this.creatorAgentKeys.delete(uid);
    for (const [id, suggestion] of [...this.suggestions]) {
      if (suggestion.ownerUid === uid) this.suggestions.set(id, { ...suggestion, ownerUid: null, updatedAt: at });
    }
    for (const [clientId, client] of [...this.oauthClients]) {
      if (client.ownerUid === uid) this.oauthClients.set(clientId, { ...client, ownerUid: undefined });
    }
    const grantIds = new Set<string>();
    for (const [grantId, grant] of [...this.oauthGrants]) {
      if (grant.ownerUid !== uid) continue;
      grantIds.add(grantId);
      this.oauthGrants.delete(grantId);
    }
    for (const [tokenId, token] of [...this.oauthAccessTokens]) {
      if (token.ownerUid === uid || grantIds.has(token.grantId)) this.oauthAccessTokens.delete(tokenId);
    }
    for (const [codeId, code] of [...this.oauthAuthCodes]) {
      if (code.ownerUid === uid || (code.grantId && grantIds.has(code.grantId))) this.oauthAuthCodes.delete(codeId);
    }
    for (const [refreshId, grantId] of [...this.oauthRefreshTokenIndex]) {
      if (grantIds.has(grantId)) this.oauthRefreshTokenIndex.delete(refreshId);
    }
    for (const slug of [...publishedSlugs, ...unpublishedSlugs]) this.gameAutonomy.delete(slug);
    this.users.delete(uid);

    return { publishedSlugs, unpublishedSlugs };
  }

  async scheduleAccountDeletion(uid: string, requestedAt: string, scheduledFor: string): Promise<User | null> {
    const user = this.users.get(uid);
    if (!user) return null;
    const updated = { ...user, deletionRequestedAt: requestedAt, deletionScheduledFor: scheduledFor };
    this.users.set(uid, updated);
    return { ...updated };
  }

  async cancelAccountDeletion(uid: string): Promise<boolean> {
    const user = this.users.get(uid);
    if (!user?.deletionScheduledFor) return false;
    this.users.set(uid, { ...user, deletionRequestedAt: undefined, deletionScheduledFor: undefined });
    return true;
  }

  async listAccountsDueForDeletion(at: string, limit: number): Promise<User[]> {
    return [...this.users.values()]
      .filter((user) => user.deletionScheduledFor !== undefined && user.deletionScheduledFor <= at)
      .sort((left, right) => left.deletionScheduledFor!.localeCompare(right.deletionScheduledFor!))
      .slice(0, limit)
      .map((user) => ({ ...user }));
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const wanted = email.trim().toLowerCase();
    if (wanted === '') return null;
    const matches = [...this.users.values()].filter((user) => user.email?.trim().toLowerCase() === wanted);
    if (matches.length !== 1) return null;
    return { ...(matches[0] as User) };
  }

  async upsertUser(userData: Partial<User> & { uid: string }): Promise<User> {
    const now = new Date().toISOString();
    const existing = this.users.get(userData.uid);

    const updated: User = {
      uid: userData.uid,
      email: userData.email ?? existing?.email,
      name: userData.name ?? existing?.name,
      picture: userData.picture ?? existing?.picture,
      createdAt: existing?.createdAt ?? now,
      lastLoginAt: now,
      tier: userData.tier ?? existing?.tier ?? 'standard',
      // Preserve email prefs across logins — a re-login must not resubscribe.
      locale: userData.locale ?? existing?.locale,
      emailUnsubscribedAt: existing?.emailUnsubscribedAt ?? null,
      digestOptOutAt: existing?.digestOptOutAt ?? null,
      // Carried explicitly. Omitting it silently discarded every write from the
      // activity hook in `auth.ts`, whose only purpose is to persist this field.
      activeDays: userData.activeDays ?? existing?.activeDays,
      // Profile fields are never set by sign-in — only claim/update routes touch them.
      handle: existing?.handle,
      profileName: existing?.profileName,
      bio: existing?.bio,
      avatarMode: existing?.avatarMode,
      profileCreatedAt: existing?.profileCreatedAt,
      handleChangedAt: existing?.handleChangedAt,
      deletionRequestedAt: existing?.deletionRequestedAt,
      deletionScheduledFor: existing?.deletionScheduledFor,
    };

    this.users.set(userData.uid, updated);
    return { ...updated };
  }

  async setEmailUnsubscribed(uid: string, at: string | null): Promise<void> {
    const existing = this.users.get(uid);
    if (existing) this.users.set(uid, { ...existing, emailUnsubscribedAt: at });
  }

  async setDigestOptOut(uid: string, at: string | null): Promise<void> {
    const existing = this.users.get(uid);
    if (existing) this.users.set(uid, { ...existing, digestOptOutAt: at });
  }

  async createSubmission(issueNumber: number, ownerUid: string, title: string): Promise<SubmissionRecord> {
    const createdAt = new Date().toISOString();
    const record: SubmissionRecord = {
      issueNumber,
      ownerUid,
      createdAt,
      title,
      // New jobs are generation-scoped from the first mint; legacy records created
      // before this field existed stay unset until their current round closes.
      roundGeneration: 1,
      roundStartedAt: createdAt,
    };
    this.submissions.set(issueNumber, record);
    return { ...record };
  }

  async getSubmission(issueNumber: number): Promise<SubmissionRecord | null> {
    const sub = this.submissions.get(issueNumber);
    return sub ? { ...sub } : null;
  }

  async setSubmissionNotifiedStatus(issueNumber: number, status: SubmissionStatus): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, lastNotifiedStatus: status });
  }

  async setSubmissionLastStatus(issueNumber: number, status: SubmissionStatus): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, lastStatus: status });
  }

  async recordJobTransition(issueNumber: number, transition: JobTransition): Promise<boolean> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return false;
    // Idempotent for concurrent *identical* arrivals (status poll + notify sweep both
    // seeing `submitted`→`needs_changes`/`gate_red`). Same-state with a *new* reason is
    // intentional only for the operator — a quiet-build retry re-enters `building` with
    // `operator_retry`. A reconciler/gate re-observation with a different reason would
    // only reset `stateSince` and overwrite the reason that actually moved the job.
    if (sub.state === transition.to) {
      const last = sub.transitions?.at(-1);
      if (last?.to === transition.to && last?.reason === transition.reason) return false;
      if (transition.by !== 'operator') return false;
    }
    const closes = transitionClosesRound(transition);
    const next: SubmissionRecord = {
      ...sub,
      state: transition.to,
      stateSince: transition.at,
      transitions: [...(sub.transitions ?? []), transition].slice(-MAX_JOB_TRANSITIONS),
      ...(closes
        ? {
            roundGeneration: nextRoundGeneration(sub.roundGeneration),
            roundDeliveryCount: 0,
            roundTypecheckPreflightRefusals: 0,
            roundSubmitAttempts: 0,
            roundPreflightRefusalsAudio: 0,
            roundPreflightRefusalsSymbols: 0,
            roundStartedAt: transition.at,
          }
        : {}),
    };
    if (closes) {
      delete next.seed;
      delete next.seedStatus;
      // Signals belong to the round that closed — keeping them makes the next self
      // round look "connected" before any agent has joined.
      delete next.lastAgentSignalAt;
      delete next.lastAgentPresence;
      delete next.agentEndedAt;
      delete next.agentEndedBy;
      delete next.roundKitEngineRef;
      delete next.roundTypecheckPreflightBypassErrors;
      delete next.roundLastGateMetricKey;
    }
    this.submissions.set(issueNumber, next);
    return true;
  }

  async bumpRoundGeneration(issueNumber: number): Promise<number | null> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return null;
    const roundGeneration = nextRoundGeneration(sub.roundGeneration);
    const next: SubmissionRecord = {
      ...sub,
      roundGeneration,
      roundDeliveryCount: 0,
      roundTypecheckPreflightRefusals: 0,
      roundSubmitAttempts: 0,
      roundPreflightRefusalsAudio: 0,
      roundPreflightRefusalsSymbols: 0,
      roundStartedAt: new Date().toISOString(),
    };
    delete next.seed;
    delete next.seedStatus;
    delete next.lastAgentSignalAt;
    delete next.lastAgentPresence;
    delete next.agentEndedAt;
    delete next.agentEndedBy;
    delete next.roundKitEngineRef;
    delete next.roundTypecheckPreflightBypassErrors;
    delete next.roundLastGateMetricKey;
    this.submissions.set(issueNumber, next);
    return roundGeneration;
  }

  async pinRoundKitEngineRef(issueNumber: number, engineRef: string, replace = false): Promise<string | null> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return null;
    if (sub.roundKitEngineRef && !replace) return sub.roundKitEngineRef;
    this.submissions.set(issueNumber, { ...sub, roundKitEngineRef: engineRef });
    return engineRef;
  }

  async requestBuilderHandoff(
    issueNumber: number,
    to: BuilderKind,
    requestedAt: string,
    awaitsAgentAck = true,
  ): Promise<boolean> {
    const sub = this.submissions.get(issueNumber);
    if (!sub || sub.builderHandoff) return false;
    const from = sub.builder ?? sub.defaultBuilder ?? 'platform';
    if (from === to) return false;
    this.submissions.set(issueNumber, { ...sub, builderHandoff: { from, to, requestedAt, awaitsAgentAck } });
    return true;
  }

  async acknowledgeBuilderHandoff(issueNumber: number, acknowledgedAt: string): Promise<BuilderHandoff | null> {
    const sub = this.submissions.get(issueNumber);
    if (!sub?.builderHandoff || sub.builderHandoff.acknowledgedAt) return null;
    const handoff: BuilderHandoff = { ...sub.builderHandoff, acknowledgedAt };
    this.submissions.set(issueNumber, { ...sub, builderHandoff: handoff });
    return handoff;
  }

  async clearBuilderHandoff(issueNumber: number): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (!sub?.builderHandoff) return;
    const next = { ...sub };
    delete next.builderHandoff;
    this.submissions.set(issueNumber, next);
  }

  async ensureRoundGeneration(issueNumber: number): Promise<number | null> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return null;
    if (sub.roundGeneration !== undefined) return sub.roundGeneration;
    this.submissions.set(issueNumber, { ...sub, roundGeneration: 1 });
    return 1;
  }

  async clearAgentEnded(issueNumber: number): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return;
    const next = { ...sub };
    delete next.lastAgentSignalAt;
    delete next.lastAgentPresence;
    delete next.agentEndedAt;
    delete next.agentEndedBy;
    this.submissions.set(issueNumber, next);
  }

  async setSubmissionAgentState(issueNumber: number, agentState: AgentTaskState): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, agentState });
  }

  async setRoundBuilder(
    issueNumber: number,
    builder: BuilderKind,
    options?: { resetRoundBudget?: boolean },
  ): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return;
    const reset = options?.resetRoundBudget ?? false;
    const next: SubmissionRecord = {
      ...sub,
      builder,
      defaultBuilder: builder,
    };
    if (reset) {
      delete next.seed;
      delete next.seedStatus;
      next.roundDeliveryCount = 0;
      next.roundTypecheckPreflightRefusals = 0;
      next.roundSubmitAttempts = 0;
      next.roundPreflightRefusalsAudio = 0;
      next.roundPreflightRefusalsSymbols = 0;
      next.roundStartedAt = new Date().toISOString();
      delete next.roundTypecheckPreflightBypassErrors;
      delete next.roundLastGateMetricKey;
    }
    this.submissions.set(issueNumber, next);
  }

  async setSubmissionSeed(issueNumber: number, seed: SeedFiles | null): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return;
    if (seed) {
      this.submissions.set(issueNumber, { ...sub, seed, seedStatus: 'available' });
      return;
    }
    const next = { ...sub, seedStatus: 'unavailable' as const };
    delete next.seed;
    this.submissions.set(issueNumber, next);
  }

  async setSeedStatus(issueNumber: number, status: 'pending' | 'unavailable'): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return;
    // Never downgrade an already-stored draft.
    if (sub.seed) {
      this.submissions.set(issueNumber, { ...sub, seedStatus: 'available' });
      return;
    }
    this.submissions.set(issueNumber, { ...sub, seedStatus: status });
  }

  async incrementSeedRegenerations(issueNumber: number): Promise<number> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return 0;
    const seedRegenerations = (sub.seedRegenerations ?? 0) + 1;
    this.submissions.set(issueNumber, { ...sub, seedRegenerations });
    return seedRegenerations;
  }

  async incrementRoundDeliveryCount(issueNumber: number): Promise<number> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return 0;
    const roundDeliveryCount = (sub.roundDeliveryCount ?? 0) + 1;
    this.submissions.set(issueNumber, { ...sub, roundDeliveryCount });
    return roundDeliveryCount;
  }

  async incrementRoundTypecheckPreflightRefusals(issueNumber: number): Promise<number> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return 0;
    const roundTypecheckPreflightRefusals = (sub.roundTypecheckPreflightRefusals ?? 0) + 1;
    this.submissions.set(issueNumber, { ...sub, roundTypecheckPreflightRefusals });
    return roundTypecheckPreflightRefusals;
  }

  async setRoundTypecheckPreflightBypassErrors(issueNumber: number, message: string | null): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return;
    if (message == null) {
      const next = { ...sub };
      delete next.roundTypecheckPreflightBypassErrors;
      this.submissions.set(issueNumber, next);
      return;
    }
    this.submissions.set(issueNumber, { ...sub, roundTypecheckPreflightBypassErrors: message });
  }

  async incrementRoundSubmitAttempts(issueNumber: number): Promise<number> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return 0;
    const roundSubmitAttempts = (sub.roundSubmitAttempts ?? 0) + 1;
    this.submissions.set(issueNumber, { ...sub, roundSubmitAttempts });
    return roundSubmitAttempts;
  }

  async incrementRoundPreflightRefusal(issueNumber: number, kind: 'audio' | 'symbols'): Promise<number> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return 0;
    if (kind === 'audio') {
      const roundPreflightRefusalsAudio = (sub.roundPreflightRefusalsAudio ?? 0) + 1;
      this.submissions.set(issueNumber, { ...sub, roundPreflightRefusalsAudio });
      return roundPreflightRefusalsAudio;
    }
    const roundPreflightRefusalsSymbols = (sub.roundPreflightRefusalsSymbols ?? 0) + 1;
    this.submissions.set(issueNumber, { ...sub, roundPreflightRefusalsSymbols });
    return roundPreflightRefusalsSymbols;
  }

  async setRoundLastGateMetricKey(issueNumber: number, key: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return;
    this.submissions.set(issueNumber, { ...sub, roundLastGateMetricKey: key });
  }

  async allocateJobId(): Promise<number> {
    this.nextJobId = Math.max(this.nextJobId, JOB_ID_FLOOR) + 1;
    return this.nextJobId;
  }

  async recordDispatch(
    issueNumber: number,
    dispatch: { backend: string; ref: string; workspace?: string; seedWorkspace?: string; credentialRef?: string },
  ): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return;
    const existing = sub.dispatch;
    this.submissions.set(issueNumber, {
      ...sub,
      dispatch: {
        backend: dispatch.backend,
        refs: [...(existing?.refs ?? []), dispatch.ref],
        ...(dispatch.credentialRef
          ? { credentialRefs: { ...existing?.credentialRefs, [dispatch.ref]: dispatch.credentialRef } }
          : {}),
        workspace: dispatch.workspace ?? existing?.workspace,
        seedWorkspace: dispatch.seedWorkspace ?? existing?.seedWorkspace,
      },
    });
  }

  async clearDispatchSeedWorkspace(issueNumber: number): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (!sub?.dispatch) return;
    const dispatch = { ...sub.dispatch };
    delete dispatch.seedWorkspace;
    this.submissions.set(issueNumber, { ...sub, dispatch });
  }

  async recordSeedOutcome(issueNumber: number, outcome: JobSeedOutcome): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return;
    this.submissions.set(issueNumber, { ...sub, seedOutcome: outcome });
  }

  async listSeedOutcomesSince(since: string): Promise<JobSeedOutcome[]> {
    return [...this.submissions.values()]
      .map((sub) => sub.seedOutcome)
      .filter((outcome): outcome is JobSeedOutcome => Boolean(outcome) && outcome!.at >= since)
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  async recordJobCost(issueNumber: number, entry: JobCostEntry): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return;
    this.submissions.set(issueNumber, {
      ...sub,
      costs: [...(sub.costs ?? []), entry].slice(-MAX_JOB_COSTS),
    });
  }

  async setJobCostCredits(issueNumber: number, ref: string, credits: number): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (!sub?.costs?.length) return;
    let changed = false;
    const costs = sub.costs.map((entry) => {
      if (entry.kind !== 'agent_session' || entry.ref !== ref || entry.creditsMeasured) return entry;
      changed = true;
      return { ...entry, credits, creditsMeasured: true };
    });
    if (!changed) return;
    this.submissions.set(issueNumber, { ...sub, costs });
  }

  async setJobCostTokens(issueNumber: number, ref: string, tokens: AgentSessionTokens): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (!sub?.costs?.length) return;
    const costs = applyMeasuredTokens(sub.costs, ref, tokens);
    if (!costs) return;
    this.submissions.set(issueNumber, { ...sub, costs });
  }

  async setDispatchWorkspace(issueNumber: number, workspace: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (!sub?.dispatch) return;
    this.submissions.set(issueNumber, { ...sub, dispatch: { ...sub.dispatch, workspace } });
  }

  async getPublication(slug: string): Promise<PublicationRecord | null> {
    const record = this.publications.get(slug);
    return record ? { ...record } : null;
  }

  async setPublication(record: PublicationRecord): Promise<void> {
    this.publications.set(record.slug, { ...record });
  }

  async setPublicationHealthCheck(slug: string, check: PublicationHealthCheck): Promise<boolean> {
    const record = this.publications.get(slug);
    if (!record) return false;
    this.publications.set(slug, { ...record, healthCheck: { ...check } });
    return true;
  }

  async takedownPublication(slug: string, reason: string, at: string): Promise<boolean> {
    const record = this.publications.get(slug);
    if (!record) return false;
    this.publications.set(slug, { ...record, state: 'disabled', takedownAt: at, takedownReason: reason });
    return true;
  }

  async archivePublication(slug: string, reason: string, at: string): Promise<boolean> {
    const record = this.publications.get(slug);
    if (!record) return false;
    this.publications.set(slug, { ...record, state: 'archived', takedownAt: at, takedownReason: reason });
    return true;
  }

  async listPublications(): Promise<PublicationRecord[]> {
    return Array.from(this.publications.values()).map((record) => ({ ...record }));
  }

  async setSubmissionSlug(issueNumber: number, slug: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, slug });
  }

  async setSubmissionTitle(issueNumber: number, title: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, title });
  }

  async setSubmissionDeliveredVersion(issueNumber: number, version: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, deliveredVersion: version, previewVersion: version });
  }

  async setSubmissionPreviewVersion(issueNumber: number, version: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, previewVersion: version });
  }

  async recordDeliveryNudge(issueNumber: number): Promise<number> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return 0;
    const deliveryNudges = (sub.deliveryNudges ?? 0) + 1;
    this.submissions.set(issueNumber, { ...sub, deliveryNudges });
    return deliveryNudges;
  }

  async getSubmissionBySlug(slug: string): Promise<SubmissionRecord | null> {
    // Newest first, matching the Firestore implementation. It used to take whatever
    // `find` reached first, which agreed with production only while a slug never had
    // more than one job — no longer true now that an improvement is a new job.
    const records = await this.listSubmissionsBySlug(slug);
    return records[0] ?? null;
  }

  async listSubmissionsBySlug(slug: string): Promise<SubmissionRecord[]> {
    return Array.from(this.submissions.values())
      .filter((s) => s.slug === slug)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((s) => ({ ...s }));
  }

  async getPublishedSubmissionBySlug(slug: string): Promise<SubmissionRecord | null> {
    const match = Array.from(this.submissions.values())
      .filter((s) => s.slug === slug && s.publishedAt && !s.abandonedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return match ? { ...match } : null;
  }

  async setSubmissionPublishedAt(issueNumber: number, at: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub && !sub.publishedAt) this.submissions.set(issueNumber, { ...sub, publishedAt: at });
  }

  async setSubmissionAbandoned(issueNumber: number, at: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, abandonedAt: at });
  }

  async setDraftShared(issueNumber: number, at: string | null): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return;
    const next = { ...sub };
    if (at) next.draftSharedAt = at;
    else delete next.draftSharedAt;
    this.submissions.set(issueNumber, next);
  }

  async setSubmissionLocale(issueNumber: number, locale: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, locale });
  }

  async setSubmissionClarificationCount(issueNumber: number, count: number): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, clarificationCount: count });
  }

  async setSubmissionBrief(
    issueNumber: number,
    brief: { spec: string; qa: string[]; specIsSystemGenerated?: boolean },
  ): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) {
      this.submissions.set(issueNumber, {
        ...sub,
        spec: brief.spec,
        qa: brief.qa,
        ...(brief.specIsSystemGenerated ? { specIsSystemGenerated: true } : {}),
      });
    }
  }

  async appendBuildEvent(
    issueNumber: number,
    event: Omit<BuildEvent, 'id' | 'createdAt'> & { createdAt?: string },
    options?: { preserveEnded?: boolean },
  ): Promise<BuildEvent> {
    const record: BuildEvent = { ...event, id: randomUUID(), createdAt: event.createdAt ?? new Date().toISOString() };
    const existing = this.buildEvents.get(issueNumber) ?? [];
    existing.push(record);
    this.buildEvents.set(issueNumber, existing);
    const submission = this.submissions.get(issueNumber);
    if (submission) {
      const next: SubmissionRecord = { ...submission, lastAgentSignalAt: record.createdAt };
      // A real chat row supersedes the ambient thought flash.
      delete next.lastAgentPresence;
      if (!options?.preserveEnded) {
        // Resumed work after MCP `end` — clear so stall is no longer `ended`.
        delete next.agentEndedAt;
        delete next.agentEndedBy;
      }
      this.submissions.set(issueNumber, next);
    }
    return { ...record };
  }

  async touchLastAgentSignalAt(
    issueNumber: number,
    at?: string,
    presence?: { key: string },
    options?: { preserveEnded?: boolean },
  ): Promise<void> {
    const submission = this.submissions.get(issueNumber);
    if (!submission) return;
    const stamped = at ?? new Date().toISOString();
    const next: SubmissionRecord = {
      ...submission,
      lastAgentSignalAt: stamped,
      ...(presence ? { lastAgentPresence: { key: presence.key, at: stamped } } : {}),
    };
    if (!options?.preserveEnded) {
      delete next.agentEndedAt;
      delete next.agentEndedBy;
    }
    this.submissions.set(issueNumber, next);
  }

  async markAgentEnded(issueNumber: number, at?: string, by: AgentEndedBy = 'end'): Promise<void> {
    const submission = this.submissions.get(issueNumber);
    if (!submission) return;
    this.submissions.set(issueNumber, {
      ...submission,
      agentEndedAt: at ?? new Date().toISOString(),
      agentEndedBy: by,
    });
  }

  async listBuildEvents(issueNumber: number, opts?: { limit?: number }): Promise<BuildEvent[]> {
    return [...(this.buildEvents.get(issueNumber) ?? [])]
      .sort(byNewestFirst)
      .slice(0, opts?.limit ?? 20)
      .map((event) => ({ ...event }));
  }

  async countBuildEvents(issueNumber: number): Promise<number> {
    return this.buildEvents.get(issueNumber)?.length ?? 0;
  }

  async appendBuildShot(
    issueNumber: number,
    shot: Omit<BuildShot, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildShot> {
    const record: BuildShot = { ...shot, id: randomUUID(), createdAt: shot.createdAt ?? new Date().toISOString() };
    const existing = this.buildShots.get(issueNumber) ?? [];
    existing.push(record);
    this.buildShots.set(issueNumber, existing);
    return { ...record };
  }

  async listBuildShots(issueNumber: number, opts?: { limit?: number }): Promise<BuildShotSummary[]> {
    return [...(this.buildShots.get(issueNumber) ?? [])]
      .sort(byNewestFirst)
      .slice(0, opts?.limit ?? 12)
      .map(({ data: _data, ...summary }) => ({ ...summary }));
  }

  async getBuildShot(issueNumber: number, id: string): Promise<BuildShot | null> {
    const found = this.buildShots.get(issueNumber)?.find((shot) => shot.id === id);
    return found ? { ...found } : null;
  }

  async countBuildShots(issueNumber: number): Promise<number> {
    return this.buildShots.get(issueNumber)?.length ?? 0;
  }

  async appendBuildPreview(
    issueNumber: number,
    preview: Omit<BuildPreview, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildPreview> {
    const existing = this.buildPreviews.get(issueNumber) ?? [];
    // ISO timestamps only have millisecond precision. Rapid back-to-back pushes in
    // tests (and occasionally in prod) land on the same tick; bump so "newest"
    // matches append order instead of UUID tie-breaks.
    const nowIso = new Date().toISOString();
    // The newest by value, not by position. `pruneBuildPreviews` writes the array back
    // sorted newest-first, so after the first prune the last element is the *oldest* — and
    // reading it here silently disabled this bump, letting two appends in the same
    // millisecond tie on `createdAt` and be ordered by a random UUID instead.
    const newestCreatedAt = existing.reduce<string | undefined>(
      (newest, entry) => (newest === undefined || entry.createdAt > newest ? entry.createdAt : newest),
      undefined,
    );
    const createdAt =
      preview.createdAt ??
      (newestCreatedAt && newestCreatedAt >= nowIso ? new Date(Date.parse(newestCreatedAt) + 1).toISOString() : nowIso);
    const record: BuildPreview = {
      ...preview,
      id: randomUUID(),
      createdAt,
    };
    existing.push(record);
    this.buildPreviews.set(issueNumber, existing);
    return { ...record };
  }

  async listBuildPreviews(issueNumber: number, opts?: { limit?: number }): Promise<BuildPreviewSummary[]> {
    return [...(this.buildPreviews.get(issueNumber) ?? [])]
      .sort(byNewestFirst)
      .slice(0, opts?.limit ?? 4)
      .map(({ data: _data, ...summary }) => ({ ...summary }));
  }

  async getBuildPreview(issueNumber: number, id: string): Promise<BuildPreview | null> {
    const found = this.buildPreviews.get(issueNumber)?.find((preview) => preview.id === id);
    return found ? { ...found } : null;
  }

  async countBuildPreviews(issueNumber: number): Promise<number> {
    return this.buildPreviews.get(issueNumber)?.length ?? 0;
  }

  async pruneBuildPreviews(issueNumber: number, keep: number): Promise<number> {
    const existing = this.buildPreviews.get(issueNumber) ?? [];
    if (existing.length <= keep) return 0;
    const kept = [...existing].sort(byNewestFirst).slice(0, keep);
    this.buildPreviews.set(issueNumber, kept);
    return existing.length - kept.length;
  }

  async appendCreatorMessage(
    issueNumber: number,
    text: string,
    opts?: { origin?: CreatorMessageOrigin; delivered?: boolean; textLocalized?: string; locale?: string },
  ): Promise<CreatorMessage> {
    const now = new Date().toISOString();
    const record: CreatorMessage = {
      id: randomUUID(),
      text,
      createdAt: now,
      deliveredAt: opts?.delivered ? now : null,
      ...(opts?.origin === 'agent' || isStudioOrigin(opts?.origin) ? { origin: opts?.origin } : {}),
      ...(opts?.textLocalized && opts?.locale ? { textLocalized: opts.textLocalized, locale: opts.locale } : {}),
    };
    const existing = this.creatorMessages.get(issueNumber) ?? [];
    existing.push(record);
    this.creatorMessages.set(issueNumber, existing);
    return { ...record };
  }

  async listPendingCreatorMessages(issueNumber: number, opts?: { limit?: number }): Promise<CreatorMessage[]> {
    return (this.creatorMessages.get(issueNumber) ?? [])
      .filter((message) => !message.deliveredAt && !isStudioOrigin(message.origin))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, opts?.limit ?? 10)
      .map((message) => ({ ...message }));
  }

  async listCreatorMessages(issueNumber: number, opts?: { limit?: number }): Promise<CreatorMessage[]> {
    // No id tie-break: the array is already in append order, and a stable sort on
    // createdAt alone preserves it for same-millisecond messages — a random-UUID
    // tie-break would shuffle exactly those.
    return [...(this.creatorMessages.get(issueNumber) ?? [])]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-(opts?.limit ?? 20))
      .map((message) => ({ ...message }));
  }

  async markCreatorMessagesDelivered(issueNumber: number, ids: string[]): Promise<void> {
    const existing = this.creatorMessages.get(issueNumber);
    if (!existing || ids.length === 0) return;
    const at = new Date().toISOString();
    const targets = new Set(ids);
    this.creatorMessages.set(
      issueNumber,
      existing.map((message) =>
        targets.has(message.id) && !message.deliveredAt ? { ...message, deliveredAt: at } : message,
      ),
    );
  }

  async appendTelemetryEvents(dateStr: string, events: TelemetryEvent[]): Promise<void> {
    const existing = this.telemetry.get(dateStr) ?? [];
    existing.push(...events.map((event) => ({ ...event })));
    this.telemetry.set(dateStr, existing);
  }

  async listTelemetryEvents(dateStr: string, opts?: { slug?: string; limit?: number }): Promise<TelemetryEvent[]> {
    return (this.telemetry.get(dateStr) ?? [])
      .filter((event) => opts?.slug === undefined || event.slug === opts.slug)
      .slice(0, opts?.limit ?? 1000)
      .map((event) => ({ ...event }));
  }

  async appendVisitEvents(dateStr: string, events: VisitEvent[]): Promise<void> {
    const existing = this.visits.get(dateStr) ?? [];
    existing.push(...events.map((event) => ({ ...event })));
    this.visits.set(dateStr, existing);
  }

  async listVisitEvents(
    dateStr: string,
    opts?: { visitId?: string; limit?: number; type?: VisitEvent['type']; excludeType?: VisitEvent['type'] },
  ): Promise<VisitEvent[]> {
    return (this.visits.get(dateStr) ?? [])
      .filter((event) => opts?.visitId === undefined || event.visitId === opts.visitId)
      .filter((event) => opts?.type === undefined || event.type === opts.type)
      .filter((event) => opts?.excludeType === undefined || event.type !== opts.excludeType)
      .slice(0, opts?.limit ?? 1000)
      .map((event) => ({ ...event }));
  }

  async getUsage(uid: string, dateStr: string): Promise<UsageCounters> {
    return { ...(this.usage.get(`${uid}:${dateStr}`) ?? emptyUsageCounters()) };
  }

  async listRecentlyPublished(limit: number): Promise<SubmissionRecord[]> {
    return Array.from(this.submissions.values())
      .filter((s) => s.publishedAt)
      .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
      .slice(0, limit)
      .map((s) => ({ ...s }));
  }

  async listActiveSubmissions(): Promise<SubmissionRecord[]> {
    return Array.from(this.submissions.values())
      .filter(isSweepActive)
      .map((s) => ({ ...s }));
  }

  async listSubmissionsMissingSlug(): Promise<SubmissionRecord[]> {
    return Array.from(this.submissions.values())
      .filter((s) => !s.slug && !s.abandonedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((s) => ({ ...s }));
  }

  async listSubmissionsWithDelivery(): Promise<SubmissionRecord[]> {
    return Array.from(this.submissions.values())
      .filter((s) => Boolean(s.slug && s.deliveredVersion) && !s.abandonedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((s) => ({ ...s }));
  }

  async listSubmissionsByOwner(ownerUid: string, opts?: { limit?: number }): Promise<SubmissionRecord[]> {
    const sorted = Array.from(this.submissions.values())
      .filter((s) => s.ownerUid === ownerUid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((s) => ({ ...s }));
    return opts?.limit !== undefined ? sorted.slice(0, opts.limit) : sorted;
  }

  async listQueuedSubmissions(): Promise<SubmissionRecord[]> {
    return Array.from(this.submissions.values())
      .filter((s) => s.state === 'queued')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((s) => ({ ...s }));
  }

  async claimDispatchReaperAttempt(issueNumber: number, at: string): Promise<boolean> {
    const sub = this.submissions.get(issueNumber);
    if (!sub || sub.state !== 'queued' || sub.dispatchReaperAttemptedAt || (sub.dispatch?.refs?.length ?? 0) > 0) {
      return false;
    }
    this.submissions.set(issueNumber, { ...sub, dispatchReaperAttemptedAt: at });
    return true;
  }

  async checkAndIncrementQuota(
    uid: string,
    dateStr: string,
    limit: number,
    action: keyof UsageCounters,
  ): Promise<{ allowed: boolean; current: number; tier: User['tier'] }> {
    const user = await this.getUser(uid);
    const tier = user?.tier ?? 'standard';

    if (tier === 'blocked') {
      return { allowed: false, current: Infinity, tier };
    }

    if (tier === 'trusted') {
      return { allowed: true, current: 0, tier };
    }

    const key = `${uid}:${dateStr}`;
    const currentCounters: UsageCounters = this.usage.get(key) ?? emptyUsageCounters();
    const currentVal = currentCounters[action] ?? 0;

    if (currentVal >= limit) {
      return { allowed: false, current: currentVal, tier };
    }

    const newCounters: UsageCounters = {
      ...currentCounters,
      [action]: currentVal + 1,
    };
    this.usage.set(key, newCounters);

    return { allowed: true, current: newCounters[action], tier };
  }

  async getCreationLimits(): Promise<CreationLimits | null> {
    return this.creationLimits ? { ...this.creationLimits } : null;
  }

  async setCreationLimits(
    patch: Partial<Omit<CreationLimits, 'updatedAt'>>,
    updatedBy: string,
  ): Promise<CreationLimits> {
    const merged: CreationLimits = {
      paused: patch.paused ?? this.creationLimits?.paused ?? false,
      globalDailySubmissionCap:
        patch.globalDailySubmissionCap !== undefined
          ? patch.globalDailySubmissionCap
          : (this.creationLimits?.globalDailySubmissionCap ?? null),
      editingPaused: patch.editingPaused ?? this.creationLimits?.editingPaused ?? false,
      remixTracePaused: patch.remixTracePaused ?? this.creationLimits?.remixTracePaused ?? false,
      globalDailyEditCap:
        patch.globalDailyEditCap !== undefined
          ? patch.globalDailyEditCap
          : (this.creationLimits?.globalDailyEditCap ?? null),
      chatPaused: patch.chatPaused ?? this.creationLimits?.chatPaused ?? false,
      globalDailyChatCap:
        patch.globalDailyChatCap !== undefined
          ? patch.globalDailyChatCap
          : (this.creationLimits?.globalDailyChatCap ?? null),
      tabCompletePaused: patch.tabCompletePaused ?? this.creationLimits?.tabCompletePaused ?? false,
      globalDailyTabCompleteTokenCap:
        patch.globalDailyTabCompleteTokenCap !== undefined
          ? patch.globalDailyTabCompleteTokenCap
          : (this.creationLimits?.globalDailyTabCompleteTokenCap ?? null),
      managedBuilderMode: patch.managedBuilderMode ?? this.creationLimits?.managedBuilderMode ?? 'auto',
      managedAgentVendorOverride:
        patch.managedAgentVendorOverride !== undefined
          ? patch.managedAgentVendorOverride
          : (this.creationLimits?.managedAgentVendorOverride ?? null),
      managedDailyCap:
        patch.managedDailyCap !== undefined ? patch.managedDailyCap : (this.creationLimits?.managedDailyCap ?? null),
      managedDailyUserCap:
        patch.managedDailyUserCap !== undefined
          ? patch.managedDailyUserCap
          : (this.creationLimits?.managedDailyUserCap ?? null),
      seedingMode: patch.seedingMode ?? this.creationLimits?.seedingMode ?? 'auto',
      seedProviderOverride:
        patch.seedProviderOverride !== undefined
          ? patch.seedProviderOverride
          : (this.creationLimits?.seedProviderOverride ?? null),
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    this.creationLimits = merged;
    return { ...merged };
  }

  async getPublicPlayConfig(): Promise<PublicPlayConfig | null> {
    return this.publicPlayConfig ? { ...this.publicPlayConfig, slugs: [...this.publicPlayConfig.slugs] } : null;
  }

  async setPublicPlaySlugs(slugs: string[], updatedBy: string): Promise<PublicPlayConfig> {
    const config: PublicPlayConfig = {
      slugs: [...slugs],
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    this.publicPlayConfig = config;
    return { ...config, slugs: [...config.slugs] };
  }

  async getFeaturedPoolConfig(): Promise<FeaturedPoolConfig | null> {
    return this.featuredPoolConfig ? { ...this.featuredPoolConfig, slugs: [...this.featuredPoolConfig.slugs] } : null;
  }

  async setFeaturedPoolSlugs(slugs: string[], updatedBy: string): Promise<FeaturedPoolConfig> {
    const config: FeaturedPoolConfig = {
      slugs: [...slugs],
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    this.featuredPoolConfig = config;
    return { ...config, slugs: [...config.slugs] };
  }

  async getGlobalSubmissionCount(dateStr: string): Promise<number> {
    return this.globalSubmissions.get(dateStr) ?? 0;
  }

  async getGlobalTabCompleteTokenCount(dateStr: string): Promise<number> {
    return this.globalTabCompleteTokens.get(dateStr) ?? 0;
  }

  async checkAndIncrementGlobalSubmissions(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const current = this.globalSubmissions.get(dateStr) ?? 0;
    if (current >= limit) {
      return { allowed: false, current };
    }
    this.globalSubmissions.set(dateStr, current + 1);
    return { allowed: true, current: current + 1 };
  }

  async checkAndIncrementGlobalEdits(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }> {
    const current = this.globalEdits.get(dateStr) ?? 0;
    if (current >= limit) {
      return { allowed: false, current };
    }
    this.globalEdits.set(dateStr, current + 1);
    return { allowed: true, current: current + 1 };
  }

  async checkAndIncrementGlobalChats(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }> {
    const current = this.globalChats.get(dateStr) ?? 0;
    if (current >= limit) {
      return { allowed: false, current };
    }
    this.globalChats.set(dateStr, current + 1);
    return { allowed: true, current: current + 1 };
  }

  async checkAndIncrementGlobalTabCompleteTokens(
    dateStr: string,
    tokens: number,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const current = this.globalTabCompleteTokens.get(dateStr) ?? 0;
    const next = current + tokens;
    // Refuse a reservation that would itself cross the cap.
    if (next > limit) {
      return { allowed: false, current };
    }
    this.globalTabCompleteTokens.set(dateStr, next);
    return { allowed: true, current: next };
  }

  async adjustGlobalTabCompleteTokens(dateStr: string, delta: number): Promise<number> {
    const current = this.globalTabCompleteTokens.get(dateStr) ?? 0;
    const next = Math.max(0, current + delta);
    this.globalTabCompleteTokens.set(dateStr, next);
    return next;
  }

  async getGlobalManagedBuildCount(dateStr: string): Promise<number> {
    return this.globalManagedBuilds.get(dateStr) ?? 0;
  }

  async checkAndIncrementGlobalManagedBuilds(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const current = this.globalManagedBuilds.get(dateStr) ?? 0;
    if (current >= limit) {
      return { allowed: false, current };
    }
    this.globalManagedBuilds.set(dateStr, current + 1);
    return { allowed: true, current: current + 1 };
  }

  async upsertWaitlistEntry(entry: {
    uid: string;
    email?: string;
    name?: string;
    locale?: string;
  }): Promise<WaitlistEntry> {
    const now = new Date().toISOString();
    const existing = this.waitlist.get(entry.uid);
    // Lowercase at write so equality queries (Firestore `where email ==`) and the
    // pre-approve path agree — mixed-case joins used to miss and mint a second row.
    const rawEmail = entry.email ?? existing?.email;

    const updated: WaitlistEntry = {
      uid: entry.uid,
      email: rawEmail !== undefined ? rawEmail.toLowerCase() : undefined,
      name: entry.name ?? existing?.name,
      requestedAt: now,
      locale: entry.locale ?? existing?.locale,
      status: existing?.status ?? 'pending',
    };

    this.waitlist.set(entry.uid, updated);
    return { ...updated };
  }

  async getWaitlistEntry(uid: string): Promise<WaitlistEntry | null> {
    const entry = this.waitlist.get(uid);
    return entry ? { ...entry } : null;
  }

  async isWaitlistApproved(uid: string, email?: string): Promise<boolean> {
    const byUid = this.waitlist.get(uid);
    if (byUid?.status === 'approved') return true;
    if (email) {
      const emailLower = email.toLowerCase();
      for (const entry of this.waitlist.values()) {
        if (entry.email?.toLowerCase() === emailLower && entry.status === 'approved') {
          return true;
        }
      }
    }
    return false;
  }

  async setWaitlistStatus(uid: string, status: WaitlistStatus): Promise<WaitlistEntry | null> {
    const existing = this.waitlist.get(uid);
    if (!existing) return null;
    const updated: WaitlistEntry = { ...existing, status };
    this.waitlist.set(uid, updated);
    return { ...updated };
  }

  async listWaitlistEntries(opts?: { status?: WaitlistStatus; limit?: number }): Promise<WaitlistEntry[]> {
    const limit = opts?.limit ?? 200;
    const rows = Array.from(this.waitlist.values()).filter(
      (entry) => opts?.status === undefined || entry.status === opts.status,
    );
    rows.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return rows.slice(0, limit).map((entry) => ({ ...entry }));
  }

  async countWaitlistEntries(status?: WaitlistStatus): Promise<number> {
    if (status === undefined) return this.waitlist.size;
    let count = 0;
    for (const entry of this.waitlist.values()) {
      if (entry.status === status) count += 1;
    }
    return count;
  }

  async setWaitlistStatusByEmail(email: string, status: WaitlistStatus): Promise<WaitlistEntry> {
    const emailLower = email.toLowerCase();
    for (const entry of this.waitlist.values()) {
      if (entry.email?.toLowerCase() === emailLower) {
        const updated: WaitlistEntry = { ...entry, status };
        this.waitlist.set(entry.uid, updated);
        return { ...updated };
      }
    }
    const now = new Date().toISOString();
    const created: WaitlistEntry = {
      uid: `email:${emailLower}`,
      email: emailLower,
      requestedAt: now,
      status,
    };
    this.waitlist.set(created.uid, created);
    return { ...created };
  }

  async recordBetaInviteAdmission(entry: {
    uid: string;
    email?: string;
    name?: string;
    locale?: string;
  }): Promise<WaitlistEntry> {
    const existing = this.waitlist.get(entry.uid);
    const rawEmail = entry.email ?? existing?.email;

    const updated: WaitlistEntry = {
      uid: entry.uid,
      email: rawEmail !== undefined ? rawEmail.toLowerCase() : undefined,
      name: entry.name ?? existing?.name,
      requestedAt: existing?.requestedAt ?? new Date().toISOString(),
      locale: entry.locale ?? existing?.locale,
      status: 'approved',
    };

    this.waitlist.set(entry.uid, updated);
    return { ...updated };
  }

  async createBetaInvite(createdByUid: string): Promise<CreatedBetaInvite> {
    const code = randomBytes(BETA_INVITE_CODE_BYTES).toString('base64url');
    const invite: BetaInvite = {
      id: randomUUID(),
      codeHash: hashBetaInviteCode(code),
      createdAt: new Date().toISOString(),
      createdByUid,
      status: 'available',
    };
    this.betaInvites.set(invite.id, invite);
    return { invite: { ...invite }, code };
  }

  async listBetaInvites(opts?: { limit?: number }): Promise<BetaInvite[]> {
    const limit = opts?.limit ?? 200;
    return [...this.betaInvites.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((invite) => ({ ...invite }));
  }

  async claimBetaInvite(code: string, uid: string): Promise<ClaimBetaInviteResult> {
    const codeHash = hashBetaInviteCode(code);
    const invite = [...this.betaInvites.values()].find((candidate) => candidate.codeHash === codeHash);
    if (!invite) return { ok: false, reason: 'not_found' };
    if (invite.status === 'revoked') return { ok: false, reason: 'revoked' };
    if (invite.status === 'claimed') {
      return invite.claimedUid === uid ? { ok: true, invite: { ...invite } } : { ok: false, reason: 'claimed' };
    }

    const claimed: BetaInvite = {
      ...invite,
      status: 'claimed',
      claimedAt: new Date().toISOString(),
      claimedUid: uid,
    };
    this.betaInvites.set(invite.id, claimed);
    return { ok: true, invite: { ...claimed } };
  }

  async revokeBetaInvite(id: string, revokedByUid: string): Promise<BetaInvite | null> {
    const invite = this.betaInvites.get(id);
    if (!invite || invite.status !== 'available') return null;
    const revoked: BetaInvite = {
      ...invite,
      status: 'revoked',
      revokedAt: new Date().toISOString(),
      revokedByUid,
    };
    this.betaInvites.set(id, revoked);
    return { ...revoked };
  }

  async createNotification(
    uid: string,
    notification: Omit<StoredNotification, 'readAt' | 'emailedAt'> & { createdAt?: string },
  ): Promise<{ created: boolean; notification: StoredNotification }> {
    const forUser = this.notifications.get(uid) ?? new Map<string, StoredNotification>();
    const existing = forUser.get(notification.id);
    if (existing) {
      return { created: false, notification: { ...existing } };
    }
    const record: StoredNotification = {
      id: notification.id,
      type: notification.type,
      createdAt: notification.createdAt ?? new Date().toISOString(),
      readAt: null,
      emailedAt: null,
      titleKey: notification.titleKey,
      bodyKey: notification.bodyKey,
      params: { ...notification.params },
      link: notification.link,
    };
    forUser.set(record.id, record);
    this.notifications.set(uid, forUser);
    return { created: true, notification: { ...record } };
  }

  async listNotifications(uid: string, opts?: { limit?: number }): Promise<StoredNotification[]> {
    const forUser = this.notifications.get(uid);
    if (!forUser) return [];
    const sorted = Array.from(forUser.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const limited = opts?.limit ? sorted.slice(0, opts.limit) : sorted;
    return limited.map((n) => ({ ...n }));
  }

  async markNotificationsRead(uid: string, ids: string[] | 'all'): Promise<void> {
    const forUser = this.notifications.get(uid);
    if (!forUser) return;
    const now = new Date().toISOString();
    const targets = ids === 'all' ? Array.from(forUser.keys()) : ids;
    for (const id of targets) {
      const n = forUser.get(id);
      if (n && n.readAt === null) forUser.set(id, { ...n, readAt: now });
    }
  }

  async deleteNotifications(uid: string, ids: string[] | 'all'): Promise<void> {
    const forUser = this.notifications.get(uid);
    if (!forUser) return;
    if (ids === 'all') {
      forUser.clear();
      return;
    }
    for (const id of ids) forUser.delete(id);
  }

  async markNotificationEmailed(uid: string, id: string, at?: string): Promise<void> {
    const forUser = this.notifications.get(uid);
    const n = forUser?.get(id);
    if (n) forUser!.set(id, { ...n, emailedAt: at ?? new Date().toISOString() });
  }

  async savePushSubscription(uid: string, subscription: Omit<PushSubscriptionRecord, 'createdAt'>): Promise<void> {
    const forUser = this.pushSubs.get(uid) ?? new Map<string, PushSubscriptionRecord>();
    forUser.set(pushSubscriptionId(subscription.endpoint), {
      endpoint: subscription.endpoint,
      keys: { ...subscription.keys },
      createdAt: new Date().toISOString(),
    });
    this.pushSubs.set(uid, forUser);
  }

  async listPushSubscriptions(uid: string): Promise<PushSubscriptionRecord[]> {
    const forUser = this.pushSubs.get(uid);
    return forUser ? Array.from(forUser.values()).map((s) => ({ ...s, keys: { ...s.keys } })) : [];
  }

  async deletePushSubscription(uid: string, endpoint: string): Promise<void> {
    this.pushSubs.get(uid)?.delete(pushSubscriptionId(endpoint));
  }

  private voteCounts(slug: string): GameVoteCounts {
    const counts: GameVoteCounts = { up: 0, down: 0 };
    for (const value of this.votes.get(slug)?.values() ?? []) counts[value] += 1;
    return counts;
  }

  async getVote(slug: string, uid: string): Promise<VoteValue | null> {
    return this.votes.get(slug)?.get(uid) ?? null;
  }

  async castVote(slug: string, uid: string, value: VoteValue): Promise<GameVoteCounts> {
    const forGame = this.votes.get(slug) ?? new Map<string, VoteValue>();
    forGame.set(uid, value);
    this.votes.set(slug, forGame);
    return this.voteCounts(slug);
  }

  async clearVote(slug: string, uid: string): Promise<GameVoteCounts> {
    this.votes.get(slug)?.delete(uid);
    return this.voteCounts(slug);
  }

  async getVoteCounts(slug: string): Promise<GameVoteCounts> {
    return this.voteCounts(slug);
  }

  async setGameFollow(slug: string, uid: string, at: string): Promise<number> {
    const forGame = this.follows.get(slug) ?? new Map<string, string>();
    if (!forGame.has(uid)) forGame.set(uid, at);
    this.follows.set(slug, forGame);
    return forGame.size;
  }

  async clearGameFollow(slug: string, uid: string): Promise<number> {
    const forGame = this.follows.get(slug);
    forGame?.delete(uid);
    return forGame?.size ?? 0;
  }

  async isFollowingGame(slug: string, uid: string): Promise<boolean> {
    return this.follows.get(slug)?.has(uid) ?? false;
  }

  async countGameFollowers(slug: string): Promise<number> {
    return this.follows.get(slug)?.size ?? 0;
  }

  async listGameFollowers(slug: string, opts?: { limit?: number }): Promise<string[]> {
    const forGame = this.follows.get(slug);
    if (!forGame) return [];
    const sorted = Array.from(forGame.entries())
      .sort((a, b) => b[1].localeCompare(a[1]))
      .map(([uid]) => uid);
    return opts?.limit ? sorted.slice(0, opts.limit) : sorted;
  }

  async getGameSave(uid: string, slug: string): Promise<GameSaveRecord | null> {
    const found = this.gameSaves.get(uid)?.get(slug);
    return found ? { ...found } : null;
  }

  async putGameSave(uid: string, slug: string, data: string, version: number): Promise<GameSaveRecord> {
    const record: GameSaveRecord = { slug, data, version, updatedAt: new Date().toISOString() };
    const forUser = this.gameSaves.get(uid) ?? new Map<string, GameSaveRecord>();
    forUser.set(slug, record);
    this.gameSaves.set(uid, forUser);
    return { ...record };
  }

  async deleteGameSave(uid: string, slug: string): Promise<void> {
    this.gameSaves.get(uid)?.delete(slug);
  }

  async listGameSaves(uid: string): Promise<GameSaveRecord[]> {
    return [...(this.gameSaves.get(uid)?.values() ?? [])].map((record) => ({ ...record }));
  }

  async deleteGameSaves(uid: string): Promise<number> {
    const count = this.gameSaves.get(uid)?.size ?? 0;
    this.gameSaves.delete(uid);
    return count;
  }

  async getEditorDraft(uid: string, slug: string): Promise<EditorDraftRecord | null> {
    const found = this.editorDrafts.get(uid)?.get(slug);
    return found ? { ...found } : null;
  }

  async putEditorDraft(
    uid: string,
    slug: string,
    content: string,
    expectedRevision?: number,
  ): Promise<{ conflict: false; record: EditorDraftRecord } | { conflict: true; revision: number }> {
    const forUser = this.editorDrafts.get(uid) ?? new Map<string, EditorDraftRecord>();
    const current = forUser.get(slug)?.revision ?? 0;
    if (expectedRevision !== undefined && current !== expectedRevision) {
      return { conflict: true, revision: current };
    }
    const record: EditorDraftRecord = {
      slug,
      content,
      revision: current + 1,
      updatedAt: new Date().toISOString(),
    };
    forUser.set(slug, record);
    this.editorDrafts.set(uid, forUser);
    return { conflict: false, record: { ...record } };
  }

  async deleteEditorDraft(uid: string, slug: string): Promise<void> {
    this.editorDrafts.get(uid)?.delete(slug);
  }

  async listEditorDrafts(uid: string): Promise<EditorDraftRecord[]> {
    return [...(this.editorDrafts.get(uid)?.values() ?? [])].map((record) => ({ ...record }));
  }

  async deleteEditorDrafts(uid: string): Promise<number> {
    const count = this.editorDrafts.get(uid)?.size ?? 0;
    this.editorDrafts.delete(uid);
    return count;
  }

  async recordPlayAffinity(uid: string, slug: string, at?: string): Promise<PlayAffinityRecord> {
    const when = at ?? new Date().toISOString();
    const forUser = this.playAffinity.get(uid) ?? new Map<string, PlayAffinityRecord>();
    const existing = forUser.get(slug);
    const record: PlayAffinityRecord = {
      slug,
      openCount: Math.min(MAX_PLAY_AFFINITY_OPENS, (existing?.openCount ?? 0) + 1),
      lastPlayedAt: when,
    };
    forUser.set(slug, record);
    if (forUser.size > MAX_PLAY_AFFINITY_GAMES) {
      const oldest = [...forUser.values()]
        .filter((entry) => entry.slug !== slug)
        .sort((a, b) => a.lastPlayedAt.localeCompare(b.lastPlayedAt) || a.slug.localeCompare(b.slug));
      const overflow = forUser.size - MAX_PLAY_AFFINITY_GAMES;
      for (const entry of oldest.slice(0, overflow)) forUser.delete(entry.slug);
    }
    this.playAffinity.set(uid, forUser);
    return { ...record };
  }

  async listPlayAffinity(uid: string): Promise<PlayAffinityRecord[]> {
    return [...(this.playAffinity.get(uid)?.values() ?? [])]
      .map((record) => ({ ...record }))
      .sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt) || a.slug.localeCompare(b.slug));
  }

  async deletePlayAffinity(uid: string): Promise<number> {
    const count = this.playAffinity.get(uid)?.size ?? 0;
    this.playAffinity.delete(uid);
    return count;
  }

  async listWorldEntries(worldId: string): Promise<WorldEntryRecord[]> {
    return [...(this.worldEntries.get(worldId)?.values() ?? [])].map((entry) => ({ ...entry }));
  }

  async getWorldEntry(worldId: string, key: string): Promise<WorldEntryRecord | null> {
    const found = this.worldEntries.get(worldId)?.get(key);
    return found ? { ...found } : null;
  }

  async putWorldEntry(options: {
    worldId: string;
    key: string;
    uid: string;
    fields: Record<string, string | number | boolean>;
    maxPerPlayer: number;
    maxEntries: number;
  }): Promise<{ ok: true; entry: WorldEntryRecord } | { ok: false; reason: 'conflict' | 'quota' | 'full' }> {
    const world = this.worldEntries.get(options.worldId) ?? new Map<string, WorldEntryRecord>();
    const existing = world.get(options.key);
    if (existing && existing.ownerUid !== options.uid) return { ok: false, reason: 'conflict' };
    if (!existing) {
      if (world.size >= options.maxEntries) return { ok: false, reason: 'full' };
      let owned = 0;
      for (const entry of world.values()) if (entry.ownerUid === options.uid) owned += 1;
      if (owned >= options.maxPerPlayer) return { ok: false, reason: 'quota' };
    }
    const now = new Date().toISOString();
    const entry: WorldEntryRecord = {
      key: options.key,
      fields: options.fields,
      ownerUid: options.uid,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    world.set(options.key, entry);
    this.worldEntries.set(options.worldId, world);
    return { ok: true, entry: { ...entry } };
  }

  async deleteWorldEntry(worldId: string, key: string, uid: string): Promise<boolean> {
    const world = this.worldEntries.get(worldId);
    const existing = world?.get(key);
    if (!existing || existing.ownerUid !== uid) return false;
    world!.delete(key);
    return true;
  }

  async countWorldEntries(worldId: string, uid: string): Promise<number> {
    let owned = 0;
    for (const entry of this.worldEntries.get(worldId)?.values() ?? []) {
      if (entry.ownerUid === uid) owned += 1;
    }
    return owned;
  }

  async listWorldsForUser(uid: string): Promise<string[]> {
    const touched: string[] = [];
    for (const [worldId, world] of this.worldEntries) {
      if ([...world.values()].some((entry) => entry.ownerUid === uid)) touched.push(worldId);
    }
    return touched.sort();
  }

  async deleteWorldEntriesForUser(uid: string): Promise<number> {
    let removed = 0;
    for (const world of this.worldEntries.values()) {
      for (const entry of [...world.values()]) {
        if (entry.ownerUid !== uid) continue;
        world.delete(entry.key);
        removed += 1;
      }
    }
    return removed;
  }

  async addPlayerFeedback(slug: string, uid: string, text: string): Promise<PlayerFeedbackRecord> {
    const record: PlayerFeedbackRecord = { id: randomUUID(), uid, text, createdAt: new Date().toISOString() };
    const forGame = this.playerFeedback.get(slug) ?? [];
    forGame.push(record);
    this.playerFeedback.set(slug, forGame);
    return record;
  }

  async listPlayerFeedback(slug: string, opts?: { limit?: number }): Promise<PlayerFeedbackRecord[]> {
    const newestFirst = [...(this.playerFeedback.get(slug) ?? [])].reverse();
    return opts?.limit === undefined ? newestFirst : newestFirst.slice(0, opts.limit);
  }

  async countPlayerFeedback(slug: string): Promise<number> {
    return this.playerFeedback.get(slug)?.length ?? 0;
  }

  async upsertGameAssessment(
    input: Omit<GameAssessment, 'id' | 'createdAt' | 'updatedAt' | 'gameVersion' | 'resolution'> & {
      createdAt?: string;
      gameVersion?: string | null;
    },
  ): Promise<GameAssessment> {
    const id = gameAssessmentId(input.slug, input.reviewerUid);
    const existing = this.gameAssessments.get(id);
    const now = new Date().toISOString();
    if (existing) {
      const history = this.gameAssessmentHistory.get(id) ?? [];
      history.push({ ...existing, supersededAt: now });
      this.gameAssessmentHistory.set(id, history);
    }
    const record: GameAssessment = {
      id,
      slug: input.slug,
      title: input.title,
      source: input.source,
      creatorHandle: input.creatorHandle,
      reviewerUid: input.reviewerUid,
      verdict: input.verdict,
      note: input.note,
      noteOrigin: input.noteOrigin,
      checklist: input.checklist ?? null,
      clientContext: input.clientContext ?? null,
      gameVersion: input.gameVersion ?? null,
      // Fresh judgment: prior follow-up stays on the archived row.
      resolution: null,
      createdAt: existing?.createdAt ?? input.createdAt ?? now,
      updatedAt: now,
    };
    this.gameAssessments.set(id, record);
    return { ...record };
  }

  async setGameAssessmentResolution(
    slug: string,
    reviewerUid: string,
    resolution: AssessmentResolution | null,
    expectedUpdatedAt?: string,
  ): Promise<ResolutionWriteResult> {
    const id = gameAssessmentId(slug, reviewerUid);
    const existing = this.gameAssessments.get(id);
    if (!existing) return { status: 'not_found' };
    if (expectedUpdatedAt !== undefined && existing.updatedAt !== expectedUpdatedAt) {
      return { status: 'stale', assessment: hydrateGameAssessment(id, existing) };
    }
    const record: GameAssessment = { ...existing, resolution: resolution ? { ...resolution } : null };
    this.gameAssessments.set(id, record);
    return { status: 'ok', assessment: hydrateGameAssessment(id, record) };
  }

  async listGameAssessmentsBySlug(slug: string): Promise<GameAssessment[]> {
    return Array.from(this.gameAssessments.values())
      .filter((row) => row.slug === slug)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.reviewerUid.localeCompare(b.reviewerUid))
      .map((row) => hydrateGameAssessment(row.id, row));
  }

  async listGameAssessmentHistory(slug: string, reviewerUid: string): Promise<GameAssessmentHistoryEntry[]> {
    const id = gameAssessmentId(slug, reviewerUid);
    return [...(this.gameAssessmentHistory.get(id) ?? [])]
      .sort((a, b) => b.supersededAt.localeCompare(a.supersededAt))
      .map((row) => ({ ...row }));
  }

  async upsertReReviewRequests(
    requests: Array<Pick<ReReviewRequest, 'slug' | 'reviewerUid' | 'gameVersion' | 'reason' | 'createdBy'>>,
  ): Promise<ReReviewRequest[]> {
    const now = new Date().toISOString();
    const out: ReReviewRequest[] = [];
    for (const req of requests) {
      const id = reReviewRequestId(req.slug, req.reviewerUid);
      const record: ReReviewRequest = {
        id,
        slug: req.slug,
        reviewerUid: req.reviewerUid,
        status: 'open',
        gameVersion: req.gameVersion,
        reason: req.reason,
        createdAt: now,
        createdBy: req.createdBy,
        resolvedAt: null,
      };
      this.reReviewRequests.set(id, record);
      out.push({ ...record });
    }
    return out;
  }

  async getReReviewRequest(slug: string, reviewerUid: string): Promise<ReReviewRequest | null> {
    const record = this.reReviewRequests.get(reReviewRequestId(slug, reviewerUid));
    return record ? { ...record } : null;
  }

  async listOpenReReviewRequestsForReviewer(reviewerUid: string): Promise<ReReviewRequest[]> {
    return Array.from(this.reReviewRequests.values())
      .filter((row) => row.reviewerUid === reviewerUid && row.status === 'open')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((row) => ({ ...row }));
  }

  async listReReviewRequests(opts?: { limit?: number }): Promise<ReReviewRequest[]> {
    const sorted = Array.from(this.reReviewRequests.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((row) => ({ ...row }));
    return opts?.limit !== undefined ? sorted.slice(0, opts.limit) : sorted;
  }

  async resolveReReviewRequest(slug: string, reviewerUid: string): Promise<ReReviewRequest | null> {
    const id = reReviewRequestId(slug, reviewerUid);
    const existing = this.reReviewRequests.get(id);
    if (!existing) return null;
    if (existing.status !== 'open') return { ...existing };
    const updated: ReReviewRequest = { ...existing, status: 'resolved', resolvedAt: new Date().toISOString() };
    this.reReviewRequests.set(id, updated);
    return { ...updated };
  }

  async getGameAssessment(slug: string, reviewerUid: string): Promise<GameAssessment | null> {
    const record = this.gameAssessments.get(gameAssessmentId(slug, reviewerUid));
    return record ? hydrateGameAssessment(record.id, record) : null;
  }

  async listGameAssessmentsByReviewer(reviewerUid: string): Promise<GameAssessment[]> {
    return Array.from(this.gameAssessments.values())
      .filter((row) => row.reviewerUid === reviewerUid)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.slug.localeCompare(b.slug))
      .map((row) => hydrateGameAssessment(row.id, row));
  }

  async listGameAssessments(opts?: { limit?: number }): Promise<GameAssessment[]> {
    const sorted = Array.from(this.gameAssessments.values())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.slug.localeCompare(b.slug))
      .map((row) => hydrateGameAssessment(row.id, row));
    return opts?.limit !== undefined ? sorted.slice(0, opts.limit) : sorted;
  }

  async listGameAssessmentsBySource(source: AssessmentSource): Promise<GameAssessment[]> {
    return Array.from(this.gameAssessments.values())
      .filter((row) => row.source === source)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.slug.localeCompare(b.slug))
      .map((row) => hydrateGameAssessment(row.id, row));
  }

  async countGameAssessmentsByUid(uid: string): Promise<number> {
    let total = 0;
    for (const row of this.gameAssessments.values()) {
      if (row.reviewerUid === uid) total += 1;
    }
    return total;
  }

  async deleteGameAssessmentsByUid(uid: string): Promise<number> {
    let deleted = 0;
    for (const [id, row] of this.gameAssessments) {
      if (row.reviewerUid === uid) {
        this.gameAssessments.delete(id);
        this.gameAssessmentHistory.delete(id);
        deleted += 1;
      }
    }
    for (const [id, row] of this.reReviewRequests) {
      if (row.reviewerUid === uid) this.reReviewRequests.delete(id);
    }
    return deleted;
  }

  async getOpenReviewSweep(): Promise<ReviewSweep | null> {
    const open = Array.from(this.reviewSweeps.values()).filter(
      (row) => row.status === 'active' || row.status === 'paused',
    );
    open.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return open[0] ? { ...open[0], slugs: [...open[0].slugs] } : null;
  }

  async getReviewSweep(id: string): Promise<ReviewSweep | null> {
    const row = this.reviewSweeps.get(id);
    return row ? { ...row, slugs: [...row.slugs] } : null;
  }

  async listReviewSweeps(opts?: { limit?: number }): Promise<ReviewSweep[]> {
    const limit = opts?.limit ?? 20;
    return Array.from(this.reviewSweeps.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((row) => ({ ...row, slugs: [...row.slugs] }));
  }

  async createReviewSweep(sweep: ReviewSweep): Promise<ReviewSweep> {
    for (const [id, row] of this.reviewSweeps) {
      if (row.status === 'active' || row.status === 'paused') {
        this.reviewSweeps.set(id, {
          ...row,
          status: 'cancelled',
          updatedAt: sweep.createdAt,
          updatedBy: sweep.createdBy,
        });
      }
    }
    const record: ReviewSweep = { ...sweep, slugs: [...sweep.slugs] };
    this.reviewSweeps.set(record.id, record);
    return { ...record, slugs: [...record.slugs] };
  }

  async updateReviewSweep(
    id: string,
    patch: Partial<Omit<ReviewSweep, 'id' | 'createdAt' | 'createdBy' | 'slugs' | 'source'>>,
  ): Promise<ReviewSweep | null> {
    const existing = this.reviewSweeps.get(id);
    if (!existing) return null;
    const record: ReviewSweep = { ...existing, ...patch, id: existing.id, slugs: [...existing.slugs] };
    this.reviewSweeps.set(id, record);
    return { ...record, slugs: [...record.slugs] };
  }

  async putScorecard(slug: string, scorecard: Scorecard): Promise<void> {
    this.scorecards.set(slug, structuredClone(scorecard));
  }

  async getScorecard(slug: string): Promise<Scorecard | null> {
    const found = this.scorecards.get(slug);
    return found ? structuredClone(found) : null;
  }

  async listScorecards(opts?: { limit?: number }): Promise<Scorecard[]> {
    return [...this.scorecards.values()]
      .map((card) => structuredClone(card))
      .sort(compareScorecards)
      .slice(0, opts?.limit ?? 200);
  }

  async getGameAutonomy(slug: string): Promise<string | null> {
    return this.gameAutonomy.get(slug) ?? null;
  }

  async purgeLegacyGameSuggestions(limit: number): Promise<number> {
    const doomed = [...this.legacyGameSuggestions].slice(0, limit);
    for (const slug of doomed) this.legacyGameSuggestions.delete(slug);
    return doomed.length;
  }

  /**
   * Seeds a legacy per-game suggestion doc.
   *
   * Deliberately **not** on the `Store` interface: nothing in the product writes these
   * any more, and adding a writer for something only the purge should touch would invite
   * one. It exists so a test can prove the purge removes what production will find.
   */
  seedLegacyGameSuggestion(slug: string): void {
    this.legacyGameSuggestions.add(slug);
  }

  async setGameAutonomy(slug: string, mode: string): Promise<void> {
    this.gameAutonomy.set(slug, mode);
  }

  async putSuggestion(record: SuggestionRecord): Promise<void> {
    this.suggestions.set(record.id, structuredClone(record));
  }

  async getSuggestion(id: string): Promise<SuggestionRecord | null> {
    const found = this.suggestions.get(id);
    return found ? structuredClone(found) : null;
  }

  async listSuggestions(opts?: {
    status?: SuggestionStatus[];
    ownerUid?: string;
    limit?: number;
  }): Promise<SuggestionRecord[]> {
    const wanted = opts?.status ? new Set(opts.status) : null;
    return (
      [...this.suggestions.values()]
        .filter((record) => (wanted ? wanted.has(record.status) : true))
        .filter((record) => (opts?.ownerUid ? record.ownerUid === opts.ownerUid : true))
        .map((record) => structuredClone(record))
        .sort(compareSuggestions)
        // No limit means every match, matching Firestore's paged read. Defaulting to a
        // number here would make the in-memory store agree with production only while the
        // collection stayed small — the divergence that hides until it matters.
        .slice(0, opts?.limit ?? Number.MAX_SAFE_INTEGER)
    );
  }

  async putProposal(record: ProposalRecord): Promise<void> {
    this.proposals.set(record.id, structuredClone(record));
  }

  async getProposal(id: string): Promise<ProposalRecord | null> {
    const found = this.proposals.get(id);
    return found ? structuredClone(found) : null;
  }

  async listProposals(opts?: {
    proposerUid?: string;
    targetOwnerUid?: string | null;
    targetSlug?: string;
    state?: ProposalState[];
    limit?: number;
  }): Promise<ProposalRecord[]> {
    const wanted = opts?.state ? new Set(opts.state) : null;
    // `'targetOwnerUid' in opts` rather than a truthiness test: `null` is a real filter
    // value here (the platform queue), and `?? undefined` would silently widen it to
    // "every proposal on the platform" — the one bug this filter must not have.
    const filterByOwner = opts !== undefined && 'targetOwnerUid' in opts;
    return [...this.proposals.values()]
      .filter((record) => (opts?.proposerUid ? record.proposerUid === opts.proposerUid : true))
      .filter((record) => (filterByOwner ? record.targetOwnerUid === opts.targetOwnerUid : true))
      .filter((record) => (opts?.targetSlug ? record.targetSlug === opts.targetSlug : true))
      .filter((record) => (wanted ? wanted.has(record.state) : true))
      .map((record) => structuredClone(record))
      .sort(compareProposals)
      .slice(0, opts?.limit ?? Number.MAX_SAFE_INTEGER);
  }

  async getContributionSettings(slug: string): Promise<GameContributionSettings | null> {
    const found = this.contributionSettings.get(slug);
    return found ? { ...found } : null;
  }

  async putContributionSettings(record: GameContributionSettings): Promise<void> {
    this.contributionSettings.set(record.slug, { ...record });
  }

  async isContributorBlocked(ownerUid: string, blockedUid: string): Promise<boolean> {
    return this.contributorBlocks.get(ownerUid)?.has(blockedUid) ?? false;
  }

  async blockContributor(record: ContributorBlockRecord): Promise<void> {
    const forOwner = this.contributorBlocks.get(record.ownerUid) ?? new Map<string, ContributorBlockRecord>();
    forOwner.set(record.blockedUid, { ...record });
    this.contributorBlocks.set(record.ownerUid, forOwner);
  }

  async unblockContributor(ownerUid: string, blockedUid: string): Promise<void> {
    this.contributorBlocks.get(ownerUid)?.delete(blockedUid);
  }

  async listContributorBlocks(ownerUid: string): Promise<ContributorBlockRecord[]> {
    return [...(this.contributorBlocks.get(ownerUid)?.values() ?? [])]
      .map((record) => ({ ...record }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.blockedUid.localeCompare(b.blockedUid));
  }

  async listGameSlugs(): Promise<string[]> {
    // Union of every slug this store knows anything about, mirroring Firestore's
    // `listDocuments()`, which also returns a game whose document never existed but
    // whose subcollections do.
    return [
      ...new Set([
        ...this.votes.keys(),
        ...this.follows.keys(),
        ...this.playerFeedback.keys(),
        ...this.scorecards.keys(),
        ...this.suggestions.keys(),
      ]),
    ].sort();
  }

  async deletePlayerFeedbackByUid(uid: string): Promise<number> {
    let deleted = 0;
    for (const [slug, rows] of this.playerFeedback) {
      const kept = rows.filter((row) => row.uid !== uid);
      deleted += rows.length - kept.length;
      this.playerFeedback.set(slug, kept);
    }
    return deleted;
  }

  async countPlayerFeedbackByUid(uid: string): Promise<number> {
    let total = 0;
    for (const rows of this.playerFeedback.values()) {
      total += rows.filter((row) => row.uid === uid).length;
    }
    return total;
  }

  async createAccessToken(record: AccessTokenRecord): Promise<void> {
    this.accessTokens.set(record.tokenId, { ...record });
  }

  async getAccessToken(tokenId: string): Promise<AccessTokenRecord | null> {
    const record = this.accessTokens.get(tokenId);
    return record ? { ...record } : null;
  }

  async listAccessTokens(uid: string): Promise<AccessTokenRecord[]> {
    return Array.from(this.accessTokens.values())
      .filter((record) => record.uid === uid)
      .map((record) => ({ ...record }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteAccessToken(tokenId: string): Promise<boolean> {
    return this.accessTokens.delete(tokenId);
  }

  async touchAccessToken(tokenId: string, at: string): Promise<void> {
    const record = this.accessTokens.get(tokenId);
    if (record) this.accessTokens.set(tokenId, { ...record, lastUsedAt: at });
  }

  async getGameAgentKey(slug: string): Promise<GameAgentKeyRecord | null> {
    const record = this.gameAgentKeys.get(slug);
    return record ? { ...record } : null;
  }

  async ensureGameAgentKey(slug: string, ownerUid: string, at: string): Promise<GameAgentKeyRecord | null> {
    const existing = this.gameAgentKeys.get(slug);
    if (existing) {
      if (existing.ownerUid !== ownerUid) return null;
      return { ...existing };
    }
    const created: GameAgentKeyRecord = {
      slug,
      ownerUid,
      keyGeneration: 1,
      createdAt: at,
      updatedAt: at,
    };
    this.gameAgentKeys.set(slug, created);
    return { ...created };
  }

  async rotateGameAgentKey(slug: string, ownerUid: string, at: string): Promise<GameAgentKeyRecord | null> {
    const existing = this.gameAgentKeys.get(slug);
    if (!existing || existing.ownerUid !== ownerUid) return null;
    const next: GameAgentKeyRecord = {
      ...existing,
      keyGeneration: existing.keyGeneration + 1,
      updatedAt: at,
    };
    this.gameAgentKeys.set(slug, next);
    return { ...next };
  }

  async beginAgentOpenRound(slug: string, at: string): Promise<boolean> {
    const existing = this.gameAgentKeys.get(slug);
    if (!existing || existing.agentOpenRoundPending) return false;
    this.gameAgentKeys.set(slug, { ...existing, agentOpenRoundPending: true, updatedAt: at });
    return true;
  }

  async finishAgentOpenRound(slug: string, at: string): Promise<void> {
    const existing = this.gameAgentKeys.get(slug);
    if (!existing?.agentOpenRoundPending) return;
    const next: GameAgentKeyRecord = { ...existing, updatedAt: at };
    delete next.agentOpenRoundPending;
    this.gameAgentKeys.set(slug, next);
  }

  async getCreatorAgentKey(ownerUid: string): Promise<CreatorAgentKeyRecord | null> {
    const record = this.creatorAgentKeys.get(ownerUid);
    return record ? { ...record } : null;
  }

  async ensureCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord> {
    const existing = this.creatorAgentKeys.get(ownerUid);
    if (existing) return { ...existing };
    const created: CreatorAgentKeyRecord = {
      ownerUid,
      keyGeneration: 1,
      createdAt: at,
      updatedAt: at,
    };
    this.creatorAgentKeys.set(ownerUid, created);
    return { ...created };
  }

  async reactivateCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord> {
    const existing = this.creatorAgentKeys.get(ownerUid);
    if (!existing) {
      return this.ensureCreatorAgentKey(ownerUid, at);
    }
    if (!existing.revokedAt) return { ...existing };
    const cleared: CreatorAgentKeyRecord = {
      ownerUid: existing.ownerUid,
      keyGeneration: existing.keyGeneration,
      createdAt: existing.createdAt,
      updatedAt: at,
    };
    this.creatorAgentKeys.set(ownerUid, cleared);
    return { ...cleared };
  }

  async rotateCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null> {
    const existing = this.creatorAgentKeys.get(ownerUid);
    if (!existing) return null;
    const next: CreatorAgentKeyRecord = {
      ownerUid: existing.ownerUid,
      keyGeneration: existing.keyGeneration + 1,
      createdAt: existing.createdAt,
      updatedAt: at,
    };
    this.creatorAgentKeys.set(ownerUid, next);
    return { ...next };
  }

  async touchCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null> {
    const existing = this.creatorAgentKeys.get(ownerUid);
    if (!existing || existing.revokedAt) return null;
    const next: CreatorAgentKeyRecord = { ...existing, updatedAt: at };
    this.creatorAgentKeys.set(ownerUid, next);
    return { ...next };
  }

  async revokeCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null> {
    const existing = this.creatorAgentKeys.get(ownerUid);
    if (!existing) return null;
    const next: CreatorAgentKeyRecord = {
      ownerUid: existing.ownerUid,
      keyGeneration: existing.keyGeneration + 1,
      createdAt: existing.createdAt,
      updatedAt: at,
      revokedAt: at,
    };
    this.creatorAgentKeys.set(ownerUid, next);
    return { ...next };
  }

  async createOAuthClient(record: OAuthClientRecord): Promise<void> {
    this.oauthClients.set(record.clientId, { ...record });
  }

  async getOAuthClient(clientId: string): Promise<OAuthClientRecord | null> {
    const record = this.oauthClients.get(clientId);
    return record ? { ...record } : null;
  }

  async createOAuthGrant(record: OAuthGrantRecord): Promise<void> {
    this.oauthGrants.set(record.grantId, { ...record });
    if (record.currentRefreshTokenId) {
      this.oauthRefreshTokenIndex.set(record.currentRefreshTokenId, record.grantId);
    }
  }

  async getOAuthGrant(grantId: string): Promise<OAuthGrantRecord | null> {
    const record = this.oauthGrants.get(grantId);
    return record ? { ...record } : null;
  }

  async getOAuthGrantByRefreshTokenId(refreshTokenId: string): Promise<OAuthGrantRecord | null> {
    const grantId = this.oauthRefreshTokenIndex.get(refreshTokenId);
    if (!grantId) return null;
    return this.getOAuthGrant(grantId);
  }

  async listOAuthGrantsByOwner(ownerUid: string): Promise<OAuthGrantRecord[]> {
    return Array.from(this.oauthGrants.values())
      .filter((grant) => grant.ownerUid === ownerUid && !grant.revokedAt)
      .map((grant) => ({ ...grant }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async revokeOAuthGrant(grantId: string, ownerUid: string): Promise<boolean> {
    const grant = this.oauthGrants.get(grantId);
    if (!grant || grant.ownerUid !== ownerUid) return false;
    const at = new Date().toISOString();
    this.oauthGrants.set(grantId, { ...grant, revokedAt: at });
    return true;
  }

  async createOAuthAccessToken(record: OAuthAccessTokenRecord): Promise<void> {
    this.oauthAccessTokens.set(record.tokenId, { ...record });
  }

  async getOAuthAccessToken(tokenId: string): Promise<OAuthAccessTokenRecord | null> {
    const record = this.oauthAccessTokens.get(tokenId);
    return record ? { ...record } : null;
  }

  async deleteOAuthAccessToken(tokenId: string): Promise<boolean> {
    return this.oauthAccessTokens.delete(tokenId);
  }

  async createOAuthAuthCode(record: OAuthAuthCodeRecord): Promise<void> {
    this.oauthAuthCodes.set(record.codeId, { ...record });
  }

  async consumeOAuthAuthCode(codeId: string, codeHash: string, nowMs: number): Promise<OAuthAuthCodeRecord | null> {
    const record = this.oauthAuthCodes.get(codeId);
    if (!record) return null;
    if (record.usedAt) {
      this.oauthAuthCodes.delete(codeId);
      return null;
    }
    if (Date.parse(record.expiresAt) <= nowMs) {
      this.oauthAuthCodes.delete(codeId);
      return null;
    }
    if (record.codeHash !== codeHash) return null;
    const used: OAuthAuthCodeRecord = { ...record, usedAt: new Date(nowMs).toISOString() };
    this.oauthAuthCodes.delete(codeId);
    return used;
  }

  async rotateOAuthRefreshToken(input: {
    refreshTokenId: string;
    refreshSecretHash: string;
    newRefreshTokenId: string;
    newRefreshHash: string;
    newRefreshExpiresAt: string;
    newAccessToken: OAuthAccessTokenRecord;
    nowMs: number;
  }): Promise<RotateRefreshTokenResult> {
    const grantId = this.oauthRefreshTokenIndex.get(input.refreshTokenId);
    if (!grantId) return { ok: false, reason: 'invalid' };
    const grant = this.oauthGrants.get(grantId);
    if (!grant) return { ok: false, reason: 'invalid' };
    if (grant.revokedAt) return { ok: false, reason: 'revoked' };
    if (Date.parse(grant.refreshExpiresAt) <= input.nowMs) return { ok: false, reason: 'expired' };
    if (grant.currentRefreshTokenId !== input.refreshTokenId) {
      this.oauthGrants.set(grantId, { ...grant, revokedAt: new Date(input.nowMs).toISOString() });
      return { ok: false, reason: 'reuse' };
    }
    if (grant.currentRefreshHash !== input.refreshSecretHash) return { ok: false, reason: 'invalid' };

    const previousRefreshTokenId = grant.currentRefreshTokenId;
    const updated: OAuthGrantRecord = {
      ...grant,
      currentRefreshTokenId: input.newRefreshTokenId,
      currentRefreshHash: input.newRefreshHash,
      refreshExpiresAt: input.newRefreshExpiresAt,
      lastUsedAt: new Date(input.nowMs).toISOString(),
    };
    this.oauthGrants.set(grantId, updated);
    this.oauthRefreshTokenIndex.set(input.newRefreshTokenId, grantId);
    this.oauthAccessTokens.set(input.newAccessToken.tokenId, { ...input.newAccessToken });
    return { ok: true, grant: { ...updated }, previousRefreshTokenId };
  }

  async issueOAuthTokensFromGrant(input: {
    grantId: string;
    refreshTokenId: string;
    refreshHash: string;
    refreshExpiresAt: string;
    accessToken: OAuthAccessTokenRecord;
    nowMs: number;
  }): Promise<OAuthGrantRecord | null> {
    const grant = this.oauthGrants.get(input.grantId);
    if (!grant || grant.revokedAt) return null;
    if (grant.currentRefreshTokenId) return null;

    const updated: OAuthGrantRecord = {
      ...grant,
      currentRefreshTokenId: input.refreshTokenId,
      currentRefreshHash: input.refreshHash,
      refreshExpiresAt: input.refreshExpiresAt,
      lastUsedAt: new Date(input.nowMs).toISOString(),
    };
    this.oauthGrants.set(input.grantId, updated);
    this.oauthRefreshTokenIndex.set(input.refreshTokenId, input.grantId);
    this.oauthAccessTokens.set(input.accessToken.tokenId, { ...input.accessToken });
    return { ...updated };
  }

  // Test/inspection only — production reads go through `listWaitlistEntries`.
  waitlistEntries(): WaitlistEntry[] {
    return Array.from(this.waitlist.values());
  }
}

export class FirestoreStore implements Store {
  private db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? new Firestore();
  }

  async getUser(uid: string): Promise<User | null> {
    const docRef = this.db.collection('users').doc(uid);
    const snap = await docRef.get();
    if (!snap.exists) return null;
    return snap.data() as User;
  }

  async getUserByHandle(handle: string): Promise<User | null> {
    const key = handle.trim().toLowerCase();
    if (!key) return null;
    const snap = await this.db.collection('handles').doc(key).get();
    if (!snap.exists) return null;
    const reservation = snap.data() as HandleRecord;
    if (reservation.releasedAt) return null;
    return this.getUser(reservation.uid);
  }

  async getHandleReservation(handle: string): Promise<HandleRecord | null> {
    const key = handle.trim().toLowerCase();
    if (!key) return null;
    const snap = await this.db.collection('handles').doc(key).get();
    if (!snap.exists) return null;
    return snap.data() as HandleRecord;
  }

  async claimHandle(uid: string, handle: string, at: string): Promise<ClaimHandleResult> {
    const { normalizeHandle, validateHandleShape, HANDLE_RENAME_COOLDOWN_MS } = await import('./creator-profile.js');
    const key = normalizeHandle(handle);
    const shape = validateHandleShape(key);
    if (shape) return { ok: false, reason: shape };

    const users = this.db.collection('users');
    const handles = this.db.collection('handles');

    try {
      return await this.db.runTransaction(async (tx) => {
        const userRef = users.doc(uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) return { ok: false, reason: 'not_found' };
        const user = userSnap.data() as User;
        if (user.handle === key) return { ok: false, reason: 'unchanged' };

        if (user.handle && user.handleChangedAt) {
          const elapsed = Date.parse(at) - Date.parse(user.handleChangedAt);
          if (Number.isFinite(elapsed) && elapsed < HANDLE_RENAME_COOLDOWN_MS) {
            return { ok: false, reason: 'cooldown' };
          }
        }

        const handleRef = handles.doc(key);
        const handleSnap = await tx.get(handleRef);
        if (handleSnap.exists) {
          const existing = handleSnap.data() as HandleRecord;
          if (!existing.releasedAt && existing.uid !== uid) {
            return { ok: false, reason: 'taken' };
          }
          if (existing.releasedAt && existing.previousUid !== uid) {
            const elapsed = Date.parse(at) - Date.parse(existing.releasedAt);
            if (Number.isFinite(elapsed) && elapsed < HANDLE_RENAME_COOLDOWN_MS) {
              return { ok: false, reason: 'taken' };
            }
          }
        }

        // Firestore requires every read before every write in a transaction.
        const oldHandleRef = user.handle && user.handle !== key ? handles.doc(user.handle) : null;
        if (oldHandleRef) await tx.get(oldHandleRef);

        if (oldHandleRef) {
          tx.set(oldHandleRef, {
            uid: user.uid,
            claimedAt: user.profileCreatedAt ?? at,
            releasedAt: at,
            previousUid: user.uid,
          } satisfies HandleRecord);
        }

        const updated: User = {
          ...user,
          handle: key,
          profileCreatedAt: user.profileCreatedAt ?? at,
          handleChangedAt: at,
          profileName: user.profileName ?? key,
          // Lettermark until the creator opts into showing their Google picture.
          avatarMode: user.avatarMode ?? 'letter',
        };
        tx.set(handleRef, { uid, claimedAt: updated.profileCreatedAt ?? at } satisfies HandleRecord);
        tx.set(userRef, stripUndefined(updated), { merge: true });
        return { ok: true, user: updated };
      });
    } catch (err) {
      console.error('claimHandle transaction failed', err);
      return { ok: false, reason: 'taken' };
    }
  }

  async updateCreatorProfile(
    uid: string,
    patch: { profileName?: string; bio?: string; avatarMode?: AvatarMode },
  ): Promise<User | null> {
    const user = await this.getUser(uid);
    if (!user) return null;
    const updated: User = {
      ...user,
      ...(patch.profileName !== undefined ? { profileName: patch.profileName } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      ...(patch.avatarMode !== undefined ? { avatarMode: patch.avatarMode } : {}),
    };
    await this.db.collection('users').doc(uid).set(stripUndefined(updated), { merge: true });
    return updated;
  }

  async releaseCreatorHandles(uid: string, at: string): Promise<string[]> {
    const released = new Set<string>();
    const user = await this.getUser(uid);
    if (user?.handle) released.add(user.handle);

    // Cooldown-held former handles still block claims; free those too.
    const previous = await this.db.collection('handles').where('previousUid', '==', uid).get();
    for (const doc of previous.docs) released.add(doc.id);
    const owned = await this.db.collection('handles').where('uid', '==', uid).get();
    for (const doc of owned.docs) released.add(doc.id);

    const batch = this.db.batch();
    for (const key of released) {
      batch.delete(this.db.collection('handles').doc(key));
    }
    if (user) {
      batch.set(
        this.db.collection('users').doc(uid),
        {
          handle: FieldValue.delete(),
          profileName: FieldValue.delete(),
          bio: FieldValue.delete(),
          avatarMode: FieldValue.delete(),
          profileCreatedAt: FieldValue.delete(),
          handleChangedAt: FieldValue.delete(),
        },
        { merge: true },
      );
    }
    if (released.size > 0 || user?.handle) {
      await batch.commit();
    }
    void at;
    return [...released].sort();
  }

  async deleteAccountIdentity(uid: string, at: string): Promise<AccountIdentityDeletionResult> {
    const user = await this.getUser(uid);
    const submissions = await this.db.collection('submissions').where('ownerUid', '==', uid).get();
    const owned = submissions.docs.map((doc) => ({ doc, record: doc.data() as SubmissionRecord }));
    const publishedSlugs = owned
      .filter(({ record }) => Boolean(record.publishedAt && record.slug))
      .map(({ record }) => record.slug!)
      .sort();
    const unpublishedSlugs = owned
      .filter(({ record }) => !record.publishedAt && record.slug)
      .map(({ record }) => record.slug!)
      .sort();

    // Resolve every account-owned collection before the first write. Besides making the
    // dry operational failure mode easier to reason about, this ensures an index error
    // cannot leave a half-deleted identity.
    const email = user?.email?.toLowerCase();
    const [
      accessTokens,
      gameAgentKeys,
      suggestions,
      oauthClients,
      oauthGrants,
      oauthAccessTokens,
      oauthAuthCodes,
      refreshTokens,
      activeHandles,
      previousHandles,
      notifications,
      pushSubscriptions,
      saves,
      drafts,
      affinity,
      usageCounters,
      waitlistByEmail,
      betaInvitesCreated,
      betaInvitesClaimed,
    ] = await Promise.all([
      this.db.collection('accessTokens').where('uid', '==', uid).get(),
      this.db.collection('gameAgentKeys').where('ownerUid', '==', uid).get(),
      this.db.collection('suggestions').where('ownerUid', '==', uid).get(),
      this.db.collection('oauthClients').where('ownerUid', '==', uid).get(),
      this.db.collection('oauthGrants').where('ownerUid', '==', uid).get(),
      this.db.collection('oauthAccessTokens').where('ownerUid', '==', uid).get(),
      this.db.collection('oauthAuthCodes').where('ownerUid', '==', uid).get(),
      this.db.collection('oauthRefreshTokens').where('ownerUid', '==', uid).get(),
      this.db.collection('handles').where('uid', '==', uid).get(),
      this.db.collection('handles').where('previousUid', '==', uid).get(),
      this.db.collection('users').doc(uid).collection('notifications').get(),
      this.db.collection('users').doc(uid).collection('pushSubscriptions').get(),
      this.db.collection('users').doc(uid).collection('gameSaves').get(),
      this.db.collection('users').doc(uid).collection('editorDrafts').get(),
      this.db.collection('users').doc(uid).collection('playAffinity').get(),
      this.db.collection('usage').doc(uid).collection('counters').get(),
      email ? this.db.collection('waitlist').where('email', '==', email).get() : Promise.resolve(null),
      this.db.collection('betaInvites').where('createdByUid', '==', uid).get(),
      this.db.collection('betaInvites').where('claimedUid', '==', uid).get(),
    ]);

    // Refresh-token index rows historically carry only grantId, so ownerUid is absent.
    // Join them to the owned grants rather than leaving a credential lookup pointing at
    // a deleted account. The ownerUid query above still covers newer rows if that field
    // is added later.
    const grantIds = new Set(oauthGrants.docs.map((doc) => doc.id));
    const refreshByGrant = await Promise.all(
      [...grantIds].map((grantId) => this.db.collection('oauthRefreshTokens').where('grantId', '==', grantId).get()),
    );

    const deleteRefs = new Map<string, FirebaseFirestore.DocumentReference>();
    const addDeletes = (docs: readonly FirebaseFirestore.QueryDocumentSnapshot[]) => {
      for (const doc of docs) deleteRefs.set(doc.ref.path, doc.ref);
    };
    for (const snap of [
      accessTokens,
      gameAgentKeys,
      oauthGrants,
      oauthAccessTokens,
      oauthAuthCodes,
      refreshTokens,
      activeHandles,
      previousHandles,
      notifications,
      pushSubscriptions,
      saves,
      drafts,
      affinity,
      usageCounters,
      ...refreshByGrant,
    ]) {
      addDeletes(snap.docs);
    }
    if (waitlistByEmail) addDeletes(waitlistByEmail.docs);
    addDeletes(betaInvitesCreated.docs);
    addDeletes(betaInvitesClaimed.docs);
    deleteRefs.set(`waitlist/${uid}`, this.db.collection('waitlist').doc(uid));
    deleteRefs.set(`creatorAgentKeys/${uid}`, this.db.collection('creatorAgentKeys').doc(uid));
    deleteRefs.set(`usage/${uid}`, this.db.collection('usage').doc(uid));
    deleteRefs.set(`users/${uid}`, this.db.collection('users').doc(uid));

    const writes: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];
    for (const { doc, record } of owned) {
      writes.push((batch) =>
        batch.set(
          doc.ref,
          {
            ownerUid: DELETED_ACCOUNT_UID,
            ...(!record.publishedAt
              ? { abandonedAt: record.abandonedAt ?? at, draftSharedAt: FieldValue.delete() }
              : {}),
          },
          { merge: true },
        ),
      );
    }
    for (const doc of suggestions.docs) {
      writes.push((batch) => batch.set(doc.ref, { ownerUid: null, updatedAt: at }, { merge: true }));
    }
    for (const doc of oauthClients.docs) {
      writes.push((batch) => batch.set(doc.ref, { ownerUid: FieldValue.delete() }, { merge: true }));
    }
    for (const ref of deleteRefs.values()) writes.push((batch) => batch.delete(ref));

    // Keep below Firestore's 500-operation ceiling. Every operation is idempotent, so a
    // transport failure between batches is safely completed by retrying the request.
    const BATCH_SIZE = 450;
    for (let start = 0; start < writes.length; start += BATCH_SIZE) {
      const batch = this.db.batch();
      for (const write of writes.slice(start, start + BATCH_SIZE)) write(batch);
      await batch.commit();
    }

    return { publishedSlugs, unpublishedSlugs };
  }

  async scheduleAccountDeletion(uid: string, requestedAt: string, scheduledFor: string): Promise<User | null> {
    const ref = this.db.collection('users').doc(uid);
    return this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) return null;
      const updated = {
        ...(snap.data() as User),
        deletionRequestedAt: requestedAt,
        deletionScheduledFor: scheduledFor,
      };
      transaction.set(ref, { deletionRequestedAt: requestedAt, deletionScheduledFor: scheduledFor }, { merge: true });
      return updated;
    });
  }

  async cancelAccountDeletion(uid: string): Promise<boolean> {
    const ref = this.db.collection('users').doc(uid);
    return this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists || !(snap.data() as User).deletionScheduledFor) return false;
      transaction.set(
        ref,
        { deletionRequestedAt: FieldValue.delete(), deletionScheduledFor: FieldValue.delete() },
        { merge: true },
      );
      return true;
    });
  }

  async listAccountsDueForDeletion(at: string, limit: number): Promise<User[]> {
    const snap = await this.db
      .collection('users')
      .where('deletionScheduledFor', '<=', at)
      .orderBy('deletionScheduledFor', 'asc')
      .limit(limit)
      .get();
    return snap.docs.map((doc) => doc.data() as User);
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const trimmed = email.trim();
    if (trimmed === '') return null;

    // Collection-scoped equality, so Firestore's automatic single-field index covers it
    // and nothing needs provisioning in setup-gcp.sh (see firestore-indexes.test.ts —
    // only collection *group* queries need a declared index).
    //
    // Two casings because `users.email` is stored exactly as the identity provider sent
    // it, with no normalization, for every account created before this method existed.
    // Google returns lowercase in practice, which is why the common case is one read.
    const lower = trimmed.toLowerCase();
    const candidates = [lower, ...(trimmed === lower ? [] : [trimmed])];

    for (const candidate of candidates) {
      // limit(2), not limit(1): the point is to *detect* an ambiguous match rather than
      // silently sign somebody into the first of several accounts sharing an address.
      const snap = await this.db.collection('users').where('email', '==', candidate).limit(2).get();
      if (snap.size === 1) return snap.docs[0]?.data() as User;
      if (snap.size > 1) return null;
    }

    return null;
  }

  async upsertUser(userData: Partial<User> & { uid: string }): Promise<User> {
    const now = new Date().toISOString();
    const docRef = this.db.collection('users').doc(userData.uid);

    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      let user: User;

      if (!snap.exists) {
        user = {
          uid: userData.uid,
          email: userData.email,
          name: userData.name,
          picture: userData.picture,
          createdAt: now,
          lastLoginAt: now,
          tier: userData.tier ?? 'standard',
          locale: userData.locale,
          activeDays: userData.activeDays,
        };
      } else {
        const existing = snap.data() as User;
        user = {
          ...existing,
          email: userData.email ?? existing.email,
          name: userData.name ?? existing.name,
          picture: userData.picture ?? existing.picture,
          lastLoginAt: now,
          tier: userData.tier ?? existing.tier,
          // `...existing` carries the *stored* value, so an incoming update to either of
          // these was dropped on the floor for every account that already existed —
          // which, for `activeDays`, is every account the activity hook ever touched.
          locale: userData.locale ?? existing.locale,
          activeDays: userData.activeDays ?? existing.activeDays,
        };
      }

      transaction.set(docRef, stripUndefined(user), { merge: true });
      return user;
    });
  }

  async setEmailUnsubscribed(uid: string, at: string | null): Promise<void> {
    await this.db.collection('users').doc(uid).set({ emailUnsubscribedAt: at }, { merge: true });
  }

  async setDigestOptOut(uid: string, at: string | null): Promise<void> {
    await this.db.collection('users').doc(uid).set({ digestOptOutAt: at }, { merge: true });
  }

  async createSubmission(issueNumber: number, ownerUid: string, title: string): Promise<SubmissionRecord> {
    const createdAt = new Date().toISOString();
    const record: SubmissionRecord = {
      issueNumber,
      ownerUid,
      createdAt,
      title,
      // New jobs are generation-scoped from the first mint; legacy records created
      // before this field existed stay unset until their current round closes.
      roundGeneration: 1,
      roundStartedAt: createdAt,
    };
    await this.db.collection('submissions').doc(String(issueNumber)).set(record);
    return record;
  }

  async getSubmission(issueNumber: number): Promise<SubmissionRecord | null> {
    const snap = await this.db.collection('submissions').doc(String(issueNumber)).get();
    if (!snap.exists) return null;
    return snap.data() as SubmissionRecord;
  }

  async setSubmissionNotifiedStatus(issueNumber: number, status: SubmissionStatus): Promise<void> {
    await this.db
      .collection('submissions')
      .doc(String(issueNumber))
      .set({ lastNotifiedStatus: status }, { merge: true });
  }

  async setSubmissionLastStatus(issueNumber: number, status: SubmissionStatus): Promise<void> {
    await this.db.collection('submissions').doc(String(issueNumber)).set({ lastStatus: status }, { merge: true });
  }

  async recordJobTransition(issueNumber: number, transition: JobTransition): Promise<boolean> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    // A transaction, not a merge: the status poll and the reconciler sweep can both
    // observe the same job at once, and appending to a list read outside a transaction
    // loses whichever write landed second — silently, and exactly under the concurrent
    // load where the history matters most. The round-generation bump rides in the same
    // write so a closing transition never leaves a stale channel token valid.
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const current = snap.data() as SubmissionRecord;
      // Same race as InMemoryStore: concurrent identical arrivals must not both "win"
      // (gate screenshots key off `recorded`). Same-state with a new reason is allowed
      // only for the operator (quiet-build retry); see InMemoryStore.recordJobTransition.
      if (current.state === transition.to) {
        const last = current.transitions?.at(-1);
        if (last?.to === transition.to && last?.reason === transition.reason) return false;
        if (transition.by !== 'operator') return false;
      }
      const closes = transitionClosesRound(transition);
      if (closes) {
        const next: SubmissionRecord = {
          ...current,
          state: transition.to,
          stateSince: transition.at,
          transitions: [...(current.transitions ?? []), transition].slice(-MAX_JOB_TRANSITIONS),
          roundGeneration: nextRoundGeneration(current.roundGeneration),
          roundDeliveryCount: 0,
          roundTypecheckPreflightRefusals: 0,
          roundSubmitAttempts: 0,
          roundPreflightRefusalsAudio: 0,
          roundPreflightRefusalsSymbols: 0,
          roundStartedAt: transition.at,
        };
        delete next.seed;
        delete next.seedStatus;
        delete next.lastAgentSignalAt;
        delete next.lastAgentPresence;
        delete next.agentEndedAt;
        delete next.agentEndedBy;
        delete next.roundKitEngineRef;
        delete next.roundTypecheckPreflightBypassErrors;
        delete next.roundLastGateMetricKey;
        tx.set(ref, next);
      } else {
        tx.set(
          ref,
          {
            state: transition.to,
            stateSince: transition.at,
            transitions: [...(current.transitions ?? []), transition].slice(-MAX_JOB_TRANSITIONS),
          },
          { merge: true },
        );
      }
      return true;
    });
  }

  async bumpRoundGeneration(issueNumber: number): Promise<number | null> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const current = snap.data() as SubmissionRecord;
      const roundGeneration = nextRoundGeneration(current.roundGeneration);
      const next: SubmissionRecord = {
        ...current,
        roundGeneration,
        roundDeliveryCount: 0,
        roundTypecheckPreflightRefusals: 0,
        roundSubmitAttempts: 0,
        roundPreflightRefusalsAudio: 0,
        roundPreflightRefusalsSymbols: 0,
        roundStartedAt: new Date().toISOString(),
      };
      delete next.seed;
      delete next.seedStatus;
      delete next.lastAgentSignalAt;
      delete next.lastAgentPresence;
      delete next.agentEndedAt;
      delete next.agentEndedBy;
      delete next.roundKitEngineRef;
      delete next.roundTypecheckPreflightBypassErrors;
      delete next.roundLastGateMetricKey;
      tx.set(ref, next);
      return roundGeneration;
    });
  }

  async pinRoundKitEngineRef(issueNumber: number, engineRef: string, replace = false): Promise<string | null> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const current = snap.data() as SubmissionRecord;
      if (current.roundKitEngineRef && !replace) return current.roundKitEngineRef;
      tx.set(ref, { roundKitEngineRef: engineRef }, { merge: true });
      return engineRef;
    });
  }

  async requestBuilderHandoff(
    issueNumber: number,
    to: BuilderKind,
    requestedAt: string,
    awaitsAgentAck = true,
  ): Promise<boolean> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const current = snap.data() as SubmissionRecord;
      if (current.builderHandoff) return false;
      const from = current.builder ?? current.defaultBuilder ?? 'platform';
      if (from === to) return false;
      tx.set(ref, { builderHandoff: { from, to, requestedAt, awaitsAgentAck } }, { merge: true });
      return true;
    });
  }

  async acknowledgeBuilderHandoff(issueNumber: number, acknowledgedAt: string): Promise<BuilderHandoff | null> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const current = snap.data() as SubmissionRecord;
      if (!current.builderHandoff || current.builderHandoff.acknowledgedAt) return null;
      const handoff: BuilderHandoff = { ...current.builderHandoff, acknowledgedAt };
      tx.set(ref, { builderHandoff: handoff }, { merge: true });
      return handoff;
    });
  }

  async clearBuilderHandoff(issueNumber: number): Promise<void> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = snap.data() as SubmissionRecord;
      if (!current.builderHandoff) return;
      const next = { ...current };
      delete next.builderHandoff;
      tx.set(ref, next);
    });
  }

  async ensureRoundGeneration(issueNumber: number): Promise<number | null> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const current = snap.data() as SubmissionRecord;
      if (current.roundGeneration !== undefined) return current.roundGeneration;
      tx.set(ref, { roundGeneration: 1 }, { merge: true });
      return 1;
    });
  }

  async clearAgentEnded(issueNumber: number): Promise<void> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = snap.data() as SubmissionRecord;
      const next = { ...current };
      delete next.lastAgentSignalAt;
      delete next.lastAgentPresence;
      delete next.agentEndedAt;
      delete next.agentEndedBy;
      tx.set(ref, next);
    });
  }

  async setSubmissionAgentState(issueNumber: number, agentState: AgentTaskState): Promise<void> {
    await this.db.collection('submissions').doc(String(issueNumber)).set({ agentState }, { merge: true });
  }

  async setRoundBuilder(
    issueNumber: number,
    builder: BuilderKind,
    options?: { resetRoundBudget?: boolean },
  ): Promise<void> {
    const reset = options?.resetRoundBudget ?? false;
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    if (!reset) {
      await ref.set({ builder, defaultBuilder: builder }, { merge: true });
      return;
    }
    // Clearing seed on a new round: merge cannot delete a field, so read-modify-write.
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = snap.data() as SubmissionRecord;
      const next: SubmissionRecord = {
        ...current,
        builder,
        defaultBuilder: builder,
        roundDeliveryCount: 0,
        roundTypecheckPreflightRefusals: 0,
        roundSubmitAttempts: 0,
        roundPreflightRefusalsAudio: 0,
        roundPreflightRefusalsSymbols: 0,
        roundStartedAt: new Date().toISOString(),
      };
      delete next.seed;
      delete next.seedStatus;
      delete next.roundTypecheckPreflightBypassErrors;
      delete next.roundLastGateMetricKey;
      tx.set(ref, next);
    });
  }

  async setSubmissionSeed(issueNumber: number, seed: SeedFiles | null): Promise<void> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    if (seed) {
      await ref.set({ seed, seedStatus: 'available' }, { merge: true });
      return;
    }
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = snap.data() as SubmissionRecord;
      const next: SubmissionRecord = { ...current, seedStatus: 'unavailable' };
      delete next.seed;
      tx.set(ref, next);
    });
  }

  async setSeedStatus(issueNumber: number, status: 'pending' | 'unavailable'): Promise<void> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = snap.data() as SubmissionRecord;
      if (current.seed) {
        tx.set(ref, { seedStatus: 'available' }, { merge: true });
        return;
      }
      tx.set(ref, { seedStatus: status }, { merge: true });
    });
  }

  async incrementSeedRegenerations(issueNumber: number): Promise<number> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      const current = snap.data() as SubmissionRecord;
      const seedRegenerations = (current.seedRegenerations ?? 0) + 1;
      tx.set(ref, { seedRegenerations }, { merge: true });
      return seedRegenerations;
    });
  }

  async incrementRoundDeliveryCount(issueNumber: number): Promise<number> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      const current = snap.data() as SubmissionRecord;
      const roundDeliveryCount = (current.roundDeliveryCount ?? 0) + 1;
      tx.set(ref, { roundDeliveryCount }, { merge: true });
      return roundDeliveryCount;
    });
  }

  async incrementRoundTypecheckPreflightRefusals(issueNumber: number): Promise<number> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      const current = snap.data() as SubmissionRecord;
      const roundTypecheckPreflightRefusals = (current.roundTypecheckPreflightRefusals ?? 0) + 1;
      tx.set(ref, { roundTypecheckPreflightRefusals }, { merge: true });
      return roundTypecheckPreflightRefusals;
    });
  }

  async setRoundTypecheckPreflightBypassErrors(issueNumber: number, message: string | null): Promise<void> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    if (message == null) {
      await ref.set({ roundTypecheckPreflightBypassErrors: FieldValue.delete() }, { merge: true });
      return;
    }
    await ref.set({ roundTypecheckPreflightBypassErrors: message }, { merge: true });
  }

  async incrementRoundSubmitAttempts(issueNumber: number): Promise<number> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      const current = snap.data() as SubmissionRecord;
      const roundSubmitAttempts = (current.roundSubmitAttempts ?? 0) + 1;
      tx.set(ref, { roundSubmitAttempts }, { merge: true });
      return roundSubmitAttempts;
    });
  }

  async incrementRoundPreflightRefusal(issueNumber: number, kind: 'audio' | 'symbols'): Promise<number> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      const current = snap.data() as SubmissionRecord;
      if (kind === 'audio') {
        const roundPreflightRefusalsAudio = (current.roundPreflightRefusalsAudio ?? 0) + 1;
        tx.set(ref, { roundPreflightRefusalsAudio }, { merge: true });
        return roundPreflightRefusalsAudio;
      }
      const roundPreflightRefusalsSymbols = (current.roundPreflightRefusalsSymbols ?? 0) + 1;
      tx.set(ref, { roundPreflightRefusalsSymbols }, { merge: true });
      return roundPreflightRefusalsSymbols;
    });
  }

  async setRoundLastGateMetricKey(issueNumber: number, key: string): Promise<void> {
    await this.db
      .collection('submissions')
      .doc(String(issueNumber))
      .set({ roundLastGateMetricKey: key }, { merge: true });
  }

  async allocateJobId(): Promise<number> {
    const ref = this.db.collection('counters').doc('jobs');
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = (snap.data() as { next?: number } | undefined)?.next ?? JOB_ID_FLOOR;
      const next = Math.max(current, JOB_ID_FLOOR) + 1;
      tx.set(ref, { next }, { merge: true });
      return next;
    });
  }

  async recordDispatch(
    issueNumber: number,
    dispatch: { backend: string; ref: string; workspace?: string; seedWorkspace?: string; credentialRef?: string },
  ): Promise<void> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    // Transactional for the same reason transitions are: a dispatch and a reconciler
    // observation can land together, and appending to a list read outside a transaction
    // drops one of them.
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const existing = (snap.data() as SubmissionRecord).dispatch;
      tx.set(
        ref,
        {
          dispatch: {
            backend: dispatch.backend,
            refs: [...(existing?.refs ?? []), dispatch.ref],
            ...(dispatch.credentialRef
              ? { credentialRefs: { ...existing?.credentialRefs, [dispatch.ref]: dispatch.credentialRef } }
              : {}),
            ...((dispatch.workspace ?? existing?.workspace)
              ? { workspace: dispatch.workspace ?? existing?.workspace }
              : {}),
            ...((dispatch.seedWorkspace ?? existing?.seedWorkspace)
              ? { seedWorkspace: dispatch.seedWorkspace ?? existing?.seedWorkspace }
              : {}),
          },
        },
        { merge: true },
      );
    });
  }

  async recordSeedOutcome(issueNumber: number, outcome: JobSeedOutcome): Promise<void> {
    // A plain merge: one writer, once per job, so there is nothing here to race.
    await this.db.collection('submissions').doc(String(issueNumber)).set({ seedOutcome: outcome }, { merge: true });
  }

  async listSeedOutcomesSince(since: string): Promise<JobSeedOutcome[]> {
    // A real range query, unlike most reads here: `seedOutcome.at` is a map subfield and
    // Firestore indexes those automatically, so this costs the documents in the window
    // rather than the collection. Ordering by the same field it filters on needs no
    // composite index.
    const snap = await this.db
      .collection('submissions')
      .where('seedOutcome.at', '>=', since)
      .orderBy('seedOutcome.at', 'desc')
      .get();
    return snap.docs
      .map((d) => (d.data() as SubmissionRecord).seedOutcome)
      .filter((outcome): outcome is JobSeedOutcome => Boolean(outcome));
  }

  async recordJobCost(issueNumber: number, entry: JobCostEntry): Promise<void> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    // Transactional like every other append here: two rounds of a job can be charged
    // within the same second, and a read outside a transaction loses one of them —
    // which is the one failure mode a ledger may not have.
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const existing = (snap.data() as SubmissionRecord).costs ?? [];
      tx.set(ref, { costs: [...existing, entry].slice(-MAX_JOB_COSTS) }, { merge: true });
    });
  }

  async setJobCostCredits(issueNumber: number, ref: string, credits: number): Promise<void> {
    const docRef = this.db.collection('submissions').doc(String(issueNumber));
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return;
      const existing = (snap.data() as SubmissionRecord).costs ?? [];
      let changed = false;
      const costs = existing.map((entry) => {
        if (entry.kind !== 'agent_session' || entry.ref !== ref || entry.creditsMeasured) return entry;
        changed = true;
        return { ...entry, credits, creditsMeasured: true };
      });
      if (!changed) return;
      tx.set(docRef, { costs }, { merge: true });
    });
  }

  async setJobCostTokens(issueNumber: number, ref: string, tokens: AgentSessionTokens): Promise<void> {
    const docRef = this.db.collection('submissions').doc(String(issueNumber));
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return;
      const existing = (snap.data() as SubmissionRecord).costs ?? [];
      const costs = applyMeasuredTokens(existing, ref, tokens);
      if (!costs) return;
      tx.set(docRef, { costs }, { merge: true });
    });
  }

  async setDispatchWorkspace(issueNumber: number, workspace: string): Promise<void> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    // Transactional like recordDispatch, and for the same reason: this runs from a
    // status poll that can race a dispatch, and a merge computed from a stale read
    // would drop whichever landed first.
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const existing = (snap.data() as SubmissionRecord).dispatch;
      if (!existing) return;
      tx.set(ref, { dispatch: { ...existing, workspace } }, { merge: true });
    });
  }

  async clearDispatchSeedWorkspace(issueNumber: number): Promise<void> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const existing = (snap.data() as SubmissionRecord).dispatch;
      if (!existing?.seedWorkspace) return;
      // Rewritten whole rather than merged with a delete sentinel: `dispatch` is a small
      // object already read inside this transaction, so replacing it is both simpler and
      // safe from the partial-merge surprise a field delete would risk.
      const dispatch = { ...existing };
      delete dispatch.seedWorkspace;
      tx.set(ref, { dispatch }, { merge: true });
    });
  }

  async getPublication(slug: string): Promise<PublicationRecord | null> {
    const snap = await this.db.collection('games').doc(slug).get();
    const publication = (snap.data() as { publication?: PublicationRecord } | undefined)?.publication;
    return publication ?? null;
  }

  async setPublication(record: PublicationRecord): Promise<void> {
    // Merged onto the existing game document rather than a collection of its own: votes,
    // player feedback and scorecards already live at games/{slug}, and a takedown that
    // has to remember to visit a second place is a takedown that eventually misses one.
    await this.db.collection('games').doc(record.slug).set({ publication: record }, { merge: true });
  }

  async setPublicationHealthCheck(slug: string, check: PublicationHealthCheck): Promise<boolean> {
    const ref = this.db.collection('games').doc(slug);
    // Transactional for the same reason takedown is: the sweep writing a verdict can
    // race an operator re-requesting, and a merge from a stale read would resurrect
    // whichever check the other side just replaced.
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = (snap.data() as { publication?: PublicationRecord } | undefined)?.publication;
      if (!current) return false;
      tx.set(ref, { publication: { ...current, healthCheck: check } }, { merge: true });
      return true;
    });
  }

  async takedownPublication(slug: string, reason: string, at: string): Promise<boolean> {
    const ref = this.db.collection('games').doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = (snap.data() as { publication?: PublicationRecord } | undefined)?.publication;
      if (!current) return false;
      tx.set(
        ref,
        { publication: { ...current, state: 'disabled', takedownAt: at, takedownReason: reason } },
        { merge: true },
      );
      return true;
    });
  }

  async archivePublication(slug: string, reason: string, at: string): Promise<boolean> {
    const ref = this.db.collection('games').doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = (snap.data() as { publication?: PublicationRecord } | undefined)?.publication;
      if (!current) return false;
      tx.set(
        ref,
        { publication: { ...current, state: 'archived', takedownAt: at, takedownReason: reason } },
        { merge: true },
      );
      return true;
    });
  }

  async listPublications(): Promise<PublicationRecord[]> {
    const snap = await this.db.collection('games').get();
    return snap.docs
      .map((doc) => (doc.data() as { publication?: PublicationRecord }).publication)
      .filter((publication): publication is PublicationRecord => Boolean(publication));
  }

  async setSubmissionSlug(issueNumber: number, slug: string): Promise<void> {
    await this.db.collection('submissions').doc(String(issueNumber)).set({ slug }, { merge: true });
  }

  async setSubmissionTitle(issueNumber: number, title: string): Promise<void> {
    await this.db.collection('submissions').doc(String(issueNumber)).set({ title }, { merge: true });
  }

  async setSubmissionDeliveredVersion(issueNumber: number, version: string): Promise<void> {
    // Last write wins on purpose: the newest delivery is the one worth previewing.
    await this.db
      .collection('submissions')
      .doc(String(issueNumber))
      .set({ deliveredVersion: version, previewVersion: version }, { merge: true });
  }

  async setSubmissionPreviewVersion(issueNumber: number, version: string): Promise<void> {
    await this.db.collection('submissions').doc(String(issueNumber)).set({ previewVersion: version }, { merge: true });
  }

  async recordDeliveryNudge(issueNumber: number): Promise<number> {
    // Transactional: two pollers can observe the same undelivered session at once, and
    // a lost increment here buys the job an extra agent session it was not owed.
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      const nudges = ((snap.data() as SubmissionRecord).deliveryNudges ?? 0) + 1;
      tx.set(ref, { deliveryNudges: nudges }, { merge: true });
      return nudges;
    });
  }

  async setSubmissionPublishedAt(issueNumber: number, at: string): Promise<void> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    const snap = await ref.get();
    // First observation wins: a later re-derivation must not move the timestamp.
    if ((snap.data() as SubmissionRecord | undefined)?.publishedAt) return;
    await ref.set({ publishedAt: at }, { merge: true });
  }

  async setSubmissionAbandoned(issueNumber: number, at: string): Promise<void> {
    await this.db.collection('submissions').doc(String(issueNumber)).set({ abandonedAt: at }, { merge: true });
  }

  async setDraftShared(issueNumber: number, at: string | null): Promise<void> {
    // Deleted rather than set false, so "shared" is one shape everywhere: a timestamp
    // is present or it is not, and no reader has to know about a legacy falsy value.
    await this.db
      .collection('submissions')
      .doc(String(issueNumber))
      .set({ draftSharedAt: at ?? FieldValue.delete() }, { merge: true });
  }

  async setSubmissionLocale(issueNumber: number, locale: string): Promise<void> {
    await this.db.collection('submissions').doc(String(issueNumber)).set({ locale }, { merge: true });
  }

  async setSubmissionClarificationCount(issueNumber: number, count: number): Promise<void> {
    await this.db
      .collection('submissions')
      .doc(String(issueNumber))
      .set({ clarificationCount: count }, { merge: true });
  }

  async setSubmissionBrief(
    issueNumber: number,
    brief: { spec: string; qa: string[]; specIsSystemGenerated?: boolean },
  ): Promise<void> {
    await this.db
      .collection('submissions')
      .doc(String(issueNumber))
      .set(
        {
          spec: brief.spec,
          qa: brief.qa,
          ...(brief.specIsSystemGenerated ? { specIsSystemGenerated: true } : {}),
        },
        { merge: true },
      );
  }

  private eventsCollection(issueNumber: number) {
    return this.db.collection('submissions').doc(String(issueNumber)).collection('events');
  }

  private messagesCollection(issueNumber: number) {
    return this.db.collection('submissions').doc(String(issueNumber)).collection('messages');
  }

  private shotsCollection(issueNumber: number) {
    return this.db.collection('submissions').doc(String(issueNumber)).collection('shots');
  }

  private previewsCollection(issueNumber: number) {
    return this.db.collection('submissions').doc(String(issueNumber)).collection('previews');
  }

  async appendBuildEvent(
    issueNumber: number,
    event: Omit<BuildEvent, 'id' | 'createdAt'> & { createdAt?: string },
    options?: { preserveEnded?: boolean },
  ): Promise<BuildEvent> {
    const record: BuildEvent = { ...event, id: randomUUID(), createdAt: event.createdAt ?? new Date().toISOString() };
    // Firestore rejects undefined values; optional fields are simply absent instead.
    const document = Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
    await this.eventsCollection(issueNumber).doc(record.id).set(document);
    // Denormalized onto the parent so the operator queue can judge silence for every
    // in-flight job without a subcollection read per job. Merged separately rather than
    // transactionally: losing a race here costs a slightly stale liveness timestamp,
    // which is not worth a transaction on the hottest write in the channel.
    await this.db
      .collection('submissions')
      .doc(String(issueNumber))
      .set(
        {
          lastAgentSignalAt: record.createdAt,
          // A real chat row supersedes the ambient thought flash.
          lastAgentPresence: FieldValue.delete(),
          // Resumed work after MCP `end`.
          ...(options?.preserveEnded ? {} : { agentEndedAt: FieldValue.delete(), agentEndedBy: FieldValue.delete() }),
        },
        { merge: true },
      );
    return record;
  }

  async touchLastAgentSignalAt(
    issueNumber: number,
    at?: string,
    presence?: { key: string },
    options?: { preserveEnded?: boolean },
  ): Promise<void> {
    const stamped = at ?? new Date().toISOString();
    await this.db
      .collection('submissions')
      .doc(String(issueNumber))
      .set(
        {
          lastAgentSignalAt: stamped,
          ...(options?.preserveEnded ? {} : { agentEndedAt: FieldValue.delete(), agentEndedBy: FieldValue.delete() }),
          ...(presence ? { lastAgentPresence: { key: presence.key, at: stamped } } : {}),
        },
        { merge: true },
      );
  }

  async markAgentEnded(issueNumber: number, at?: string, by: AgentEndedBy = 'end'): Promise<void> {
    await this.db
      .collection('submissions')
      .doc(String(issueNumber))
      .set({ agentEndedAt: at ?? new Date().toISOString(), agentEndedBy: by }, { merge: true });
  }

  async listBuildEvents(issueNumber: number, opts?: { limit?: number }): Promise<BuildEvent[]> {
    const snap = await this.eventsCollection(issueNumber)
      .orderBy('createdAt', 'desc')
      .limit(opts?.limit ?? 20)
      .get();
    return snap.docs.map((doc) => doc.data() as BuildEvent).sort(byNewestFirst);
  }

  async countBuildEvents(issueNumber: number): Promise<number> {
    const snap = await this.eventsCollection(issueNumber).count().get();
    return snap.data().count;
  }

  async appendBuildShot(
    issueNumber: number,
    shot: Omit<BuildShot, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildShot> {
    const record: BuildShot = { ...shot, id: randomUUID(), createdAt: shot.createdAt ?? new Date().toISOString() };
    const document = Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
    await this.shotsCollection(issueNumber).doc(record.id).set(document);
    return record;
  }

  async listBuildShots(issueNumber: number, opts?: { limit?: number }): Promise<BuildShotSummary[]> {
    // `select()` keeps the bytes on the server: a listing rides the status response,
    // which is polled every few seconds, and the images themselves are fetched once
    // each by the browser and then cached.
    const snap = await this.shotsCollection(issueNumber)
      .select('id', 'label', 'labelLocalized', 'locale', 'createdAt')
      .orderBy('createdAt', 'desc')
      .limit(opts?.limit ?? 12)
      .get();
    return snap.docs.map((doc) => doc.data() as BuildShotSummary).sort(byNewestFirst);
  }

  async getBuildShot(issueNumber: number, id: string): Promise<BuildShot | null> {
    const doc = await this.shotsCollection(issueNumber).doc(id).get();
    return doc.exists ? (doc.data() as BuildShot) : null;
  }

  async countBuildShots(issueNumber: number): Promise<number> {
    const snap = await this.shotsCollection(issueNumber).count().get();
    return snap.data().count;
  }

  async appendBuildPreview(
    issueNumber: number,
    preview: Omit<BuildPreview, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildPreview> {
    const record: BuildPreview = {
      ...preview,
      id: randomUUID(),
      createdAt: preview.createdAt ?? new Date().toISOString(),
    };
    const document = Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
    await this.previewsCollection(issueNumber).doc(record.id).set(document);
    return record;
  }

  async listBuildPreviews(issueNumber: number, opts?: { limit?: number }): Promise<BuildPreviewSummary[]> {
    // `select()` matters far more here than it does for shots: a preview document is a
    // couple of hundred kilobytes, and this listing rides a status response the creator's
    // browser polls every few seconds. The bytes are fetched once, by the iframe.
    const snap = await this.previewsCollection(issueNumber)
      .select('id', 'slug', 'label', 'labelLocalized', 'locale', 'createdAt')
      .orderBy('createdAt', 'desc')
      .limit(opts?.limit ?? 4)
      .get();
    return snap.docs.map((doc) => doc.data() as BuildPreviewSummary).sort(byNewestFirst);
  }

  async getBuildPreview(issueNumber: number, id: string): Promise<BuildPreview | null> {
    const doc = await this.previewsCollection(issueNumber).doc(id).get();
    return doc.exists ? (doc.data() as BuildPreview) : null;
  }

  async countBuildPreviews(issueNumber: number): Promise<number> {
    const snap = await this.previewsCollection(issueNumber).count().get();
    return snap.data().count;
  }

  async pruneBuildPreviews(issueNumber: number, keep: number): Promise<number> {
    // Previews are heavy and each one obsoletes the last, so the collection is trimmed on
    // write rather than left to a retention job. Ids only — pulling the documents to
    // decide which to drop would fetch the very bytes this is trying not to keep.
    const snap = await this.previewsCollection(issueNumber).select('createdAt').orderBy('createdAt', 'desc').get();
    const stale = snap.docs.slice(keep);
    if (!stale.length) return 0;
    // Chunked, because a Firestore batch takes at most 500 operations. Steady state is
    // one deletion per push, so this never matters — until pruning falls behind (a spell
    // of write errors while the watcher keeps pushing), at which point a single batch
    // would start failing permanently and previews would grow without bound. The cheap
    // loop is what stops a transient fault from becoming a permanent one.
    const BATCH_LIMIT = 500;
    for (let start = 0; start < stale.length; start += BATCH_LIMIT) {
      const batch = this.db.batch();
      for (const doc of stale.slice(start, start + BATCH_LIMIT)) batch.delete(doc.ref);
      await batch.commit();
    }
    return stale.length;
  }

  async appendCreatorMessage(
    issueNumber: number,
    text: string,
    opts?: { origin?: CreatorMessageOrigin; delivered?: boolean; textLocalized?: string; locale?: string },
  ): Promise<CreatorMessage> {
    // Spread in only for agent/studio — Firestore rejects an explicit undefined.
    const now = new Date().toISOString();
    const record: CreatorMessage = {
      id: randomUUID(),
      text,
      createdAt: now,
      deliveredAt: opts?.delivered ? now : null,
      ...(opts?.origin === 'agent' || isStudioOrigin(opts?.origin) ? { origin: opts?.origin } : {}),
      ...(opts?.textLocalized && opts?.locale ? { textLocalized: opts.textLocalized, locale: opts.locale } : {}),
    };
    await this.messagesCollection(issueNumber).doc(record.id).set(record);
    return record;
  }

  async listPendingCreatorMessages(issueNumber: number, opts?: { limit?: number }): Promise<CreatorMessage[]> {
    // Filtered and sorted here rather than in a composite index — the set is tiny.

    // Studio rows are pre-delivered already; this filter is the belt-and-braces guard.
    const snap = await this.messagesCollection(issueNumber).where('deliveredAt', '==', null).get();
    return snap.docs
      .map((doc) => doc.data() as CreatorMessage)
      .filter((message) => !isStudioOrigin(message.origin))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, opts?.limit ?? 10);
  }

  async listCreatorMessages(issueNumber: number, opts?: { limit?: number }): Promise<CreatorMessage[]> {
    // Newest-`limit` kept by slicing from the end after an oldest-first sort, matching
    // the in-memory store; the per-build message count is small enough to read whole.
    const snap = await this.messagesCollection(issueNumber).get();
    return snap.docs
      .map((doc) => doc.data() as CreatorMessage)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(-(opts?.limit ?? 20));
  }

  async markCreatorMessagesDelivered(issueNumber: number, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const at = new Date().toISOString();
    const collection = this.messagesCollection(issueNumber);
    const batch = this.db.batch();
    ids.forEach((id) => batch.set(collection.doc(id), { deliveredAt: at }, { merge: true }));
    await batch.commit();
  }

  private telemetryCollection(dateStr: string) {
    return this.db.collection('telemetry').doc(dateStr).collection(TELEMETRY_COLLECTION);
  }

  private visitCollection(dateStr: string) {
    return this.db.collection('telemetry').doc(dateStr).collection(VISIT_COLLECTION);
  }

  async appendVisitEvents(dateStr: string, events: VisitEvent[]): Promise<void> {
    if (events.length === 0) return;
    const collection = this.visitCollection(dateStr);
    const batch = this.db.batch();
    events.forEach((event) =>
      batch.set(collection.doc(randomUUID()), { ...event, [TELEMETRY_TTL_FIELD]: telemetryExpiresAt(event.at) }),
    );
    await batch.commit();
  }

  async listVisitEvents(
    dateStr: string,
    opts?: { visitId?: string; limit?: number; type?: VisitEvent['type']; excludeType?: VisitEvent['type'] },
  ): Promise<VisitEvent[]> {
    const base = this.visitCollection(dateStr);
    let query: Query<DocumentData> = base;
    if (opts?.visitId !== undefined) query = query.where('visitId', '==', opts.visitId);
    if (opts?.type !== undefined) query = query.where('type', '==', opts.type);
    if (opts?.excludeType !== undefined) query = query.where('type', '!=', opts.excludeType);
    const snap = await query.limit(opts?.limit ?? 1000).get();
    return snap.docs.map((doc) => {
      const event = doc.data();
      delete event[TELEMETRY_TTL_FIELD];
      return event as VisitEvent;
    });
  }

  async appendTelemetryEvents(dateStr: string, events: TelemetryEvent[]): Promise<void> {
    if (events.length === 0) return;
    // One batch per flush: a play session sends a handful of events at a time, well
    // inside Firestore's 500-write batch limit (the route caps a request long before).
    const collection = this.telemetryCollection(dateStr);
    const batch = this.db.batch();
    events.forEach((event) =>
      // `expiresAt` is written as a Date so the driver stores a real Timestamp: a TTL
      // policy ignores a field of any other type, which would leave the row forever.
      batch.set(collection.doc(randomUUID()), { ...event, [TELEMETRY_TTL_FIELD]: telemetryExpiresAt(event.at) }),
    );
    await batch.commit();
  }

  async listTelemetryEvents(dateStr: string, opts?: { slug?: string; limit?: number }): Promise<TelemetryEvent[]> {
    // Equality-only filter plus a limit, so no composite index is needed.
    const base = this.telemetryCollection(dateStr);
    const query = opts?.slug === undefined ? base : base.where('slug', '==', opts.slug);
    const snap = await query.limit(opts?.limit ?? 1000).get();
    return snap.docs.map((doc) => {
      // Retention plumbing stays out of the domain object, so a reader cannot mistake
      // it for signal and the privacy field-allowlist stays exactly the event's fields.
      // `data()` hands back a fresh object per call, so dropping the field is local.
      const event = doc.data();
      delete event[TELEMETRY_TTL_FIELD];
      return event as TelemetryEvent;
    });
  }

  async getUsage(uid: string, dateStr: string): Promise<UsageCounters> {
    const snap = await this.db.collection('usage').doc(uid).collection('counters').doc(dateStr).get();
    return { ...emptyUsageCounters(), ...(snap.data() as Partial<UsageCounters> | undefined) };
  }

  async listRecentlyPublished(limit: number): Promise<SubmissionRecord[]> {
    // orderBy on a single field uses Firestore's automatic index, and documents
    // without publishedAt are excluded by definition — exactly the sample we want.
    const snap = await this.db.collection('submissions').orderBy('publishedAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => d.data() as SubmissionRecord);
  }

  async getSubmissionBySlug(slug: string): Promise<SubmissionRecord | null> {
    const records = await this.listSubmissionsBySlug(slug);
    return records[0] ?? null;
  }

  async listSubmissionsBySlug(slug: string): Promise<SubmissionRecord[]> {
    // Equality-only query — no composite index needed. Result set is bounded by how
    // many jobs have touched one game.
    const snap = await this.db.collection('submissions').where('slug', '==', slug).get();
    return snap.docs.map((d) => d.data() as SubmissionRecord).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getPublishedSubmissionBySlug(slug: string): Promise<SubmissionRecord | null> {
    // Same single-field query, filtered in memory: adding `where('publishedAt','!=',null)`
    // would need a composite index for a result set already bounded by how many jobs have
    // touched one game.
    const snap = await this.db.collection('submissions').where('slug', '==', slug).get();
    const records = snap.docs
      .map((d) => d.data() as SubmissionRecord)
      .filter((record) => record.publishedAt && !record.abandonedAt);
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return records[0] ?? null;
  }

  async listActiveSubmissions(): Promise<SubmissionRecord[]> {
    // 'in' with the non-terminal set would need a composite index and misses docs
    // with no lastNotifiedStatus yet; filtering client-side is simpler and the
    // active set is small (open submissions only).
    const snap = await this.db.collection('submissions').get();
    return snap.docs.map((d) => d.data() as SubmissionRecord).filter(isSweepActive);
  }

  async listSubmissionsMissingSlug(): Promise<SubmissionRecord[]> {
    // Firestore cannot ask for documents where a field is absent, so this is the same
    // full scan and client-side filter as listActiveSubmissions above, for the same
    // reason: the collection is small and the alternative is a sentinel field written
    // to every record just so this one query can exist.
    const snap = await this.db.collection('submissions').get();
    return snap.docs
      .map((d) => d.data() as SubmissionRecord)
      .filter((s) => !s.slug && !s.abandonedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listSubmissionsWithDelivery(): Promise<SubmissionRecord[]> {
    const snap = await this.db.collection('submissions').get();
    return snap.docs
      .map((d) => d.data() as SubmissionRecord)
      .filter((s) => Boolean(s.slug && s.deliveredVersion) && !s.abandonedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listSubmissionsByOwner(ownerUid: string, opts?: { limit?: number }): Promise<SubmissionRecord[]> {
    // Equality-only query (no orderBy) so Firestore needs no composite index; a
    // creator's submission count is small, so sorting here is cheap.
    const snap = await this.db.collection('submissions').where('ownerUid', '==', ownerUid).get();
    const sorted = snap.docs
      .map((d) => d.data() as SubmissionRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return opts?.limit !== undefined ? sorted.slice(0, opts.limit) : sorted;
  }

  async listQueuedSubmissions(): Promise<SubmissionRecord[]> {
    const snap = await this.db.collection('submissions').where('state', '==', 'queued').get();
    return snap.docs.map((d) => d.data() as SubmissionRecord).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async claimDispatchReaperAttempt(issueNumber: number, at: string): Promise<boolean> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const current = snap.data() as SubmissionRecord;
      if (
        current.state !== 'queued' ||
        current.dispatchReaperAttemptedAt ||
        (current.dispatch?.refs?.length ?? 0) > 0
      ) {
        return false;
      }
      tx.set(ref, { dispatchReaperAttemptedAt: at }, { merge: true });
      return true;
    });
  }

  async checkAndIncrementQuota(
    uid: string,
    dateStr: string,
    limit: number,
    action: keyof UsageCounters,
  ): Promise<{ allowed: boolean; current: number; tier: User['tier'] }> {
    const userRef = this.db.collection('users').doc(uid);
    const counterRef = this.db.collection('usage').doc(uid).collection('counters').doc(dateStr);

    return await this.db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const user = userSnap.exists ? (userSnap.data() as User) : null;
      const tier = user?.tier ?? 'standard';

      if (tier === 'blocked') {
        return { allowed: false, current: Infinity, tier };
      }

      if (tier === 'trusted') {
        return { allowed: true, current: 0, tier };
      }

      const counterSnap = await transaction.get(counterRef);
      const data = counterSnap.exists ? counterSnap.data() : {};
      const currentVal = (data?.[action] as number) ?? 0;

      if (currentVal >= limit) {
        return { allowed: false, current: currentVal, tier };
      }

      const nextVal = currentVal + 1;
      transaction.set(counterRef, { [action]: nextVal }, { merge: true });

      return { allowed: true, current: nextVal, tier };
    });
  }

  /**
   * One document, read on a short TTL by every instance and written only by an
   * operator. Deliberately a *document* rather than an environment variable: see
   * CreationLimits. Nothing here is per-user, so there is no query and no index.
   */
  private creationLimitsRef() {
    return this.db.collection('opsConfig').doc('creationLimits');
  }

  private publicPlayConfigRef() {
    return this.db.collection('opsConfig').doc('publicPlay');
  }

  private featuredPoolConfigRef() {
    return this.db.collection('opsConfig').doc('featuredPool');
  }

  /** The day's shared allowance. One document per UTC day, so history is free. */
  private globalUsageRef(dateStr: string) {
    return this.db.collection('globalUsage').doc(dateStr);
  }

  async getCreationLimits(): Promise<CreationLimits | null> {
    const snap = await this.creationLimitsRef().get();
    if (!snap.exists) return null;
    const data = snap.data() as Partial<CreationLimits> | undefined;
    return {
      paused: data?.paused === true,
      globalDailySubmissionCap:
        typeof data?.globalDailySubmissionCap === 'number' ? data.globalDailySubmissionCap : null,
      editingPaused: data?.editingPaused === true,
      remixTracePaused: data?.remixTracePaused === true,
      globalDailyEditCap: typeof data?.globalDailyEditCap === 'number' ? data.globalDailyEditCap : null,
      chatPaused: data?.chatPaused === true,
      globalDailyChatCap: typeof data?.globalDailyChatCap === 'number' ? data.globalDailyChatCap : null,
      tabCompletePaused: data?.tabCompletePaused === true,
      globalDailyTabCompleteTokenCap:
        typeof data?.globalDailyTabCompleteTokenCap === 'number' ? data.globalDailyTabCompleteTokenCap : null,
      managedBuilderMode:
        data?.managedBuilderMode === 'off' || data?.managedBuilderMode === 'coming_soon'
          ? data.managedBuilderMode
          : 'auto',
      managedAgentVendorOverride:
        typeof data?.managedAgentVendorOverride === 'string' &&
        MANAGED_AGENT_VENDORS.includes(data.managedAgentVendorOverride)
          ? data.managedAgentVendorOverride
          : null,
      managedDailyCap: typeof data?.managedDailyCap === 'number' ? data.managedDailyCap : null,
      managedDailyUserCap: typeof data?.managedDailyUserCap === 'number' ? data.managedDailyUserCap : null,
      seedingMode: data?.seedingMode === 'off' ? 'off' : 'auto',
      seedProviderOverride: typeof data?.seedProviderOverride === 'string' ? data.seedProviderOverride : null,
      ...(data?.updatedAt ? { updatedAt: data.updatedAt } : {}),
      ...(data?.updatedBy ? { updatedBy: data.updatedBy } : {}),
    };
  }

  async setCreationLimits(
    patch: Partial<Omit<CreationLimits, 'updatedAt'>>,
    updatedBy: string,
  ): Promise<CreationLimits> {
    const ref = this.creationLimitsRef();
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const existing = snap.exists ? (snap.data() as Partial<CreationLimits>) : {};
      const merged: CreationLimits = {
        paused: patch.paused ?? existing.paused ?? false,
        globalDailySubmissionCap:
          patch.globalDailySubmissionCap !== undefined
            ? patch.globalDailySubmissionCap
            : (existing.globalDailySubmissionCap ?? null),
        editingPaused: patch.editingPaused ?? existing.editingPaused ?? false,
        globalDailyEditCap:
          patch.globalDailyEditCap !== undefined ? patch.globalDailyEditCap : (existing.globalDailyEditCap ?? null),
        chatPaused: patch.chatPaused ?? existing.chatPaused ?? false,
        globalDailyChatCap:
          patch.globalDailyChatCap !== undefined ? patch.globalDailyChatCap : (existing.globalDailyChatCap ?? null),
        tabCompletePaused: patch.tabCompletePaused ?? existing.tabCompletePaused ?? false,
        globalDailyTabCompleteTokenCap:
          patch.globalDailyTabCompleteTokenCap !== undefined
            ? patch.globalDailyTabCompleteTokenCap
            : (existing.globalDailyTabCompleteTokenCap ?? null),
        managedBuilderMode: patch.managedBuilderMode ?? existing.managedBuilderMode ?? 'auto',
        managedAgentVendorOverride:
          patch.managedAgentVendorOverride !== undefined
            ? patch.managedAgentVendorOverride
            : (existing.managedAgentVendorOverride ?? null),
        managedDailyCap:
          patch.managedDailyCap !== undefined ? patch.managedDailyCap : (existing.managedDailyCap ?? null),
        managedDailyUserCap:
          patch.managedDailyUserCap !== undefined ? patch.managedDailyUserCap : (existing.managedDailyUserCap ?? null),
        seedingMode: patch.seedingMode ?? existing.seedingMode ?? 'auto',
        seedProviderOverride:
          patch.seedProviderOverride !== undefined
            ? patch.seedProviderOverride
            : (existing.seedProviderOverride ?? null),
        updatedAt: new Date().toISOString(),
        updatedBy,
      };
      transaction.set(ref, merged);
      return merged;
    });
  }

  async getPublicPlayConfig(): Promise<PublicPlayConfig | null> {
    const snap = await this.publicPlayConfigRef().get();
    if (!snap.exists) return null;
    const data = snap.data() as Partial<PublicPlayConfig> | undefined;
    const slugs = normalizePublicPlaySlugs(data?.slugs);
    return {
      slugs,
      ...(data?.updatedAt ? { updatedAt: data.updatedAt } : {}),
      ...(data?.updatedBy ? { updatedBy: data.updatedBy } : {}),
    };
  }

  async setPublicPlaySlugs(slugs: string[], updatedBy: string): Promise<PublicPlayConfig> {
    const config: PublicPlayConfig = {
      slugs: [...slugs],
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    await this.publicPlayConfigRef().set(config);
    return { ...config, slugs: [...config.slugs] };
  }

  async getFeaturedPoolConfig(): Promise<FeaturedPoolConfig | null> {
    const snap = await this.featuredPoolConfigRef().get();
    if (!snap.exists) return null;
    const data = snap.data() as Partial<FeaturedPoolConfig> | undefined;
    const slugs = normalizeFeaturedPoolSlugs(data?.slugs);
    return {
      slugs,
      ...(data?.updatedAt ? { updatedAt: data.updatedAt } : {}),
      ...(data?.updatedBy ? { updatedBy: data.updatedBy } : {}),
    };
  }

  async setFeaturedPoolSlugs(slugs: string[], updatedBy: string): Promise<FeaturedPoolConfig> {
    const config: FeaturedPoolConfig = {
      slugs: [...slugs],
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    await this.featuredPoolConfigRef().set(config);
    return { ...config, slugs: [...config.slugs] };
  }

  async getGlobalSubmissionCount(dateStr: string): Promise<number> {
    const snap = await this.globalUsageRef(dateStr).get();
    const value = snap.data()?.submissions;
    return typeof value === 'number' ? value : 0;
  }

  async getGlobalTabCompleteTokenCount(dateStr: string): Promise<number> {
    const snap = await this.globalUsageRef(dateStr).get();
    const value = snap.data()?.tabCompleteTokens;
    return typeof value === 'number' ? value : 0;
  }

  async checkAndIncrementGlobalSubmissions(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const ref = this.globalUsageRef(dateStr);
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const value = snap.data()?.submissions;
      const current = typeof value === 'number' ? value : 0;

      if (current >= limit) {
        return { allowed: false, current };
      }

      const nextVal = current + 1;
      transaction.set(ref, { submissions: nextVal }, { merge: true });
      return { allowed: true, current: nextVal };
    });
  }

  async checkAndIncrementGlobalEdits(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }> {
    const ref = this.globalUsageRef(dateStr);
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const value = snap.data()?.edits;
      const current = typeof value === 'number' ? value : 0;

      if (current >= limit) {
        return { allowed: false, current };
      }

      const nextVal = current + 1;
      transaction.set(ref, { edits: nextVal }, { merge: true });
      return { allowed: true, current: nextVal };
    });
  }

  async checkAndIncrementGlobalChats(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }> {
    const ref = this.globalUsageRef(dateStr);
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const value = snap.data()?.chats;
      const current = typeof value === 'number' ? value : 0;

      if (current >= limit) {
        return { allowed: false, current };
      }

      const nextVal = current + 1;
      transaction.set(ref, { chats: nextVal }, { merge: true });
      return { allowed: true, current: nextVal };
    });
  }

  async checkAndIncrementGlobalTabCompleteTokens(
    dateStr: string,
    tokens: number,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const ref = this.globalUsageRef(dateStr);
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const value = snap.data()?.tabCompleteTokens;
      const current = typeof value === 'number' ? value : 0;
      const nextVal = current + tokens;

      // Refuse a reservation that would itself cross the cap.
      if (nextVal > limit) {
        return { allowed: false, current };
      }

      transaction.set(ref, { tabCompleteTokens: nextVal }, { merge: true });
      return { allowed: true, current: nextVal };
    });
  }

  async adjustGlobalTabCompleteTokens(dateStr: string, delta: number): Promise<number> {
    const ref = this.globalUsageRef(dateStr);
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const value = snap.data()?.tabCompleteTokens;
      const current = typeof value === 'number' ? value : 0;
      const next = Math.max(0, current + delta);
      transaction.set(ref, { tabCompleteTokens: next }, { merge: true });
      return next;
    });
  }

  async getGlobalManagedBuildCount(dateStr: string): Promise<number> {
    const snap = await this.globalUsageRef(dateStr).get();
    const value = snap.data()?.managedBuilds;
    return typeof value === 'number' ? value : 0;
  }

  async checkAndIncrementGlobalManagedBuilds(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    const ref = this.globalUsageRef(dateStr);
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const value = snap.data()?.managedBuilds;
      const current = typeof value === 'number' ? value : 0;

      if (current >= limit) {
        return { allowed: false, current };
      }

      const nextVal = current + 1;
      transaction.set(ref, { managedBuilds: nextVal }, { merge: true });
      return { allowed: true, current: nextVal };
    });
  }

  async upsertWaitlistEntry(entry: {
    uid: string;
    email?: string;
    name?: string;
    locale?: string;
  }): Promise<WaitlistEntry> {
    const now = new Date().toISOString();
    const docRef = this.db.collection('waitlist').doc(entry.uid);
    const snap = await docRef.get();
    const existing = snap.exists ? (snap.data() as WaitlistEntry) : null;
    // Same normalisation as InMemoryStore: email queries are case-sensitive in
    // Firestore, and setWaitlistStatusByEmail / isWaitlistApproved look up the
    // lowercased form.
    const rawEmail = entry.email !== undefined ? entry.email : existing?.email;

    const record: WaitlistEntry = {
      uid: entry.uid,
      email: rawEmail !== undefined ? rawEmail.toLowerCase() : undefined,
      name: entry.name,
      requestedAt: now,
      locale: entry.locale,
      status: existing?.status ?? 'pending',
    };
    await docRef.set(stripUndefined(record), { merge: true });
    return record;
  }

  async getWaitlistEntry(uid: string): Promise<WaitlistEntry | null> {
    const snap = await this.db.collection('waitlist').doc(uid).get();
    if (!snap.exists) return null;
    return snap.data() as WaitlistEntry;
  }

  async isWaitlistApproved(uid: string, email?: string): Promise<boolean> {
    const uidSnap = await this.db.collection('waitlist').doc(uid).get();
    if (uidSnap.exists && (uidSnap.data() as WaitlistEntry).status === 'approved') {
      return true;
    }
    if (email) {
      const emailLower = email.toLowerCase();
      const emailQuery = await this.db
        .collection('waitlist')
        .where('email', '==', emailLower)
        .where('status', '==', 'approved')
        .limit(1)
        .get();
      if (!emailQuery.empty) return true;
    }
    return false;
  }

  async setWaitlistStatus(uid: string, status: WaitlistStatus): Promise<WaitlistEntry | null> {
    const docRef = this.db.collection('waitlist').doc(uid);
    const snap = await docRef.get();
    if (!snap.exists) return null;
    await docRef.update({ status });
    const updatedSnap = await docRef.get();
    return updatedSnap.data() as WaitlistEntry;
  }

  async listWaitlistEntries(opts?: { status?: WaitlistStatus; limit?: number }): Promise<WaitlistEntry[]> {
    // Equality-only (no orderBy) so a status filter needs no composite index; sort and
    // slice in memory. The waitlist stays small at closed-beta scale, and the same
    // posture as `listAccessTokens` keeps an operator page from depending on a new
    // index that only fails in production.
    const limit = opts?.limit ?? 200;
    const collection = this.db.collection('waitlist');
    const snap =
      opts?.status === undefined ? await collection.get() : await collection.where('status', '==', opts.status).get();
    const rows = snap.docs.map((doc) => doc.data() as WaitlistEntry);
    rows.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return rows.slice(0, limit);
  }

  async countWaitlistEntries(status?: WaitlistStatus): Promise<number> {
    const collection = this.db.collection('waitlist');
    const query = status === undefined ? collection : collection.where('status', '==', status);
    const snap = await query.count().get();
    return snap.data().count;
  }

  async setWaitlistStatusByEmail(email: string, status: WaitlistStatus): Promise<WaitlistEntry> {
    const emailLower = email.toLowerCase();
    const querySnap = await this.db.collection('waitlist').where('email', '==', emailLower).limit(1).get();
    if (!querySnap.empty) {
      const doc = querySnap.docs[0]!;
      await doc.ref.update({ status });
      return { ...(doc.data() as WaitlistEntry), status, email: emailLower };
    }
    // Rows written before email was normalised may still hold mixed case; find and
    // heal them so an approve does not mint a duplicate `email:` doc beside the
    // original join. Cheap at closed-beta scale (one collection read, operator-only).
    const legacySnap = await this.db.collection('waitlist').get();
    const legacy = legacySnap.docs.find((doc) => (doc.data() as WaitlistEntry).email?.toLowerCase() === emailLower);
    if (legacy) {
      await legacy.ref.update({ status, email: emailLower });
      return { ...(legacy.data() as WaitlistEntry), status, email: emailLower };
    }
    const now = new Date().toISOString();
    const created: WaitlistEntry = {
      uid: `email:${emailLower}`,
      email: emailLower,
      requestedAt: now,
      status,
    };
    await this.db.collection('waitlist').doc(created.uid).set(stripUndefined(created));
    return created;
  }

  async recordBetaInviteAdmission(entry: {
    uid: string;
    email?: string;
    name?: string;
    locale?: string;
  }): Promise<WaitlistEntry> {
    const docRef = this.db.collection('waitlist').doc(entry.uid);
    const snap = await docRef.get();
    const existing = snap.exists ? (snap.data() as WaitlistEntry) : null;
    const rawEmail = entry.email !== undefined ? entry.email : existing?.email;

    const record: WaitlistEntry = {
      uid: entry.uid,
      email: rawEmail !== undefined ? rawEmail.toLowerCase() : undefined,
      name: entry.name ?? existing?.name,
      requestedAt: existing?.requestedAt ?? new Date().toISOString(),
      locale: entry.locale ?? existing?.locale,
      status: 'approved',
    };
    await docRef.set(stripUndefined(record), { merge: true });
    return record;
  }

  async createBetaInvite(createdByUid: string): Promise<CreatedBetaInvite> {
    const code = randomBytes(BETA_INVITE_CODE_BYTES).toString('base64url');
    const invite: BetaInvite = {
      id: randomUUID(),
      codeHash: hashBetaInviteCode(code),
      createdAt: new Date().toISOString(),
      createdByUid,
      status: 'available',
    };
    await this.db.collection('betaInvites').doc(invite.id).set(stripUndefined(invite));
    return { invite, code };
  }

  async listBetaInvites(opts?: { limit?: number }): Promise<BetaInvite[]> {
    const limit = opts?.limit ?? 200;
    const snap = await this.db.collection('betaInvites').get();
    return snap.docs
      .map((doc) => doc.data() as BetaInvite)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async claimBetaInvite(code: string, uid: string): Promise<ClaimBetaInviteResult> {
    const codeHash = hashBetaInviteCode(code);
    const querySnap = await this.db.collection('betaInvites').where('codeHash', '==', codeHash).limit(1).get();
    if (querySnap.empty) return { ok: false, reason: 'not_found' };

    const docRef = querySnap.docs[0]!.ref;
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists) return { ok: false, reason: 'not_found' };
      const invite = snap.data() as BetaInvite;
      if (invite.status === 'revoked') return { ok: false, reason: 'revoked' };
      if (invite.status === 'claimed') {
        return invite.claimedUid === uid ? { ok: true, invite } : { ok: false, reason: 'claimed' };
      }

      const claimed: BetaInvite = {
        ...invite,
        status: 'claimed',
        claimedAt: new Date().toISOString(),
        claimedUid: uid,
      };
      transaction.set(docRef, stripUndefined(claimed), { merge: true });
      return { ok: true, invite: claimed };
    });
  }

  async revokeBetaInvite(id: string, revokedByUid: string): Promise<BetaInvite | null> {
    const docRef = this.db.collection('betaInvites').doc(id);
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists) return null;
      const invite = snap.data() as BetaInvite;
      if (invite.status !== 'available') return null;

      const revoked: BetaInvite = {
        ...invite,
        status: 'revoked',
        revokedAt: new Date().toISOString(),
        revokedByUid,
      };
      transaction.set(docRef, stripUndefined(revoked), { merge: true });
      return revoked;
    });
  }

  private notificationRef(uid: string, id: string) {
    return this.db.collection('users').doc(uid).collection('notifications').doc(id);
  }

  async createNotification(
    uid: string,
    notification: Omit<StoredNotification, 'readAt' | 'emailedAt'> & { createdAt?: string },
  ): Promise<{ created: boolean; notification: StoredNotification }> {
    const docRef = this.notificationRef(uid, notification.id);
    return await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (snap.exists) {
        return { created: false, notification: snap.data() as StoredNotification };
      }
      const record: StoredNotification = {
        id: notification.id,
        type: notification.type,
        createdAt: notification.createdAt ?? new Date().toISOString(),
        readAt: null,
        emailedAt: null,
        titleKey: notification.titleKey,
        bodyKey: notification.bodyKey,
        params: notification.params,
        link: notification.link,
      };
      tx.set(docRef, record);
      return { created: true, notification: record };
    });
  }

  async listNotifications(uid: string, opts?: { limit?: number }): Promise<StoredNotification[]> {
    const query = this.db
      .collection('users')
      .doc(uid)
      .collection('notifications')
      .orderBy('createdAt', 'desc')
      .limit(opts?.limit ?? 20);
    const snap = await query.get();
    return snap.docs.map((d) => d.data() as StoredNotification);
  }

  async markNotificationsRead(uid: string, ids: string[] | 'all'): Promise<void> {
    const now = new Date().toISOString();
    const col = this.db.collection('users').doc(uid).collection('notifications');
    if (ids === 'all') {
      const unread = await col.where('readAt', '==', null).get();
      const batch = this.db.batch();
      unread.docs.forEach((d) => batch.update(d.ref, { readAt: now }));
      await batch.commit();
      return;
    }
    const batch = this.db.batch();
    ids.forEach((id) => batch.set(col.doc(id), { readAt: now }, { merge: true }));
    await batch.commit();
  }

  async deleteNotifications(uid: string, ids: string[] | 'all'): Promise<void> {
    const col = this.db.collection('users').doc(uid).collection('notifications');
    if (ids === 'all') {
      const snap = await col.get();
      if (snap.empty) return;
      const batch = this.db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      return;
    }
    if (ids.length === 0) return;
    const batch = this.db.batch();
    ids.forEach((id) => batch.delete(col.doc(id)));
    await batch.commit();
  }

  async markNotificationEmailed(uid: string, id: string, at?: string): Promise<void> {
    await this.notificationRef(uid, id).set({ emailedAt: at ?? new Date().toISOString() }, { merge: true });
  }

  private pushSubRef(uid: string, endpoint: string) {
    return this.db.collection('users').doc(uid).collection('pushSubscriptions').doc(pushSubscriptionId(endpoint));
  }

  async savePushSubscription(uid: string, subscription: Omit<PushSubscriptionRecord, 'createdAt'>): Promise<void> {
    const record: PushSubscriptionRecord = {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      createdAt: new Date().toISOString(),
    };
    await this.pushSubRef(uid, subscription.endpoint).set(record);
  }

  async listPushSubscriptions(uid: string): Promise<PushSubscriptionRecord[]> {
    const snap = await this.db.collection('users').doc(uid).collection('pushSubscriptions').get();
    return snap.docs.map((d) => d.data() as PushSubscriptionRecord);
  }

  async deletePushSubscription(uid: string, endpoint: string): Promise<void> {
    await this.pushSubRef(uid, endpoint).delete();
  }

  private gameRef(slug: string) {
    return this.db.collection('games').doc(slug);
  }

  private voteRef(slug: string, uid: string) {
    return this.gameRef(slug).collection('votes').doc(uid);
  }

  private feedbackCollection(slug: string) {
    return this.gameRef(slug).collection('playerFeedback');
  }

  private followerRef(slug: string, uid: string) {
    return this.gameRef(slug).collection('followers').doc(uid);
  }

  private static readVoteCounts(data: DocumentData | undefined): GameVoteCounts {
    return { up: (data?.votesUp as number | undefined) ?? 0, down: (data?.votesDown as number | undefined) ?? 0 };
  }

  async getVote(slug: string, uid: string): Promise<VoteValue | null> {
    const snap = await this.voteRef(slug, uid).get();
    return snap.exists ? ((snap.data()?.value as VoteValue | undefined) ?? null) : null;
  }

  async castVote(slug: string, uid: string, value: VoteValue): Promise<GameVoteCounts> {
    const gameRef = this.gameRef(slug);
    const voteRef = this.voteRef(slug, uid);
    return await this.db.runTransaction(async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      const voteSnap = await transaction.get(voteRef);
      const counts = FirestoreStore.readVoteCounts(gameSnap.data());
      const previous = voteSnap.exists ? (voteSnap.data()?.value as VoteValue | undefined) : undefined;

      // Repeating the same vote must not double-count it; only a genuine change
      // touches the tally.
      if (previous !== value) {
        if (previous) counts[previous] = Math.max(0, counts[previous] - 1);
        counts[value] += 1;
        transaction.set(gameRef, { votesUp: counts.up, votesDown: counts.down }, { merge: true });
      }
      transaction.set(voteRef, { value, updatedAt: new Date().toISOString() });
      return counts;
    });
  }

  async clearVote(slug: string, uid: string): Promise<GameVoteCounts> {
    const gameRef = this.gameRef(slug);
    const voteRef = this.voteRef(slug, uid);
    return await this.db.runTransaction(async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      const voteSnap = await transaction.get(voteRef);
      const counts = FirestoreStore.readVoteCounts(gameSnap.data());
      if (!voteSnap.exists) return counts;

      const previous = voteSnap.data()?.value as VoteValue | undefined;
      if (previous) counts[previous] = Math.max(0, counts[previous] - 1);
      transaction.delete(voteRef);
      transaction.set(gameRef, { votesUp: counts.up, votesDown: counts.down }, { merge: true });
      return counts;
    });
  }

  async setGameFollow(slug: string, uid: string, at: string): Promise<number> {
    const gameRef = this.gameRef(slug);
    const followerRef = this.followerRef(slug, uid);
    return await this.db.runTransaction(async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      const followerSnap = await transaction.get(followerRef);
      const count = (gameSnap.data()?.followers as number | undefined) ?? 0;
      // Following twice is not two followers — only a genuine change moves the tally.
      if (followerSnap.exists) return count;
      transaction.set(followerRef, { followedAt: at });
      transaction.set(gameRef, { followers: count + 1 }, { merge: true });
      return count + 1;
    });
  }

  async clearGameFollow(slug: string, uid: string): Promise<number> {
    const gameRef = this.gameRef(slug);
    const followerRef = this.followerRef(slug, uid);
    return await this.db.runTransaction(async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      const followerSnap = await transaction.get(followerRef);
      const count = (gameSnap.data()?.followers as number | undefined) ?? 0;
      if (!followerSnap.exists) return count;
      const next = Math.max(0, count - 1);
      transaction.delete(followerRef);
      transaction.set(gameRef, { followers: next }, { merge: true });
      return next;
    });
  }

  async isFollowingGame(slug: string, uid: string): Promise<boolean> {
    const snap = await this.followerRef(slug, uid).get();
    return snap.exists;
  }

  async countGameFollowers(slug: string): Promise<number> {
    const snap = await this.gameRef(slug).get();
    return (snap.data()?.followers as number | undefined) ?? 0;
  }

  async listGameFollowers(slug: string, opts?: { limit?: number }): Promise<string[]> {
    let query = this.gameRef(slug).collection('followers').orderBy('followedAt', 'desc');
    if (opts?.limit) query = query.limit(opts.limit);
    const snap = await query.get();
    return snap.docs.map((doc) => doc.id);
  }

  async getVoteCounts(slug: string): Promise<GameVoteCounts> {
    const snap = await this.gameRef(slug).get();
    return FirestoreStore.readVoteCounts(snap.data());
  }

  // Under the player, keyed by slug — see GameSaveRecord for why this is not
  // `games/{slug}/saves/{uid}` the way votes are.
  private gameSaveRef(uid: string, slug: string) {
    return this.db.collection('users').doc(uid).collection('gameSaves').doc(slug);
  }

  async getGameSave(uid: string, slug: string): Promise<GameSaveRecord | null> {
    const snap = await this.gameSaveRef(uid, slug).get();
    if (!snap.exists) return null;
    const data = snap.data() ?? {};
    return {
      slug,
      data: typeof data.data === 'string' ? data.data : '',
      version: typeof data.version === 'number' ? data.version : 0,
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
    };
  }

  async putGameSave(uid: string, slug: string, data: string, version: number): Promise<GameSaveRecord> {
    const record: GameSaveRecord = { slug, data, version, updatedAt: new Date().toISOString() };
    // `set` without merge: a save is a whole snapshot of the player's progress, and
    // merging would leave fields from an older shape alive beside a newer one — a
    // state the game never actually wrote.
    await this.gameSaveRef(uid, slug).set({ data, version, updatedAt: record.updatedAt });
    return record;
  }

  async deleteGameSave(uid: string, slug: string): Promise<void> {
    await this.gameSaveRef(uid, slug).delete();
  }

  async listGameSaves(uid: string): Promise<GameSaveRecord[]> {
    const snap = await this.db.collection('users').doc(uid).collection('gameSaves').get();
    return snap.docs.map((doc) => {
      const data = doc.data();
      return {
        slug: doc.id,
        data: typeof data.data === 'string' ? data.data : '',
        version: typeof data.version === 'number' ? data.version : 0,
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
      };
    });
  }

  async deleteGameSaves(uid: string): Promise<number> {
    // `listDocuments` rather than `get`: this only needs the references to delete, and
    // a person's saves may be tens of kilobytes each that nobody is going to read.
    const refs = await this.db.collection('users').doc(uid).collection('gameSaves').listDocuments();
    if (refs.length === 0) return 0;

    // Chunked batches rather than a delete per document, for the same reason
    // `deletePlayerFeedbackByUid` uses them: this runs inside an erasure request an
    // operator has already accepted, and somebody who plays a lot of games is exactly
    // the person whose deletion would otherwise be a long sequence of round trips.
    // 400 per batch leaves headroom under Firestore's 500-write limit.
    for (let index = 0; index < refs.length; index += 400) {
      const batch = this.db.batch();
      for (const ref of refs.slice(index, index + 400)) batch.delete(ref);
      await batch.commit();
    }
    return refs.length;
  }

  // Under the creator, keyed by slug — one private draft per (creator, game),
  // same placement reasoning as gameSaves.
  private editorDraftRef(uid: string, slug: string) {
    return this.db.collection('users').doc(uid).collection('editorDrafts').doc(slug);
  }

  async getEditorDraft(uid: string, slug: string): Promise<EditorDraftRecord | null> {
    const snap = await this.editorDraftRef(uid, slug).get();
    if (!snap.exists) return null;
    const data = snap.data() ?? {};
    return {
      slug,
      content: typeof data.content === 'string' ? data.content : '',
      revision: typeof data.revision === 'number' ? data.revision : 0,
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
    };
  }

  async putEditorDraft(
    uid: string,
    slug: string,
    content: string,
    expectedRevision?: number,
  ): Promise<{ conflict: false; record: EditorDraftRecord } | { conflict: true; revision: number }> {
    const ref = this.editorDraftRef(uid, slug);
    // A transaction, not a read followed by a `set`: two tabs saving against the
    // same base revision would both read it, both write, and both be told they
    // won, with one edit silently gone. Compare and increment together or not
    // at all.
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? (snap.data() ?? {}) : {};
      const current = typeof data.revision === 'number' ? data.revision : 0;
      if (expectedRevision !== undefined && current !== expectedRevision) {
        return { conflict: true as const, revision: current };
      }
      const record: EditorDraftRecord = {
        slug,
        content,
        revision: current + 1,
        updatedAt: new Date().toISOString(),
      };
      // `set` without merge, like saves: a draft is a whole snapshot of the content.
      tx.set(ref, { content, revision: record.revision, updatedAt: record.updatedAt });
      return { conflict: false as const, record };
    });
  }

  async deleteEditorDraft(uid: string, slug: string): Promise<void> {
    await this.editorDraftRef(uid, slug).delete();
  }

  async listEditorDrafts(uid: string): Promise<EditorDraftRecord[]> {
    const snap = await this.db.collection('users').doc(uid).collection('editorDrafts').get();
    return snap.docs.map((doc) => {
      const data = doc.data();
      return {
        slug: doc.id,
        content: typeof data.content === 'string' ? data.content : '',
        revision: typeof data.revision === 'number' ? data.revision : 0,
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
      };
    });
  }

  async deleteEditorDrafts(uid: string): Promise<number> {
    const refs = await this.db.collection('users').doc(uid).collection('editorDrafts').listDocuments();
    if (refs.length === 0) return 0;
    for (let index = 0; index < refs.length; index += 400) {
      const batch = this.db.batch();
      for (const ref of refs.slice(index, index + 400)) batch.delete(ref);
      await batch.commit();
    }
    return refs.length;
  }

  private playAffinityRef(uid: string, slug: string) {
    return this.db.collection('users').doc(uid).collection('playAffinity').doc(slug);
  }

  async recordPlayAffinity(uid: string, slug: string, at?: string): Promise<PlayAffinityRecord> {
    const when = at ?? new Date().toISOString();
    const ref = this.playAffinityRef(uid, slug);
    const record = await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? snap.data() : null;
      const openCount = Math.min(
        MAX_PLAY_AFFINITY_OPENS,
        (typeof existing?.openCount === 'number' ? existing.openCount : 0) + 1,
      );
      const next: PlayAffinityRecord = { slug, openCount, lastPlayedAt: when };
      tx.set(ref, { openCount: next.openCount, lastPlayedAt: next.lastPlayedAt });
      return next;
    });

    // Trim outside the transaction: the ceiling is a soft bound, and racing two opens
    // past 100 is harmless compared to holding a transaction across a collection list.
    const col = this.db.collection('users').doc(uid).collection('playAffinity');
    const listed = await col.get();
    if (listed.size > MAX_PLAY_AFFINITY_GAMES) {
      const oldest = listed.docs
        .filter((doc) => doc.id !== slug)
        .map((doc) => ({
          id: doc.id,
          lastPlayedAt: typeof doc.data().lastPlayedAt === 'string' ? doc.data().lastPlayedAt : '',
        }))
        .sort((a, b) => a.lastPlayedAt.localeCompare(b.lastPlayedAt) || a.id.localeCompare(b.id));
      const overflow = listed.size - MAX_PLAY_AFFINITY_GAMES;
      for (let index = 0; index < overflow; index += 400) {
        const batch = this.db.batch();
        for (const entry of oldest.slice(index, Math.min(index + 400, overflow))) {
          batch.delete(col.doc(entry.id));
        }
        await batch.commit();
      }
    }

    return record;
  }

  async listPlayAffinity(uid: string): Promise<PlayAffinityRecord[]> {
    const snap = await this.db.collection('users').doc(uid).collection('playAffinity').get();
    return snap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          slug: doc.id,
          openCount: typeof data.openCount === 'number' ? data.openCount : 0,
          lastPlayedAt: typeof data.lastPlayedAt === 'string' ? data.lastPlayedAt : '',
        };
      })
      .sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt) || a.slug.localeCompare(b.slug));
  }

  async deletePlayAffinity(uid: string): Promise<number> {
    const refs = await this.db.collection('users').doc(uid).collection('playAffinity').listDocuments();
    if (refs.length === 0) return 0;
    for (let index = 0; index < refs.length; index += 400) {
      const batch = this.db.batch();
      for (const ref of refs.slice(index, index + 400)) batch.delete(ref);
      await batch.commit();
    }
    return refs.length;
  }

  // Worlds are top-level, not under a user: a world belongs to a game and outlives
  // every individual player of it. `worldId` is opaque (today it equals the slug), so
  // per-creator or seasonal worlds later are a new id rather than a migration.
  private worldCollection(worldId: string) {
    return this.db.collection('worlds').doc(worldId).collection('worldEntries');
  }

  private toWorldEntry(id: string, data: Record<string, unknown>): WorldEntryRecord {
    const fields = data.fields;
    return {
      key: id,
      fields: (fields && typeof fields === 'object' && !Array.isArray(fields)
        ? fields
        : {}) as WorldEntryRecord['fields'],
      ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : '',
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
    };
  }

  async listWorldEntries(worldId: string): Promise<WorldEntryRecord[]> {
    const snap = await this.worldCollection(worldId).get();
    return snap.docs.map((doc) => this.toWorldEntry(doc.id, doc.data()));
  }

  async getWorldEntry(worldId: string, key: string): Promise<WorldEntryRecord | null> {
    const snap = await this.worldCollection(worldId).doc(key).get();
    if (!snap.exists) return null;
    return this.toWorldEntry(key, snap.data() ?? {});
  }

  async putWorldEntry(options: {
    worldId: string;
    key: string;
    uid: string;
    fields: Record<string, string | number | boolean>;
    maxPerPlayer: number;
    maxEntries: number;
  }): Promise<{ ok: true; entry: WorldEntryRecord } | { ok: false; reason: 'conflict' | 'quota' | 'full' }> {
    const ref = this.worldCollection(options.worldId).doc(options.key);
    // A transaction, because both rules this enforces are exactly the kind that a
    // check-then-write silently loses: two players claiming the same empty plot in the
    // same second, and one player with two tabs open spending their last quota slot
    // twice. Reading inside the transaction is what makes the decision binding.
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? this.toWorldEntry(options.key, snap.data() ?? {}) : null;
      if (existing && existing.ownerUid !== options.uid) return { ok: false as const, reason: 'conflict' as const };

      if (!existing) {
        // Counted only when claiming a new key. Re-editing an entry the player already
        // owns cannot change either total, and charging a read for it would make the
        // common case — a player tidying their own plot — the expensive one.
        const [owned, total] = await Promise.all([
          tx.get(this.worldCollection(options.worldId).where('ownerUid', '==', options.uid).count()),
          tx.get(this.worldCollection(options.worldId).count()),
        ]);
        if (total.data().count >= options.maxEntries) return { ok: false as const, reason: 'full' as const };
        if (owned.data().count >= options.maxPerPlayer) return { ok: false as const, reason: 'quota' as const };
      }

      const now = new Date().toISOString();
      const entry: WorldEntryRecord = {
        key: options.key,
        fields: options.fields,
        ownerUid: options.uid,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      // No merge: `fields` is the whole entry, and merging would leave a value from a
      // shape the game has since stopped writing alive next to the current one.
      tx.set(ref, {
        fields: entry.fields,
        ownerUid: entry.ownerUid,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      });
      return { ok: true as const, entry };
    });
  }

  async deleteWorldEntry(worldId: string, key: string, uid: string): Promise<boolean> {
    const ref = this.worldCollection(worldId).doc(key);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      // Ownership re-read inside the transaction: the route checked it too, but only
      // this read is ordered against a concurrent write to the same key.
      if (this.toWorldEntry(key, snap.data() ?? {}).ownerUid !== uid) return false;
      tx.delete(ref);
      return true;
    });
  }

  async countWorldEntries(worldId: string, uid: string): Promise<number> {
    const snap = await this.worldCollection(worldId).where('ownerUid', '==', uid).count().get();
    return snap.data().count;
  }

  /**
   * A collection-group query, because erasure has to reach into every world at once and
   * there is no list of which ones a person touched. Needs the COLLECTION_GROUP index on
   * `worldEntries.ownerUid` provisioned in infra/setup-gcp.sh — Firestore's automatic
   * single-field indexes are COLLECTION scope only, so this is the one query here that
   * does not get an index for free.
   */
  private worldEntriesOwnedBy(uid: string) {
    return this.db.collectionGroup('worldEntries').where('ownerUid', '==', uid);
  }

  async listWorldsForUser(uid: string): Promise<string[]> {
    const snap = await this.worldEntriesOwnedBy(uid).get();
    const touched = new Set<string>();
    for (const doc of snap.docs) {
      // worlds/{worldId}/worldEntries/{key} — the grandparent names the world.
      const worldId = doc.ref.parent.parent?.id;
      if (worldId) touched.add(worldId);
    }
    return [...touched].sort();
  }

  async deleteWorldEntriesForUser(uid: string): Promise<number> {
    const snap = await this.worldEntriesOwnedBy(uid).get();
    if (snap.empty) return 0;
    // Chunked batches, same as `deleteGameSaves`: this runs inside an erasure request
    // an operator has already accepted, and somebody who built in several worlds is
    // exactly the person whose deletion would otherwise be a long run of round trips.
    // 400 per batch leaves headroom under Firestore's 500-write limit.
    for (let index = 0; index < snap.docs.length; index += 400) {
      const batch = this.db.batch();
      for (const doc of snap.docs.slice(index, index + 400)) batch.delete(doc.ref);
      await batch.commit();
    }
    return snap.docs.length;
  }

  async addPlayerFeedback(slug: string, uid: string, text: string): Promise<PlayerFeedbackRecord> {
    const createdAt = new Date().toISOString();
    const ref = this.feedbackCollection(slug).doc();
    const record: PlayerFeedbackRecord = { id: ref.id, uid, text, createdAt };
    await ref.set({ uid, text, createdAt });
    return record;
  }

  async listPlayerFeedback(slug: string, opts?: { limit?: number }): Promise<PlayerFeedbackRecord[]> {
    // Unbounded by default because the erase preview and the operator read both want
    // everything; the sweep passes a limit so one game with thousands of notes cannot
    // dominate a nightly job's read budget.
    const ordered = this.feedbackCollection(slug).orderBy('createdAt', 'desc');
    const snap = await (opts?.limit === undefined ? ordered : ordered.limit(opts.limit)).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PlayerFeedbackRecord, 'id'>) }));
  }

  async countPlayerFeedback(slug: string): Promise<number> {
    const snap = await this.feedbackCollection(slug).count().get();
    return snap.data().count;
  }

  private gameAssessmentsCollection() {
    return this.db.collection(GAME_ASSESSMENTS_COLLECTION);
  }

  async upsertGameAssessment(
    input: Omit<GameAssessment, 'id' | 'createdAt' | 'updatedAt' | 'gameVersion' | 'resolution'> & {
      createdAt?: string;
      gameVersion?: string | null;
    },
  ): Promise<GameAssessment> {
    const id = gameAssessmentId(input.slug, input.reviewerUid);
    const ref = this.gameAssessmentsCollection().doc(id);
    const now = new Date().toISOString();
    const existing = await ref.get();
    const createdAt =
      existing.exists && typeof existing.data()?.createdAt === 'string'
        ? (existing.data()!.createdAt as string)
        : (input.createdAt ?? now);
    const record: GameAssessment = {
      id,
      slug: input.slug,
      title: input.title,
      source: input.source,
      creatorHandle: input.creatorHandle,
      reviewerUid: input.reviewerUid,
      verdict: input.verdict,
      note: input.note,
      noteOrigin: input.noteOrigin,
      checklist: input.checklist ?? null,
      clientContext: input.clientContext ?? null,
      gameVersion: input.gameVersion ?? null,
      // Fresh judgment: prior follow-up stays on the archived row.
      resolution: null,
      createdAt,
      updatedAt: now,
    };
    // One batch: the archive and the replacement land together, or neither does.
    const batch = this.db.batch();
    if (existing.exists) {
      const prior = hydrateGameAssessment(id, existing.data() as Omit<GameAssessment, 'id'>);
      const { id: priorId, ...priorBody } = prior;
      batch.set(this.gameAssessmentHistoryCollection().doc(), {
        ...priorBody,
        assessmentId: priorId,
        supersededAt: now,
      });
    }
    batch.set(ref, {
      slug: record.slug,
      title: record.title,
      source: record.source,
      creatorHandle: record.creatorHandle,
      reviewerUid: record.reviewerUid,
      verdict: record.verdict,
      note: record.note,
      noteOrigin: record.noteOrigin,
      checklist: record.checklist,
      clientContext: record.clientContext,
      gameVersion: record.gameVersion,
      resolution: record.resolution,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
    await batch.commit();
    return record;
  }

  async setGameAssessmentResolution(
    slug: string,
    reviewerUid: string,
    resolution: AssessmentResolution | null,
    expectedUpdatedAt?: string,
  ): Promise<ResolutionWriteResult> {
    const id = gameAssessmentId(slug, reviewerUid);
    const ref = this.gameAssessmentsCollection().doc(id);
    // A new verdict must not inherit this resolution.
    return this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) return { status: 'not_found' } as ResolutionWriteResult;
      const existing = hydrateGameAssessment(id, snap.data() as Omit<GameAssessment, 'id'>);
      if (expectedUpdatedAt !== undefined && existing.updatedAt !== expectedUpdatedAt) {
        return { status: 'stale', assessment: existing } as ResolutionWriteResult;
      }
      transaction.set(ref, { resolution }, { merge: true });
      return { status: 'ok', assessment: { ...existing, resolution } } as ResolutionWriteResult;
    });
  }

  async listGameAssessmentsBySlug(slug: string): Promise<GameAssessment[]> {
    // Equality only — no orderBy / composite index.
    const snap = await this.gameAssessmentsCollection().where('slug', '==', slug).get();
    return snap.docs
      .map((d) => hydrateGameAssessment(d.id, d.data() as Omit<GameAssessment, 'id'>))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.reviewerUid.localeCompare(b.reviewerUid));
  }

  private gameAssessmentHistoryCollection() {
    return this.db.collection(GAME_ASSESSMENT_HISTORY_COLLECTION);
  }

  async listGameAssessmentHistory(slug: string, reviewerUid: string): Promise<GameAssessmentHistoryEntry[]> {
    const id = gameAssessmentId(slug, reviewerUid);
    // Equality query only; sort in memory, same shape as the assessments themselves.
    const snap = await this.gameAssessmentHistoryCollection().where('assessmentId', '==', id).get();
    return snap.docs
      .map((d) => {
        const { assessmentId, ...rest } = d.data() as Omit<GameAssessmentHistoryEntry, 'id'> & {
          assessmentId: string;
        };
        return {
          ...rest,
          id: d.id,
          checklist: rest.checklist ?? null,
          clientContext: rest.clientContext ?? null,
          resolution: rest.resolution ?? null,
        };
      })
      .sort((a, b) => b.supersededAt.localeCompare(a.supersededAt));
  }

  private reReviewRequestsCollection() {
    return this.db.collection(RE_REVIEW_REQUESTS_COLLECTION);
  }

  private hydrateReReviewRequest(id: string, data: Omit<ReReviewRequest, 'id'>): ReReviewRequest {
    return {
      ...data,
      id,
      gameVersion: data.gameVersion ?? null,
      reason: data.reason ?? null,
      resolvedAt: data.resolvedAt ?? null,
    };
  }

  async upsertReReviewRequests(
    requests: Array<Pick<ReReviewRequest, 'slug' | 'reviewerUid' | 'gameVersion' | 'reason' | 'createdBy'>>,
  ): Promise<ReReviewRequest[]> {
    const now = new Date().toISOString();
    const out: ReReviewRequest[] = [];
    for (let index = 0; index < requests.length; index += 400) {
      const batch = this.db.batch();
      const chunk = requests.slice(index, index + 400);
      const records = chunk.map((req) => {
        const id = reReviewRequestId(req.slug, req.reviewerUid);
        const record: ReReviewRequest = {
          id,
          slug: req.slug,
          reviewerUid: req.reviewerUid,
          status: 'open',
          gameVersion: req.gameVersion,
          reason: req.reason,
          createdAt: now,
          createdBy: req.createdBy,
          resolvedAt: null,
        };
        const { id: recordId, ...body } = record;
        batch.set(this.reReviewRequestsCollection().doc(recordId), body);
        return record;
      });
      await batch.commit();
      out.push(...records);
    }
    return out;
  }

  async getReReviewRequest(slug: string, reviewerUid: string): Promise<ReReviewRequest | null> {
    const id = reReviewRequestId(slug, reviewerUid);
    const snap = await this.reReviewRequestsCollection().doc(id).get();
    if (!snap.exists) return null;
    return this.hydrateReReviewRequest(id, snap.data() as Omit<ReReviewRequest, 'id'>);
  }

  async listOpenReReviewRequestsForReviewer(reviewerUid: string): Promise<ReReviewRequest[]> {
    // Equality only — no orderBy / composite index.
    const snap = await this.reReviewRequestsCollection()
      .where('reviewerUid', '==', reviewerUid)
      .where('status', '==', 'open')
      .get();
    return snap.docs
      .map((d) => this.hydrateReReviewRequest(d.id, d.data() as Omit<ReReviewRequest, 'id'>))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listReReviewRequests(opts?: { limit?: number }): Promise<ReReviewRequest[]> {
    const ordered = this.reReviewRequestsCollection().orderBy('createdAt', 'desc');
    const snap = await (opts?.limit === undefined ? ordered : ordered.limit(opts.limit)).get();
    return snap.docs.map((d) => this.hydrateReReviewRequest(d.id, d.data() as Omit<ReReviewRequest, 'id'>));
  }

  async resolveReReviewRequest(slug: string, reviewerUid: string): Promise<ReReviewRequest | null> {
    const id = reReviewRequestId(slug, reviewerUid);
    const ref = this.reReviewRequestsCollection().doc(id);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const existing = this.hydrateReReviewRequest(id, snap.data() as Omit<ReReviewRequest, 'id'>);
    if (existing.status !== 'open') return existing;
    const resolvedAt = new Date().toISOString();
    await ref.set({ status: 'resolved', resolvedAt }, { merge: true });
    return { ...existing, status: 'resolved', resolvedAt };
  }

  async getGameAssessment(slug: string, reviewerUid: string): Promise<GameAssessment | null> {
    const id = gameAssessmentId(slug, reviewerUid);
    const snap = await this.gameAssessmentsCollection().doc(id).get();
    if (!snap.exists) return null;
    return hydrateGameAssessment(id, snap.data() as Omit<GameAssessment, 'id'>);
  }

  async listGameAssessmentsByReviewer(reviewerUid: string): Promise<GameAssessment[]> {
    // Equality query only; sort in memory.
    const snap = await this.gameAssessmentsCollection().where('reviewerUid', '==', reviewerUid).get();
    return snap.docs
      .map((d) => hydrateGameAssessment(d.id, d.data() as Omit<GameAssessment, 'id'>))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.slug.localeCompare(b.slug));
  }

  async listGameAssessments(opts?: { limit?: number }): Promise<GameAssessment[]> {
    const ordered = this.gameAssessmentsCollection().orderBy('updatedAt', 'desc');
    const snap = await (opts?.limit === undefined ? ordered : ordered.limit(opts.limit)).get();
    return snap.docs.map((d) => hydrateGameAssessment(d.id, d.data() as Omit<GameAssessment, 'id'>));
  }

  async listGameAssessmentsBySource(source: AssessmentSource): Promise<GameAssessment[]> {
    // Equality only — no orderBy / composite index.
    const snap = await this.gameAssessmentsCollection().where('source', '==', source).get();
    return snap.docs
      .map((d) => hydrateGameAssessment(d.id, d.data() as Omit<GameAssessment, 'id'>))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.slug.localeCompare(b.slug));
  }

  async countGameAssessmentsByUid(uid: string): Promise<number> {
    const snap = await this.gameAssessmentsCollection().where('reviewerUid', '==', uid).count().get();
    return snap.data().count;
  }

  async deleteGameAssessmentsByUid(uid: string): Promise<number> {
    const [assessments, history, reReviews] = await Promise.all([
      this.gameAssessmentsCollection().where('reviewerUid', '==', uid).get(),
      this.gameAssessmentHistoryCollection().where('reviewerUid', '==', uid).get(),
      this.reReviewRequestsCollection().where('reviewerUid', '==', uid).get(),
    ]);
    const refs = [...assessments.docs, ...history.docs, ...reReviews.docs].map((d) => d.ref);
    for (let index = 0; index < refs.length; index += 400) {
      const batch = this.db.batch();
      for (const ref of refs.slice(index, index + 400)) batch.delete(ref);
      await batch.commit();
    }
    return assessments.docs.length;
  }

  private reviewSweepsCollection() {
    return this.db.collection(REVIEW_SWEEPS_COLLECTION);
  }

  private hydrateReviewSweep(id: string, data: Omit<ReviewSweep, 'id'>): ReviewSweep {
    return {
      ...data,
      id,
      slugs: Array.isArray(data.slugs) ? data.slugs.filter((s): s is string => typeof s === 'string') : [],
      note: data.note ?? null,
      releasePerDay: data.releasePerDay ?? null,
      notifiedAt: data.notifiedAt ?? null,
      notifiedCount: typeof data.notifiedCount === 'number' ? data.notifiedCount : 0,
    };
  }

  async getOpenReviewSweep(): Promise<ReviewSweep | null> {
    // Two equality queries avoid a composite index.
    const [active, paused] = await Promise.all([
      this.reviewSweepsCollection().where('status', '==', 'active').limit(5).get(),
      this.reviewSweepsCollection().where('status', '==', 'paused').limit(5).get(),
    ]);
    const rows = [...active.docs, ...paused.docs]
      .map((d) => this.hydrateReviewSweep(d.id, d.data() as Omit<ReviewSweep, 'id'>))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return rows[0] ?? null;
  }

  async getReviewSweep(id: string): Promise<ReviewSweep | null> {
    const snap = await this.reviewSweepsCollection().doc(id).get();
    if (!snap.exists) return null;
    return this.hydrateReviewSweep(id, snap.data() as Omit<ReviewSweep, 'id'>);
  }

  async listReviewSweeps(opts?: { limit?: number }): Promise<ReviewSweep[]> {
    const limit = opts?.limit ?? 20;
    const snap = await this.reviewSweepsCollection().orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => this.hydrateReviewSweep(d.id, d.data() as Omit<ReviewSweep, 'id'>));
  }

  async createReviewSweep(sweep: ReviewSweep): Promise<ReviewSweep> {
    const open = await this.getOpenReviewSweep();
    if (open) {
      await this.reviewSweepsCollection().doc(open.id).set(
        {
          status: 'cancelled',
          updatedAt: sweep.createdAt,
          updatedBy: sweep.createdBy,
        },
        { merge: true },
      );
    }
    const { id, ...body } = sweep;
    await this.reviewSweepsCollection().doc(id).set(body);
    return { ...sweep, slugs: [...sweep.slugs] };
  }

  async updateReviewSweep(
    id: string,
    patch: Partial<Omit<ReviewSweep, 'id' | 'createdAt' | 'createdBy' | 'slugs' | 'source'>>,
  ): Promise<ReviewSweep | null> {
    const ref = this.reviewSweepsCollection().doc(id);
    const existing = await ref.get();
    if (!existing.exists) return null;
    await ref.set(patch, { merge: true });
    const snap = await ref.get();
    return this.hydrateReviewSweep(id, snap.data() as Omit<ReviewSweep, 'id'>);
  }

  // `current` is a fixed doc id, so a game has exactly one scorecard and the sweep
  // overwrites rather than accumulating a history nobody reads.
  private scorecardRef(slug: string) {
    return this.gameRef(slug).collection('scorecard').doc('current');
  }

  async putScorecard(slug: string, scorecard: Scorecard): Promise<void> {
    // `set` without merge: a scorecard is a whole snapshot, and merging would leave
    // fields from a previous window alive next to a newer one — a row that never
    // existed as a measurement.
    await this.scorecardRef(slug).set(scorecard);
  }

  async listScorecards(opts?: { limit?: number }): Promise<Scorecard[]> {
    // A collection-group query over `scorecard` reads every game's `current` doc in one
    // round trip, instead of one read per catalog slug. Safe as a group name: nothing
    // else in the schema uses it, unlike the `events` collision that forced play
    // telemetry into its own group.
    //
    // Ordered by `computedAt` rather than by any metric, because the question this read
    // exists to answer is "did the sweep run, and how fresh is the freshest" — a stale
    // scorecard is the failure worth seeing first.
    //
    // The `orderBy` selects *which* docs the limit keeps (the freshest, if the catalog
    // ever outgrows it); the sort below decides the order they are presented in. Both
    // are needed: a sweep stamps one `computedAt` on every game it writes, so equal
    // timestamps are the normal case rather than a rare tie, and Firestore promises
    // nothing about order among equal values. Sorting here rather than adding
    // `.orderBy('slug')` avoids provisioning a composite index for a listing that is
    // already bounded to a couple of hundred rows.
    const snap = await this.db
      .collectionGroup('scorecard')
      .orderBy('computedAt', 'desc')
      .limit(opts?.limit ?? 200)
      .get();
    return snap.docs.map((doc) => doc.data() as Scorecard).sort(compareScorecards);
  }

  async listGameSlugs(): Promise<string[]> {
    // `listDocuments()` rather than `get()`: it lists references without reading
    // documents, and — the part that matters here — it includes games whose parent
    // document was never written but which have subcollections underneath. A game that
    // only ever received feedback is exactly that case, and a `get()` would miss it.
    const refs = await this.db.collection('games').listDocuments();
    return refs.map((ref) => ref.id).sort();
  }

  // Both of these need the COLLECTION_GROUP index on playerFeedback.uid that
  // infra/setup-gcp.sh step 7 provisions. Firestore auto-indexes single fields at
  // COLLECTION scope only, so without it they fail with 9 FAILED_PRECONDITION rather
  // than merely running slowly.
  private feedbackByUid(uid: string) {
    return this.db.collectionGroup('playerFeedback').where('uid', '==', uid);
  }

  async deletePlayerFeedbackByUid(uid: string): Promise<number> {
    const snap = await this.feedbackByUid(uid).get();
    if (snap.empty) return 0;

    // Chunked because a batch tops out at 500 writes, and "delete everything this
    // person wrote" is precisely the request that could exceed it.
    const docs = snap.docs;
    for (let index = 0; index < docs.length; index += 400) {
      const batch = this.db.batch();
      for (const doc of docs.slice(index, index + 400)) batch.delete(doc.ref);
      await batch.commit();
    }
    return docs.length;
  }

  async countPlayerFeedbackByUid(uid: string): Promise<number> {
    const snap = await this.feedbackByUid(uid).count().get();
    return snap.data().count;
  }

  async getScorecard(slug: string): Promise<Scorecard | null> {
    const snap = await this.scorecardRef(slug).get();
    return snap.exists ? (snap.data() as Scorecard) : null;
  }

  // Top-level rather than under `games/{slug}`: a suggestion is read as a queue across
  // every game ("what needs attention") far more often than per game, and a collection
  // group would be the third one in this schema for no gain over a plain collection.
  private suggestionRef(id: string) {
    return this.db.collection('suggestions').doc(id);
  }

  async purgeLegacyGameSuggestions(limit: number): Promise<number> {
    // A bare collection-group read needs no custom index — no filter, no ordering — so
    // this finds the leftovers wherever they are rather than only under games that still
    // have a scorecard. A game whose scorecard has since expired is exactly the one whose
    // stale copy nobody would otherwise reach.
    const snap = await this.db.collectionGroup('suggestion').limit(limit).get();
    if (snap.empty) return 0;
    const batch = this.db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
    return snap.size;
  }

  async getGameAutonomy(slug: string): Promise<string | null> {
    const snap = await this.gameRef(slug).get();
    return (snap.data() as { autonomy?: string } | undefined)?.autonomy ?? null;
  }

  async setGameAutonomy(slug: string, mode: string): Promise<void> {
    // Merge: the game document carries other per-game facts, and a whole-document write
    // here would drop them.
    await this.gameRef(slug).set({ autonomy: mode }, { merge: true });
  }

  async putSuggestion(record: SuggestionRecord): Promise<void> {
    // Whole-document `set`, like a scorecard: a suggestion is a snapshot of one routing
    // decision, and merging would leave evidence from a previous window sitting beside a
    // newer status.
    await this.suggestionRef(record.id).set(stripUndefined(record));
  }

  async getSuggestion(id: string): Promise<SuggestionRecord | null> {
    const snap = await this.suggestionRef(id).get();
    return snap.exists ? (snap.data() as SuggestionRecord) : null;
  }

  async listSuggestions(opts?: {
    status?: SuggestionStatus[];
    ownerUid?: string;
    limit?: number;
  }): Promise<SuggestionRecord[]> {
    let query: FirebaseFirestore.Query = this.db.collection('suggestions');
    // `in` caps at 30 values and there are 8 statuses, so this never needs chunking.
    if (opts?.status?.length) query = query.where('status', 'in', opts.status);
    if (opts?.ownerUid) query = query.where('ownerUid', '==', opts.ownerUid);

    // Deliberately **no** `orderBy`: combining one with these equality filters is exactly
    // what needs a composite index per filter combination. Without one the query is
    // implicitly ordered by `__name__`, which is always indexed — deterministic, but
    // unrelated to priority. Ordering is restored in memory by the shared comparator, so
    // both stores agree.
    //
    // Which makes a bare `limit()` a trap, and the reason this pages instead. A caller
    // that asks for *the* open set and silently receives an arbitrary slice of it would
    // not see the suggestion it was checking for, and would open a second one for the
    // same game — a duplicate that looks exactly like the router changing its mind. So a
    // caller with no explicit limit gets every match, read in pages; only a caller that
    // asked for a bounded page (the inbox, showing a creator their shelf) gets one.
    const pageSize = 500;
    if (opts?.limit !== undefined) {
      const snap = await query.limit(opts.limit).get();
      return snap.docs.map((doc) => doc.data() as SuggestionRecord).sort(compareSuggestions);
    }

    const records: SuggestionRecord[] = [];
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      const page = cursor ? query.startAfter(cursor).limit(pageSize) : query.limit(pageSize);
      const snap = await page.get();
      if (snap.empty) break;
      records.push(...snap.docs.map((doc) => doc.data() as SuggestionRecord));
      if (snap.docs.length < pageSize) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
    return records.sort(compareSuggestions);
  }

  // Top-level, like suggestions and for the same reason: a proposal is read as a queue
  // across games ("what is waiting on me", "what have I sent") far more often than per
  // game, and the per-game read the supersede sweep needs is one equality filter away.
  private proposalRef(id: string) {
    return this.db.collection('proposals').doc(id);
  }

  // `{ownerUid}_{blockedUid}` as the document id rather than a subcollection under the
  // owner: the hot read is "has A blocked B", which this answers as a point read, and a
  // composite id keeps that true without an index. Uids cannot contain `_`.
  private contributorBlockRef(ownerUid: string, blockedUid: string) {
    return this.db.collection('contributorBlocks').doc(`${ownerUid}_${blockedUid}`);
  }

  async putProposal(record: ProposalRecord): Promise<void> {
    // Whole-document `set`: a proposal is written by one owner at a time (the service
    // reads, transitions, and writes it back), and a merge would let a stale decision
    // survive beside a newer state.
    await this.proposalRef(record.id).set(stripUndefined(record));
  }

  async getProposal(id: string): Promise<ProposalRecord | null> {
    const snap = await this.proposalRef(id).get();
    return snap.exists ? (snap.data() as ProposalRecord) : null;
  }

  async listProposals(opts?: {
    proposerUid?: string;
    targetOwnerUid?: string | null;
    targetSlug?: string;
    state?: ProposalState[];
    limit?: number;
  }): Promise<ProposalRecord[]> {
    let query: FirebaseFirestore.Query = this.db.collection('proposals');
    if (opts?.proposerUid) query = query.where('proposerUid', '==', opts.proposerUid);
    // `null` is a real value — the platform queue — so this tests for the key's presence
    // rather than its truthiness. Equality against `null` matches stored nulls in
    // Firestore, which is why `targetOwnerUid` is written explicitly rather than omitted
    // for platform-owned targets (see `stripUndefined`: it strips `undefined`, not `null`).
    if (opts !== undefined && 'targetOwnerUid' in opts) {
      query = query.where('targetOwnerUid', '==', opts.targetOwnerUid ?? null);
    }
    if (opts?.targetSlug) query = query.where('targetSlug', '==', opts.targetSlug);
    // 12 states, well under the 30-value `in` cap.
    if (opts?.state?.length) query = query.where('state', 'in', opts.state);

    // No `orderBy`, paged rather than limited — same rule and same reasoning as
    // `listSuggestions` above: ordering is restored in memory by the shared comparator so
    // a filtered read never needs a composite index, and an unbounded caller must get
    // every match rather than an arbitrary slice. The supersede sweep is exactly such a
    // caller: a slice would leave stale proposals live against a game that just published.
    const pageSize = 500;
    if (opts?.limit !== undefined) {
      const snap = await query.limit(opts.limit).get();
      return snap.docs.map((doc) => doc.data() as ProposalRecord).sort(compareProposals);
    }

    const records: ProposalRecord[] = [];
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      const page = cursor ? query.startAfter(cursor).limit(pageSize) : query.limit(pageSize);
      const snap = await page.get();
      if (snap.empty) break;
      records.push(...snap.docs.map((doc) => doc.data() as ProposalRecord));
      if (snap.docs.length < pageSize) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
    return records.sort(compareProposals);
  }

  async getContributionSettings(slug: string): Promise<GameContributionSettings | null> {
    const snap = await this.gameRef(slug).get();
    const data = (snap.data() as { contributions?: { mode?: string; updatedAt?: string; updatedByUid?: string } })
      ?.contributions;
    if (!data) return null;
    // Field-by-field rather than a cast: this rides on the shared `games/{slug}` document,
    // so an unknown mode written by a future version must read as `off` rather than as
    // whatever string happens to be stored — the failure direction that keeps a game shut
    // rather than accidentally open.
    return {
      slug,
      mode: data.mode === 'review' ? 'review' : 'off',
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
      ...(typeof data.updatedByUid === 'string' ? { updatedByUid: data.updatedByUid } : {}),
    };
  }

  async putContributionSettings(record: GameContributionSettings): Promise<void> {
    // Merge, not whole-document: `games/{slug}` also carries `autonomy` and the
    // publication registry, and a whole write here would drop what is live.
    await this.gameRef(record.slug).set(
      {
        contributions: stripUndefined({
          mode: record.mode,
          updatedAt: record.updatedAt,
          updatedByUid: record.updatedByUid,
        }),
      },
      { merge: true },
    );
  }

  async isContributorBlocked(ownerUid: string, blockedUid: string): Promise<boolean> {
    const snap = await this.contributorBlockRef(ownerUid, blockedUid).get();
    return snap.exists;
  }

  async blockContributor(record: ContributorBlockRecord): Promise<void> {
    await this.contributorBlockRef(record.ownerUid, record.blockedUid).set(stripUndefined(record));
  }

  async unblockContributor(ownerUid: string, blockedUid: string): Promise<void> {
    await this.contributorBlockRef(ownerUid, blockedUid).delete();
  }

  async listContributorBlocks(ownerUid: string): Promise<ContributorBlockRecord[]> {
    const snap = await this.db.collection('contributorBlocks').where('ownerUid', '==', ownerUid).get();
    return snap.docs
      .map((doc) => doc.data() as ContributorBlockRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.blockedUid.localeCompare(b.blockedUid));
  }

  async createAccessToken(record: AccessTokenRecord): Promise<void> {
    await this.db.collection('accessTokens').doc(record.tokenId).create(record);
  }

  async getAccessToken(tokenId: string): Promise<AccessTokenRecord | null> {
    const snap = await this.db.collection('accessTokens').doc(tokenId).get();
    if (!snap.exists) return null;
    return snap.data() as AccessTokenRecord;
  }

  async listAccessTokens(uid: string): Promise<AccessTokenRecord[]> {
    const snap = await this.db.collection('accessTokens').where('uid', '==', uid).get();
    // Sorted in memory rather than with orderBy: a composite (uid, createdAt) index is
    // not worth provisioning for a listing whose result set is a handful of rows.
    return snap.docs
      .map((doc) => doc.data() as AccessTokenRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteAccessToken(tokenId: string): Promise<boolean> {
    const docRef = this.db.collection('accessTokens').doc(tokenId);
    const snap = await docRef.get();
    if (!snap.exists) return false;
    await docRef.delete();
    return true;
  }

  async getGameAgentKey(slug: string): Promise<GameAgentKeyRecord | null> {
    const snap = await this.db.collection('gameAgentKeys').doc(slug).get();
    if (!snap.exists) return null;
    return snap.data() as GameAgentKeyRecord;
  }

  async ensureGameAgentKey(slug: string, ownerUid: string, at: string): Promise<GameAgentKeyRecord | null> {
    const docRef = this.db.collection('gameAgentKeys').doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (snap.exists) {
        const existing = snap.data() as GameAgentKeyRecord;
        if (existing.ownerUid !== ownerUid) return null;
        return existing;
      }
      const created: GameAgentKeyRecord = {
        slug,
        ownerUid,
        keyGeneration: 1,
        createdAt: at,
        updatedAt: at,
      };
      tx.create(docRef, created);
      return created;
    });
  }

  async rotateGameAgentKey(slug: string, ownerUid: string, at: string): Promise<GameAgentKeyRecord | null> {
    const docRef = this.db.collection('gameAgentKeys').doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return null;
      const existing = snap.data() as GameAgentKeyRecord;
      if (existing.ownerUid !== ownerUid) return null;
      const next: GameAgentKeyRecord = {
        ...existing,
        keyGeneration: existing.keyGeneration + 1,
        updatedAt: at,
      };
      tx.set(docRef, next);
      return next;
    });
  }

  async beginAgentOpenRound(slug: string, at: string): Promise<boolean> {
    const docRef = this.db.collection('gameAgentKeys').doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return false;
      const existing = snap.data() as GameAgentKeyRecord;
      if (existing.agentOpenRoundPending) return false;
      const next: GameAgentKeyRecord = { ...existing, agentOpenRoundPending: true, updatedAt: at };
      tx.set(docRef, next);
      return true;
    });
  }

  async finishAgentOpenRound(slug: string, at: string): Promise<void> {
    const docRef = this.db.collection('gameAgentKeys').doc(slug);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return;
      const existing = snap.data() as GameAgentKeyRecord;
      if (!existing.agentOpenRoundPending) return;
      const next: GameAgentKeyRecord = { ...existing, updatedAt: at };
      delete next.agentOpenRoundPending;
      tx.set(docRef, next);
    });
  }

  async getCreatorAgentKey(ownerUid: string): Promise<CreatorAgentKeyRecord | null> {
    const snap = await this.db.collection('creatorAgentKeys').doc(ownerUid).get();
    if (!snap.exists) return null;
    return snap.data() as CreatorAgentKeyRecord;
  }

  async ensureCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord> {
    const docRef = this.db.collection('creatorAgentKeys').doc(ownerUid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (snap.exists) {
        return snap.data() as CreatorAgentKeyRecord;
      }
      const created: CreatorAgentKeyRecord = {
        ownerUid,
        keyGeneration: 1,
        createdAt: at,
        updatedAt: at,
      };
      tx.create(docRef, created);
      return created;
    });
  }

  async reactivateCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord> {
    const docRef = this.db.collection('creatorAgentKeys').doc(ownerUid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) {
        const created: CreatorAgentKeyRecord = {
          ownerUid,
          keyGeneration: 1,
          createdAt: at,
          updatedAt: at,
        };
        tx.create(docRef, created);
        return created;
      }
      const existing = snap.data() as CreatorAgentKeyRecord;
      if (!existing.revokedAt) return existing;
      const cleared: CreatorAgentKeyRecord = {
        ownerUid: existing.ownerUid,
        keyGeneration: existing.keyGeneration,
        createdAt: existing.createdAt,
        updatedAt: at,
      };
      tx.set(docRef, cleared);
      return cleared;
    });
  }

  async rotateCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null> {
    const docRef = this.db.collection('creatorAgentKeys').doc(ownerUid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return null;
      const existing = snap.data() as CreatorAgentKeyRecord;
      const next: CreatorAgentKeyRecord = {
        ownerUid: existing.ownerUid,
        keyGeneration: existing.keyGeneration + 1,
        createdAt: existing.createdAt,
        updatedAt: at,
      };
      tx.set(docRef, next);
      return next;
    });
  }

  async touchCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null> {
    const docRef = this.db.collection('creatorAgentKeys').doc(ownerUid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return null;
      const existing = snap.data() as CreatorAgentKeyRecord;
      if (existing.revokedAt) return null;
      const next: CreatorAgentKeyRecord = { ...existing, updatedAt: at };
      tx.set(docRef, next);
      return next;
    });
  }

  async revokeCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null> {
    const docRef = this.db.collection('creatorAgentKeys').doc(ownerUid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return null;
      const existing = snap.data() as CreatorAgentKeyRecord;
      const next: CreatorAgentKeyRecord = {
        ownerUid: existing.ownerUid,
        keyGeneration: existing.keyGeneration + 1,
        createdAt: existing.createdAt,
        updatedAt: at,
        revokedAt: at,
      };
      tx.set(docRef, next);
      return next;
    });
  }

  async touchAccessToken(tokenId: string, at: string): Promise<void> {
    // `update` (not merge-set): a revoked token's doc is gone, and merge-set
    // would resurrect a partial record that later auth reads crash on. Missing
    // docs throw; callers already treat touch as best-effort.
    await this.db.collection('accessTokens').doc(tokenId).update({ lastUsedAt: at });
  }

  async createOAuthClient(record: OAuthClientRecord): Promise<void> {
    await this.db.collection('oauthClients').doc(record.clientId).create(stripUndefined(record));
  }

  async getOAuthClient(clientId: string): Promise<OAuthClientRecord | null> {
    const snap = await this.db.collection('oauthClients').doc(clientId).get();
    if (!snap.exists) return null;
    return snap.data() as OAuthClientRecord;
  }

  async createOAuthGrant(record: OAuthGrantRecord): Promise<void> {
    const batch = this.db.batch();
    batch.create(this.db.collection('oauthGrants').doc(record.grantId), stripUndefined(record));
    if (record.currentRefreshTokenId) {
      batch.set(this.db.collection('oauthRefreshTokens').doc(record.currentRefreshTokenId), {
        grantId: record.grantId,
      });
    }
    await batch.commit();
  }

  async getOAuthGrant(grantId: string): Promise<OAuthGrantRecord | null> {
    const snap = await this.db.collection('oauthGrants').doc(grantId).get();
    if (!snap.exists) return null;
    return snap.data() as OAuthGrantRecord;
  }

  async getOAuthGrantByRefreshTokenId(refreshTokenId: string): Promise<OAuthGrantRecord | null> {
    const indexSnap = await this.db.collection('oauthRefreshTokens').doc(refreshTokenId).get();
    if (!indexSnap.exists) return null;
    const grantId = (indexSnap.data() as { grantId: string }).grantId;
    return this.getOAuthGrant(grantId);
  }

  async listOAuthGrantsByOwner(ownerUid: string): Promise<OAuthGrantRecord[]> {
    const snap = await this.db.collection('oauthGrants').where('ownerUid', '==', ownerUid).get();
    return snap.docs
      .map((doc) => doc.data() as OAuthGrantRecord)
      .filter((grant) => !grant.revokedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async revokeOAuthGrant(grantId: string, ownerUid: string): Promise<boolean> {
    const docRef = this.db.collection('oauthGrants').doc(grantId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return false;
      const grant = snap.data() as OAuthGrantRecord;
      if (grant.ownerUid !== ownerUid) return false;
      tx.update(docRef, { revokedAt: new Date().toISOString() });
      return true;
    });
  }

  async createOAuthAccessToken(record: OAuthAccessTokenRecord): Promise<void> {
    await this.db.collection('oauthAccessTokens').doc(record.tokenId).create(stripUndefined(record));
  }

  async getOAuthAccessToken(tokenId: string): Promise<OAuthAccessTokenRecord | null> {
    const snap = await this.db.collection('oauthAccessTokens').doc(tokenId).get();
    if (!snap.exists) return null;
    return snap.data() as OAuthAccessTokenRecord;
  }

  async deleteOAuthAccessToken(tokenId: string): Promise<boolean> {
    const docRef = this.db.collection('oauthAccessTokens').doc(tokenId);
    const snap = await docRef.get();
    if (!snap.exists) return false;
    await docRef.delete();
    return true;
  }

  async createOAuthAuthCode(record: OAuthAuthCodeRecord): Promise<void> {
    await this.db.collection('oauthAuthCodes').doc(record.codeId).create(stripUndefined(record));
  }

  async consumeOAuthAuthCode(codeId: string, codeHash: string, nowMs: number): Promise<OAuthAuthCodeRecord | null> {
    const docRef = this.db.collection('oauthAuthCodes').doc(codeId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return null;
      const record = snap.data() as OAuthAuthCodeRecord;
      if (record.usedAt) {
        tx.delete(docRef);
        return null;
      }
      if (Date.parse(record.expiresAt) <= nowMs) {
        tx.delete(docRef);
        return null;
      }
      if (record.codeHash !== codeHash) return null;
      const usedAt = new Date(nowMs).toISOString();
      tx.delete(docRef);
      return { ...record, usedAt };
    });
  }

  async rotateOAuthRefreshToken(input: {
    refreshTokenId: string;
    refreshSecretHash: string;
    newRefreshTokenId: string;
    newRefreshHash: string;
    newRefreshExpiresAt: string;
    newAccessToken: OAuthAccessTokenRecord;
    nowMs: number;
  }): Promise<RotateRefreshTokenResult> {
    const grantIdFromIndex = await this.getOAuthGrantByRefreshTokenId(input.refreshTokenId);
    if (!grantIdFromIndex) return { ok: false, reason: 'invalid' };

    const grantRef = this.db.collection('oauthGrants').doc(grantIdFromIndex.grantId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(grantRef);
      if (!snap.exists) return { ok: false, reason: 'invalid' as const };
      const grant = snap.data() as OAuthGrantRecord;
      if (grant.revokedAt) return { ok: false, reason: 'revoked' as const };
      if (Date.parse(grant.refreshExpiresAt) <= input.nowMs) return { ok: false, reason: 'expired' as const };
      if (grant.currentRefreshTokenId !== input.refreshTokenId) {
        tx.update(grantRef, { revokedAt: new Date(input.nowMs).toISOString() });
        return { ok: false, reason: 'reuse' as const };
      }
      if (grant.currentRefreshHash !== input.refreshSecretHash) return { ok: false, reason: 'invalid' as const };

      const previousRefreshTokenId = grant.currentRefreshTokenId;
      const updated: OAuthGrantRecord = {
        ...grant,
        currentRefreshTokenId: input.newRefreshTokenId,
        currentRefreshHash: input.newRefreshHash,
        refreshExpiresAt: input.newRefreshExpiresAt,
        lastUsedAt: new Date(input.nowMs).toISOString(),
      };
      tx.set(grantRef, updated);
      tx.set(this.db.collection('oauthRefreshTokens').doc(input.newRefreshTokenId), {
        grantId: grant.grantId,
      });
      tx.create(
        this.db.collection('oauthAccessTokens').doc(input.newAccessToken.tokenId),
        stripUndefined(input.newAccessToken),
      );
      return { ok: true, grant: updated, previousRefreshTokenId };
    });
  }

  async issueOAuthTokensFromGrant(input: {
    grantId: string;
    refreshTokenId: string;
    refreshHash: string;
    refreshExpiresAt: string;
    accessToken: OAuthAccessTokenRecord;
    nowMs: number;
  }): Promise<OAuthGrantRecord | null> {
    const grantRef = this.db.collection('oauthGrants').doc(input.grantId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(grantRef);
      if (!snap.exists) return null;
      const grant = snap.data() as OAuthGrantRecord;
      if (grant.revokedAt) return null;
      if (grant.currentRefreshTokenId) return null;

      const updated: OAuthGrantRecord = {
        ...grant,
        currentRefreshTokenId: input.refreshTokenId,
        currentRefreshHash: input.refreshHash,
        refreshExpiresAt: input.refreshExpiresAt,
        lastUsedAt: new Date(input.nowMs).toISOString(),
      };
      tx.set(grantRef, updated);
      tx.set(this.db.collection('oauthRefreshTokens').doc(input.refreshTokenId), {
        grantId: input.grantId,
      });
      tx.create(
        this.db.collection('oauthAccessTokens').doc(input.accessToken.tokenId),
        stripUndefined(input.accessToken),
      );
      return updated;
    });
  }
}
