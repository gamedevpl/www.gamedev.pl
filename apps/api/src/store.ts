import { randomUUID } from 'node:crypto';
import { FieldValue, Firestore } from '@google-cloud/firestore';
import type { AssessmentSource, VoteValue, WaitlistStatus } from '@gamedevpl/contract';
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
import type { PublicationStore } from './store/slices/publication.js';
export type { PublicationStore };
import { InMemoryPublicationStore, FirestorePublicationStore } from './store/slices/publication.js';

/**
 * Uid namespace for automation accounts (docs/agent-access-tokens.md).
 *
 * Alongside `g:` (Google) and `dev:` (local sign-in). Keeping bots in their own
 * namespace is what lets product measurement tell them apart from people — the creator
 * metrics exclude them by this prefix — and it is why minting a token cannot
 * accidentally call a mistyped `g:` account into existence.
 */
export const BOT_UID_PREFIX = 'bot:';

// Record types moved to store/records/*.ts (Phase 2 wave 1). Re-exported here so
// every existing importer keeps working unchanged; each slice's own consumers
// migrate to the direct path as that slice is carved out in a later wave.
import type { User, HandleRecord, AccountIdentityDeletionResult, ClaimHandleResult } from './store/records/identity.js';
export type { User, HandleRecord, AccountIdentityDeletionResult, ClaimHandleResult };
import { DELETED_ACCOUNT_UID, ACTIVE_DAYS_KEPT, withActiveDay } from './store/records/identity.js';
export { DELETED_ACCOUNT_UID, ACTIVE_DAYS_KEPT, withActiveDay };
import type { IdentityStore } from './store/slices/identity.js';
export type { IdentityStore };
import { InMemoryIdentityStore, FirestoreIdentityStore } from './store/slices/identity.js';
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
import type { QuotaStore } from './store/slices/quota.js';
export type { QuotaStore };
import { InMemoryQuotaStore, FirestoreQuotaStore } from './store/slices/quota.js';
import type { GlobalQuotaStore } from './store/slices/quota-global.js';
export type { GlobalQuotaStore };
import { InMemoryGlobalQuotaStore, FirestoreGlobalQuotaStore } from './store/slices/quota-global.js';
import type { TelemetryEventType, TelemetryEvent, VisitEvent } from './store/records/telemetry.js';
export type { TelemetryEventType, TelemetryEvent, VisitEvent };
// The retention constants (TELEMETRY_TTL_FIELD, telemetryExpiresAt, ...) are no longer
// re-exported here -- their only consumers were InMemoryStore/FirestoreStore, both now in
// ./store/slices/telemetry.js, and store.test.ts, now store/records/telemetry.test.ts.
import type { TelemetryStore } from './store/slices/telemetry.js';
export type { TelemetryStore };
import { InMemoryTelemetryStore, FirestoreTelemetryStore } from './store/slices/telemetry.js';
import type { OAuthStore } from './store/slices/oauth.js';
export type { OAuthStore };
import { InMemoryOAuthStore, FirestoreOAuthStore } from './store/slices/oauth.js';
import type { PlayerDataStore } from './store/slices/player-data.js';
export type { PlayerDataStore };
import { InMemoryPlayerDataStore, FirestorePlayerDataStore } from './store/slices/player-data.js';
import type { WorldEntriesStore } from './store/slices/world-entries.js';
export type { WorldEntriesStore };
import { InMemoryWorldEntriesStore, FirestoreWorldEntriesStore } from './store/slices/world-entries.js';
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
};
import type { NotificationsStore } from './store/slices/notifications.js';
export type { NotificationsStore };
import { InMemoryNotificationsStore, FirestoreNotificationsStore } from './store/slices/notifications.js';
import type { GameVoteCounts, PlayerFeedbackRecord } from './store/records/social.js';
export type { GameVoteCounts, PlayerFeedbackRecord };
import type { SocialStore } from './store/slices/social.js';
export type { SocialStore };
import { InMemorySocialStore, FirestoreSocialStore } from './store/slices/social.js';
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
import type { ReviewStore } from './store/slices/review.js';
export type { ReviewStore };
import { InMemoryReviewStore, FirestoreReviewStore } from './store/slices/review.js';
import type { ReviewSweepStore } from './store/slices/review-sweeps.js';
export type { ReviewSweepStore };
import { InMemoryReviewSweepStore, FirestoreReviewSweepStore } from './store/slices/review-sweeps.js';
import type {
  GameSaveRecord,
  EditorDraftRecord,
  PlayAffinityRecord,
  WorldEntryRecord,
} from './store/records/player-data.js';
export type { GameSaveRecord, EditorDraftRecord, PlayAffinityRecord, WorldEntryRecord };
import { MAX_EDITOR_DRAFT_BYTES, MAX_GAME_SAVE_BYTES } from './store/records/player-data.js';
export { MAX_EDITOR_DRAFT_BYTES, MAX_GAME_SAVE_BYTES };
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
import type { ContributionStore } from './store/slices/contribution.js';
export type { ContributionStore };
import { InMemoryContributionStore, FirestoreContributionStore } from './store/slices/contribution.js';
import type { WaitlistEntry, BetaInvite, CreatedBetaInvite, ClaimBetaInviteResult } from './store/records/access.js';
export type { WaitlistEntry, BetaInvite, CreatedBetaInvite, ClaimBetaInviteResult };
import type { AccessStore } from './store/slices/access.js';
export type { AccessStore };
import { InMemoryAccessStore, FirestoreAccessStore } from './store/slices/access.js';
import type { AccessTokenRecord } from './store/records/access-tokens.js';
export type { AccessTokenRecord };
import type { AccessTokensStore } from './store/slices/access-tokens.js';
export type { AccessTokensStore };
import { InMemoryAccessTokensStore, FirestoreAccessTokensStore } from './store/slices/access-tokens.js';
import type { GameAgentKeyRecord, CreatorAgentKeyRecord } from './store/records/agent-keys.js';
export type { GameAgentKeyRecord, CreatorAgentKeyRecord };
import type { AgentKeysStore } from './store/slices/agent-keys.js';
export type { AgentKeysStore };
import { InMemoryAgentKeysStore, FirestoreAgentKeysStore } from './store/slices/agent-keys.js';
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

// IdentityStore, InMemoryIdentityStore and FirestoreIdentityStore live in
// ./store/slices/identity.js -- imported at the top of the file (Phase 2 wave 4).

// Not delegated to the identity slice -- this orchestrator already reaches every slice.
export interface AccountErasureStore {
  /**
   * Remove the account record and every credential/subscription tied to it. Published
   * submissions are retained under a non-personal platform owner; unfinished ones are
   * abandoned and likewise unlinked. Player contributions are erased separately first.
   */
  deleteAccountIdentity(uid: string, at: string): Promise<AccountIdentityDeletionResult>;
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

// PublicationStore, InMemoryPublicationStore and FirestorePublicationStore live in
// ./store/slices/publication.js -- imported at the top of the file (Phase 2 wave 4).

// Not delegated -- InMemory's listGameSlugs reaches into Social/Contribution/Review's
// Maps, which a delegate-only PublicationStore slice must not depend on.
export interface GameSlugsStore {
  // Every slug with a `games/{slug}` entry, including doc-less games with only
  // subcollections (votes, feedback, scorecard) -- the erase path's game-discovery walk.
  listGameSlugs(): Promise<string[]>;
}

// TelemetryStore, InMemoryTelemetryStore and FirestoreTelemetryStore live in
// ./store/slices/telemetry.js -- imported at the top of the file (Phase 2 wave 4).

// QuotaStore, InMemoryQuotaStore and FirestoreQuotaStore live in ./store/slices/quota.js;
// GlobalQuotaStore and its InMemory/Firestore implementations live in
// ./store/slices/quota-global.js -- imported at the top of the file (Phase 2 wave 4).

// AccessStore, InMemoryAccessStore and FirestoreAccessStore live in
// ./store/slices/access.js -- imported at the top of the file (Phase 2 wave 4).

// NotificationsStore, InMemoryNotificationsStore and FirestoreNotificationsStore live in
// ./store/slices/notifications.js -- imported at the top of the file (Phase 2 wave 4).

// SocialStore, InMemorySocialStore and FirestoreSocialStore live in
// ./store/slices/social.js -- imported at the top of the file (Phase 2 wave 4).

// ReviewStore/ReviewSweepStore, their InMemory and Firestore implementations live in
// ./store/slices/review.js and ./store/slices/review-sweeps.js (Phase 2 wave 4).

// PlayerDataStore, InMemoryPlayerDataStore and FirestorePlayerDataStore live in
// ./store/slices/player-data.js -- imported at the top of the file (Phase 2 wave 4).

// ContributionStore, InMemoryContributionStore and FirestoreContributionStore live in
// ./store/slices/contribution.js -- imported at the top of the file (Phase 2 wave 4).

// AccessTokensStore, InMemoryAccessTokensStore and FirestoreAccessTokensStore live in
// ./store/slices/access-tokens.js -- imported at the top of the file (Phase 2 wave 4).

// AgentKeysStore, InMemoryAgentKeysStore and FirestoreAgentKeysStore live in
// ./store/slices/agent-keys.js -- imported at the top of the file (Phase 2 wave 4).

// OAuthStore, InMemoryOAuthStore and FirestoreOAuthStore live in
// ./store/slices/oauth.js -- imported at the top of the file (Phase 2 wave 4).

export interface Store
  extends
    IdentityStore,
    AccountErasureStore,
    RoundsStore,
    DispatchStore,
    SubmissionStore,
    BuildLogStore,
    PublicationStore,
    GameSlugsStore,
    TelemetryStore,
    QuotaStore,
    GlobalQuotaStore,
    AccessStore,
    NotificationsStore,
    SocialStore,
    ReviewStore,
    ReviewSweepStore,
    PlayerDataStore,
    WorldEntriesStore,
    ContributionStore,
    AccessTokensStore,
    AgentKeysStore,
    OAuthStore {}

// compareSuggestions moved to ./store/slices/contribution.js; emptyUsageCounters moved
// to ./store/slices/quota.js (Phase 2 wave 4). Neither is used elsewhere in this file.

/** Newest first, with the id as a stable tie-break for same-millisecond events. */
function byNewestFirst(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

export class InMemoryStore implements Store {
  private identityStore = new InMemoryIdentityStore();
  private submissions = new Map<number, SubmissionRecord>();
  private publicationStore = new InMemoryPublicationStore();
  private nextJobId = JOB_ID_FLOOR;
  private buildEvents = new Map<number, BuildEvent[]>();
  private buildShots = new Map<number, BuildShot[]>();
  private buildPreviews = new Map<number, BuildPreview[]>();
  private creatorMessages = new Map<number, CreatorMessage[]>();
  private quotaStore = new InMemoryQuotaStore((uid) => this.identityStore.getUser(uid));
  private globalQuotaStore = new InMemoryGlobalQuotaStore();
  private accessStore = new InMemoryAccessStore();
  private telemetryStore = new InMemoryTelemetryStore();
  private notificationsStore = new InMemoryNotificationsStore();
  private socialStore = new InMemorySocialStore();
  private reviewStore = new InMemoryReviewStore();
  private reviewSweepStore = new InMemoryReviewSweepStore();
  private playerDataStore = new InMemoryPlayerDataStore();
  private worldEntriesStore = new InMemoryWorldEntriesStore();
  private contributionStore = new InMemoryContributionStore();
  // tokenId -> personal access token record
  private accessTokensStore = new InMemoryAccessTokensStore();
  // slug -> durable per-game agent opener state (BY-23)
  private agentKeysStore = new InMemoryAgentKeysStore();
  private oauthStore = new InMemoryOAuthStore();

  async getUser(uid: string): Promise<User | null> {
    return this.identityStore.getUser(uid);
  }

  async getUserByHandle(handle: string): Promise<User | null> {
    return this.identityStore.getUserByHandle(handle);
  }

  async getHandleReservation(handle: string): Promise<HandleRecord | null> {
    return this.identityStore.getHandleReservation(handle);
  }

  async claimHandle(uid: string, handle: string, at: string): Promise<ClaimHandleResult> {
    return this.identityStore.claimHandle(uid, handle, at);
  }

  async updateCreatorProfile(
    uid: string,
    patch: { profileName?: string; bio?: string; avatarMode?: AvatarMode },
  ): Promise<User | null> {
    return this.identityStore.updateCreatorProfile(uid, patch);
  }

  async releaseCreatorHandles(uid: string, at: string): Promise<string[]> {
    return this.identityStore.releaseCreatorHandles(uid, at);
  }

  async deleteAccountIdentity(uid: string, at: string): Promise<AccountIdentityDeletionResult> {
    const user = this.identityStore.users.get(uid);
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

    for (const [key, reservation] of [...this.identityStore.handles]) {
      if (reservation.uid === uid || reservation.previousUid === uid) this.identityStore.handles.delete(key);
    }
    for (const [key, counters] of [...this.quotaStore.usage]) {
      void counters;
      if (key.startsWith(`${uid}:`)) this.quotaStore.usage.delete(key);
    }
    this.accessStore.waitlist.delete(uid);
    if (user?.email) {
      const email = user.email.toLowerCase();
      for (const [key, entry] of [...this.accessStore.waitlist]) {
        if (entry.email?.toLowerCase() === email) this.accessStore.waitlist.delete(key);
      }
    }
    for (const [id, invite] of [...this.accessStore.betaInvites]) {
      if (invite.createdByUid === uid || invite.claimedUid === uid) this.accessStore.betaInvites.delete(id);
    }
    this.notificationsStore.notifications.delete(uid);
    this.notificationsStore.pushSubs.delete(uid);
    this.playerDataStore.gameSaves.delete(uid);
    this.playerDataStore.editorDrafts.delete(uid);
    this.playerDataStore.playAffinity.delete(uid);
    for (const [tokenId, record] of [...this.accessTokensStore.accessTokens]) {
      if (record.uid === uid) this.accessTokensStore.accessTokens.delete(tokenId);
    }
    for (const [slug, record] of [...this.agentKeysStore.gameAgentKeys]) {
      if (record.ownerUid === uid) this.agentKeysStore.gameAgentKeys.delete(slug);
    }
    this.agentKeysStore.creatorAgentKeys.delete(uid);
    for (const [id, suggestion] of [...this.contributionStore.suggestions]) {
      if (suggestion.ownerUid === uid) {
        this.contributionStore.suggestions.set(id, { ...suggestion, ownerUid: null, updatedAt: at });
      }
    }
    // Reaches into InMemoryOAuthStore's Maps directly -- documented exception, see PR.
    for (const [clientId, client] of [...this.oauthStore.oauthClients]) {
      if (client.ownerUid === uid) this.oauthStore.oauthClients.set(clientId, { ...client, ownerUid: undefined });
    }
    const grantIds = new Set<string>();
    for (const [grantId, grant] of [...this.oauthStore.oauthGrants]) {
      if (grant.ownerUid !== uid) continue;
      grantIds.add(grantId);
      this.oauthStore.oauthGrants.delete(grantId);
    }
    for (const [tokenId, token] of [...this.oauthStore.oauthAccessTokens]) {
      if (token.ownerUid === uid || grantIds.has(token.grantId)) this.oauthStore.oauthAccessTokens.delete(tokenId);
    }
    for (const [codeId, code] of [...this.oauthStore.oauthAuthCodes]) {
      if (code.ownerUid === uid || (code.grantId && grantIds.has(code.grantId))) {
        this.oauthStore.oauthAuthCodes.delete(codeId);
      }
    }
    for (const [refreshId, grantId] of [...this.oauthStore.oauthRefreshTokenIndex]) {
      if (grantIds.has(grantId)) this.oauthStore.oauthRefreshTokenIndex.delete(refreshId);
    }
    for (const slug of [...publishedSlugs, ...unpublishedSlugs]) this.contributionStore.gameAutonomy.delete(slug);
    this.identityStore.users.delete(uid);

    return { publishedSlugs, unpublishedSlugs };
  }

  async scheduleAccountDeletion(uid: string, requestedAt: string, scheduledFor: string): Promise<User | null> {
    return this.identityStore.scheduleAccountDeletion(uid, requestedAt, scheduledFor);
  }

  async cancelAccountDeletion(uid: string): Promise<boolean> {
    return this.identityStore.cancelAccountDeletion(uid);
  }

  async listAccountsDueForDeletion(at: string, limit: number): Promise<User[]> {
    return this.identityStore.listAccountsDueForDeletion(at, limit);
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return this.identityStore.findUserByEmail(email);
  }

  async upsertUser(userData: Partial<User> & { uid: string }): Promise<User> {
    return this.identityStore.upsertUser(userData);
  }

  async setEmailUnsubscribed(uid: string, at: string | null): Promise<void> {
    return this.identityStore.setEmailUnsubscribed(uid, at);
  }

  async setDigestOptOut(uid: string, at: string | null): Promise<void> {
    return this.identityStore.setDigestOptOut(uid, at);
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
    return this.publicationStore.getPublication(slug);
  }

  async setPublication(record: PublicationRecord): Promise<void> {
    return this.publicationStore.setPublication(record);
  }

  async setPublicationHealthCheck(slug: string, check: PublicationHealthCheck): Promise<boolean> {
    return this.publicationStore.setPublicationHealthCheck(slug, check);
  }

  async takedownPublication(slug: string, reason: string, at: string): Promise<boolean> {
    return this.publicationStore.takedownPublication(slug, reason, at);
  }

  async archivePublication(slug: string, reason: string, at: string): Promise<boolean> {
    return this.publicationStore.archivePublication(slug, reason, at);
  }

  async listPublications(): Promise<PublicationRecord[]> {
    return this.publicationStore.listPublications();
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
    return this.telemetryStore.appendTelemetryEvents(dateStr, events);
  }

  async listTelemetryEvents(dateStr: string, opts?: { slug?: string; limit?: number }): Promise<TelemetryEvent[]> {
    return this.telemetryStore.listTelemetryEvents(dateStr, opts);
  }

  async appendVisitEvents(dateStr: string, events: VisitEvent[]): Promise<void> {
    return this.telemetryStore.appendVisitEvents(dateStr, events);
  }

  async listVisitEvents(
    dateStr: string,
    opts?: { visitId?: string; limit?: number; type?: VisitEvent['type']; excludeType?: VisitEvent['type'] },
  ): Promise<VisitEvent[]> {
    return this.telemetryStore.listVisitEvents(dateStr, opts);
  }

  async getUsage(uid: string, dateStr: string): Promise<UsageCounters> {
    return this.quotaStore.getUsage(uid, dateStr);
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
    return this.quotaStore.checkAndIncrementQuota(uid, dateStr, limit, action);
  }

  async getCreationLimits(): Promise<CreationLimits | null> {
    return this.quotaStore.getCreationLimits();
  }

  async setCreationLimits(
    patch: Partial<Omit<CreationLimits, 'updatedAt'>>,
    updatedBy: string,
  ): Promise<CreationLimits> {
    return this.quotaStore.setCreationLimits(patch, updatedBy);
  }

  async getPublicPlayConfig(): Promise<PublicPlayConfig | null> {
    return this.quotaStore.getPublicPlayConfig();
  }

  async setPublicPlaySlugs(slugs: string[], updatedBy: string): Promise<PublicPlayConfig> {
    return this.quotaStore.setPublicPlaySlugs(slugs, updatedBy);
  }

  async getFeaturedPoolConfig(): Promise<FeaturedPoolConfig | null> {
    return this.quotaStore.getFeaturedPoolConfig();
  }

  async setFeaturedPoolSlugs(slugs: string[], updatedBy: string): Promise<FeaturedPoolConfig> {
    return this.quotaStore.setFeaturedPoolSlugs(slugs, updatedBy);
  }

  async getGlobalSubmissionCount(dateStr: string): Promise<number> {
    return this.globalQuotaStore.getGlobalSubmissionCount(dateStr);
  }

  async getGlobalTabCompleteTokenCount(dateStr: string): Promise<number> {
    return this.globalQuotaStore.getGlobalTabCompleteTokenCount(dateStr);
  }

  async checkAndIncrementGlobalSubmissions(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    return this.globalQuotaStore.checkAndIncrementGlobalSubmissions(dateStr, limit);
  }

  async checkAndIncrementGlobalEdits(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }> {
    return this.globalQuotaStore.checkAndIncrementGlobalEdits(dateStr, limit);
  }

  async checkAndIncrementGlobalChats(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }> {
    return this.globalQuotaStore.checkAndIncrementGlobalChats(dateStr, limit);
  }

  async checkAndIncrementGlobalTabCompleteTokens(
    dateStr: string,
    tokens: number,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    return this.globalQuotaStore.checkAndIncrementGlobalTabCompleteTokens(dateStr, tokens, limit);
  }

  async adjustGlobalTabCompleteTokens(dateStr: string, delta: number): Promise<number> {
    return this.globalQuotaStore.adjustGlobalTabCompleteTokens(dateStr, delta);
  }

  async getGlobalManagedBuildCount(dateStr: string): Promise<number> {
    return this.globalQuotaStore.getGlobalManagedBuildCount(dateStr);
  }

  async checkAndIncrementGlobalManagedBuilds(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    return this.globalQuotaStore.checkAndIncrementGlobalManagedBuilds(dateStr, limit);
  }

  async upsertWaitlistEntry(entry: {
    uid: string;
    email?: string;
    name?: string;
    locale?: string;
  }): Promise<WaitlistEntry> {
    return this.accessStore.upsertWaitlistEntry(entry);
  }

  async getWaitlistEntry(uid: string): Promise<WaitlistEntry | null> {
    return this.accessStore.getWaitlistEntry(uid);
  }

  async isWaitlistApproved(uid: string, email?: string): Promise<boolean> {
    return this.accessStore.isWaitlistApproved(uid, email);
  }

  async setWaitlistStatus(uid: string, status: WaitlistStatus): Promise<WaitlistEntry | null> {
    return this.accessStore.setWaitlistStatus(uid, status);
  }

  async listWaitlistEntries(opts?: { status?: WaitlistStatus; limit?: number }): Promise<WaitlistEntry[]> {
    return this.accessStore.listWaitlistEntries(opts);
  }

  async countWaitlistEntries(status?: WaitlistStatus): Promise<number> {
    return this.accessStore.countWaitlistEntries(status);
  }

  async setWaitlistStatusByEmail(email: string, status: WaitlistStatus): Promise<WaitlistEntry> {
    return this.accessStore.setWaitlistStatusByEmail(email, status);
  }

  async recordBetaInviteAdmission(entry: {
    uid: string;
    email?: string;
    name?: string;
    locale?: string;
  }): Promise<WaitlistEntry> {
    return this.accessStore.recordBetaInviteAdmission(entry);
  }

  async createBetaInvite(createdByUid: string): Promise<CreatedBetaInvite> {
    return this.accessStore.createBetaInvite(createdByUid);
  }

  async listBetaInvites(opts?: { limit?: number }): Promise<BetaInvite[]> {
    return this.accessStore.listBetaInvites(opts);
  }

  async claimBetaInvite(code: string, uid: string): Promise<ClaimBetaInviteResult> {
    return this.accessStore.claimBetaInvite(code, uid);
  }

  async revokeBetaInvite(id: string, revokedByUid: string): Promise<BetaInvite | null> {
    return this.accessStore.revokeBetaInvite(id, revokedByUid);
  }

  async createNotification(
    uid: string,
    notification: Omit<StoredNotification, 'readAt' | 'emailedAt'> & { createdAt?: string },
  ): Promise<{ created: boolean; notification: StoredNotification }> {
    return this.notificationsStore.createNotification(uid, notification);
  }

  async listNotifications(uid: string, opts?: { limit?: number }): Promise<StoredNotification[]> {
    return this.notificationsStore.listNotifications(uid, opts);
  }

  async markNotificationsRead(uid: string, ids: string[] | 'all'): Promise<void> {
    return this.notificationsStore.markNotificationsRead(uid, ids);
  }

  async deleteNotifications(uid: string, ids: string[] | 'all'): Promise<void> {
    return this.notificationsStore.deleteNotifications(uid, ids);
  }

  async markNotificationEmailed(uid: string, id: string, at?: string): Promise<void> {
    return this.notificationsStore.markNotificationEmailed(uid, id, at);
  }

  async savePushSubscription(uid: string, subscription: Omit<PushSubscriptionRecord, 'createdAt'>): Promise<void> {
    return this.notificationsStore.savePushSubscription(uid, subscription);
  }

  async listPushSubscriptions(uid: string): Promise<PushSubscriptionRecord[]> {
    return this.notificationsStore.listPushSubscriptions(uid);
  }

  async deletePushSubscription(uid: string, endpoint: string): Promise<void> {
    return this.notificationsStore.deletePushSubscription(uid, endpoint);
  }

  async getVote(slug: string, uid: string): Promise<VoteValue | null> {
    return this.socialStore.getVote(slug, uid);
  }

  async castVote(slug: string, uid: string, value: VoteValue): Promise<GameVoteCounts> {
    return this.socialStore.castVote(slug, uid, value);
  }

  async clearVote(slug: string, uid: string): Promise<GameVoteCounts> {
    return this.socialStore.clearVote(slug, uid);
  }

  async getVoteCounts(slug: string): Promise<GameVoteCounts> {
    return this.socialStore.getVoteCounts(slug);
  }

  async setGameFollow(slug: string, uid: string, at: string): Promise<number> {
    return this.socialStore.setGameFollow(slug, uid, at);
  }

  async clearGameFollow(slug: string, uid: string): Promise<number> {
    return this.socialStore.clearGameFollow(slug, uid);
  }

  async isFollowingGame(slug: string, uid: string): Promise<boolean> {
    return this.socialStore.isFollowingGame(slug, uid);
  }

  async countGameFollowers(slug: string): Promise<number> {
    return this.socialStore.countGameFollowers(slug);
  }

  async listGameFollowers(slug: string, opts?: { limit?: number }): Promise<string[]> {
    return this.socialStore.listGameFollowers(slug, opts);
  }

  async getGameSave(uid: string, slug: string): Promise<GameSaveRecord | null> {
    return this.playerDataStore.getGameSave(uid, slug);
  }

  async putGameSave(uid: string, slug: string, data: string, version: number): Promise<GameSaveRecord> {
    return this.playerDataStore.putGameSave(uid, slug, data, version);
  }

  async deleteGameSave(uid: string, slug: string): Promise<void> {
    return this.playerDataStore.deleteGameSave(uid, slug);
  }

  async listGameSaves(uid: string): Promise<GameSaveRecord[]> {
    return this.playerDataStore.listGameSaves(uid);
  }

  async deleteGameSaves(uid: string): Promise<number> {
    return this.playerDataStore.deleteGameSaves(uid);
  }

  async getEditorDraft(uid: string, slug: string): Promise<EditorDraftRecord | null> {
    return this.playerDataStore.getEditorDraft(uid, slug);
  }

  async putEditorDraft(
    uid: string,
    slug: string,
    content: string,
    expectedRevision?: number,
  ): Promise<{ conflict: false; record: EditorDraftRecord } | { conflict: true; revision: number }> {
    return this.playerDataStore.putEditorDraft(uid, slug, content, expectedRevision);
  }

  async deleteEditorDraft(uid: string, slug: string): Promise<void> {
    return this.playerDataStore.deleteEditorDraft(uid, slug);
  }

  async listEditorDrafts(uid: string): Promise<EditorDraftRecord[]> {
    return this.playerDataStore.listEditorDrafts(uid);
  }

  async deleteEditorDrafts(uid: string): Promise<number> {
    return this.playerDataStore.deleteEditorDrafts(uid);
  }

  async recordPlayAffinity(uid: string, slug: string, at?: string): Promise<PlayAffinityRecord> {
    return this.playerDataStore.recordPlayAffinity(uid, slug, at);
  }

  async listPlayAffinity(uid: string): Promise<PlayAffinityRecord[]> {
    return this.playerDataStore.listPlayAffinity(uid);
  }

  async deletePlayAffinity(uid: string): Promise<number> {
    return this.playerDataStore.deletePlayAffinity(uid);
  }

  async listWorldEntries(worldId: string): Promise<WorldEntryRecord[]> {
    return this.worldEntriesStore.listWorldEntries(worldId);
  }

  async getWorldEntry(worldId: string, key: string): Promise<WorldEntryRecord | null> {
    return this.worldEntriesStore.getWorldEntry(worldId, key);
  }

  async putWorldEntry(options: {
    worldId: string;
    key: string;
    uid: string;
    fields: Record<string, string | number | boolean>;
    maxPerPlayer: number;
    maxEntries: number;
  }): Promise<{ ok: true; entry: WorldEntryRecord } | { ok: false; reason: 'conflict' | 'quota' | 'full' }> {
    return this.worldEntriesStore.putWorldEntry(options);
  }

  async deleteWorldEntry(worldId: string, key: string, uid: string): Promise<boolean> {
    return this.worldEntriesStore.deleteWorldEntry(worldId, key, uid);
  }

  async countWorldEntries(worldId: string, uid: string): Promise<number> {
    return this.worldEntriesStore.countWorldEntries(worldId, uid);
  }

  async listWorldsForUser(uid: string): Promise<string[]> {
    return this.worldEntriesStore.listWorldsForUser(uid);
  }

  async deleteWorldEntriesForUser(uid: string): Promise<number> {
    return this.worldEntriesStore.deleteWorldEntriesForUser(uid);
  }

  async addPlayerFeedback(slug: string, uid: string, text: string): Promise<PlayerFeedbackRecord> {
    return this.socialStore.addPlayerFeedback(slug, uid, text);
  }

  async listPlayerFeedback(slug: string, opts?: { limit?: number }): Promise<PlayerFeedbackRecord[]> {
    return this.socialStore.listPlayerFeedback(slug, opts);
  }

  async countPlayerFeedback(slug: string): Promise<number> {
    return this.socialStore.countPlayerFeedback(slug);
  }

  async upsertGameAssessment(
    input: Omit<GameAssessment, 'id' | 'createdAt' | 'updatedAt' | 'gameVersion' | 'resolution'> & {
      createdAt?: string;
      gameVersion?: string | null;
    },
  ): Promise<GameAssessment> {
    return this.reviewStore.upsertGameAssessment(input);
  }

  async getGameAssessment(slug: string, reviewerUid: string): Promise<GameAssessment | null> {
    return this.reviewStore.getGameAssessment(slug, reviewerUid);
  }

  async setGameAssessmentResolution(
    slug: string,
    reviewerUid: string,
    resolution: AssessmentResolution | null,
    expectedUpdatedAt?: string,
  ): Promise<ResolutionWriteResult> {
    return this.reviewStore.setGameAssessmentResolution(slug, reviewerUid, resolution, expectedUpdatedAt);
  }

  async listGameAssessmentsBySlug(slug: string): Promise<GameAssessment[]> {
    return this.reviewStore.listGameAssessmentsBySlug(slug);
  }

  async listGameAssessmentsByReviewer(reviewerUid: string): Promise<GameAssessment[]> {
    return this.reviewStore.listGameAssessmentsByReviewer(reviewerUid);
  }

  async listGameAssessments(opts?: { limit?: number }): Promise<GameAssessment[]> {
    return this.reviewStore.listGameAssessments(opts);
  }

  async listGameAssessmentsBySource(source: AssessmentSource): Promise<GameAssessment[]> {
    return this.reviewStore.listGameAssessmentsBySource(source);
  }

  async countGameAssessmentsByUid(uid: string): Promise<number> {
    return this.reviewStore.countGameAssessmentsByUid(uid);
  }

  async deleteGameAssessmentsByUid(uid: string): Promise<number> {
    return this.reviewStore.deleteGameAssessmentsByUid(uid);
  }

  async listGameAssessmentHistory(slug: string, reviewerUid: string): Promise<GameAssessmentHistoryEntry[]> {
    return this.reviewStore.listGameAssessmentHistory(slug, reviewerUid);
  }

  async upsertReReviewRequests(
    requests: Array<Pick<ReReviewRequest, 'slug' | 'reviewerUid' | 'gameVersion' | 'reason' | 'createdBy'>>,
  ): Promise<ReReviewRequest[]> {
    return this.reviewStore.upsertReReviewRequests(requests);
  }

  async getReReviewRequest(slug: string, reviewerUid: string): Promise<ReReviewRequest | null> {
    return this.reviewStore.getReReviewRequest(slug, reviewerUid);
  }

  async listOpenReReviewRequestsForReviewer(reviewerUid: string): Promise<ReReviewRequest[]> {
    return this.reviewStore.listOpenReReviewRequestsForReviewer(reviewerUid);
  }

  async listReReviewRequests(opts?: { limit?: number }): Promise<ReReviewRequest[]> {
    return this.reviewStore.listReReviewRequests(opts);
  }

  async resolveReReviewRequest(slug: string, reviewerUid: string): Promise<ReReviewRequest | null> {
    return this.reviewStore.resolveReReviewRequest(slug, reviewerUid);
  }

  async getOpenReviewSweep(): Promise<ReviewSweep | null> {
    return this.reviewSweepStore.getOpenReviewSweep();
  }

  async getReviewSweep(id: string): Promise<ReviewSweep | null> {
    return this.reviewSweepStore.getReviewSweep(id);
  }

  async listReviewSweeps(opts?: { limit?: number }): Promise<ReviewSweep[]> {
    return this.reviewSweepStore.listReviewSweeps(opts);
  }

  async createReviewSweep(sweep: ReviewSweep): Promise<ReviewSweep> {
    return this.reviewSweepStore.createReviewSweep(sweep);
  }

  async updateReviewSweep(
    id: string,
    patch: Partial<Omit<ReviewSweep, 'id' | 'createdAt' | 'createdBy' | 'slugs' | 'source'>>,
  ): Promise<ReviewSweep | null> {
    return this.reviewSweepStore.updateReviewSweep(id, patch);
  }

  async putScorecard(slug: string, scorecard: Scorecard): Promise<void> {
    return this.reviewSweepStore.putScorecard(slug, scorecard);
  }

  async getScorecard(slug: string): Promise<Scorecard | null> {
    return this.reviewSweepStore.getScorecard(slug);
  }

  async listScorecards(opts?: { limit?: number }): Promise<Scorecard[]> {
    return this.reviewSweepStore.listScorecards(opts);
  }

  async getGameAutonomy(slug: string): Promise<string | null> {
    return this.contributionStore.getGameAutonomy(slug);
  }

  async purgeLegacyGameSuggestions(limit: number): Promise<number> {
    return this.contributionStore.purgeLegacyGameSuggestions(limit);
  }

  // Test-only seed for the legacy-suggestion purge above; not on the Store interface.
  seedLegacyGameSuggestion(slug: string): void {
    this.contributionStore.seedLegacyGameSuggestion(slug);
  }

  async setGameAutonomy(slug: string, mode: string): Promise<void> {
    return this.contributionStore.setGameAutonomy(slug, mode);
  }

  async putSuggestion(record: SuggestionRecord): Promise<void> {
    return this.contributionStore.putSuggestion(record);
  }

  async getSuggestion(id: string): Promise<SuggestionRecord | null> {
    return this.contributionStore.getSuggestion(id);
  }

  async listSuggestions(opts?: {
    status?: SuggestionStatus[];
    ownerUid?: string;
    limit?: number;
  }): Promise<SuggestionRecord[]> {
    return this.contributionStore.listSuggestions(opts);
  }

  async putProposal(record: ProposalRecord): Promise<void> {
    return this.contributionStore.putProposal(record);
  }

  async getProposal(id: string): Promise<ProposalRecord | null> {
    return this.contributionStore.getProposal(id);
  }

  async listProposals(opts?: {
    proposerUid?: string;
    targetOwnerUid?: string | null;
    targetSlug?: string;
    state?: ProposalState[];
    limit?: number;
  }): Promise<ProposalRecord[]> {
    return this.contributionStore.listProposals(opts);
  }

  async getContributionSettings(slug: string): Promise<GameContributionSettings | null> {
    return this.contributionStore.getContributionSettings(slug);
  }

  async putContributionSettings(record: GameContributionSettings): Promise<void> {
    return this.contributionStore.putContributionSettings(record);
  }

  async isContributorBlocked(ownerUid: string, blockedUid: string): Promise<boolean> {
    return this.contributionStore.isContributorBlocked(ownerUid, blockedUid);
  }

  async blockContributor(record: ContributorBlockRecord): Promise<void> {
    return this.contributionStore.blockContributor(record);
  }

  async unblockContributor(ownerUid: string, blockedUid: string): Promise<void> {
    return this.contributionStore.unblockContributor(ownerUid, blockedUid);
  }

  async listContributorBlocks(ownerUid: string): Promise<ContributorBlockRecord[]> {
    return this.contributionStore.listContributorBlocks(ownerUid);
  }

  async listGameSlugs(): Promise<string[]> {
    // Union of every slug this store knows anything about, mirroring Firestore's
    // `listDocuments()`, which also returns a game whose document never existed but
    // whose subcollections do.
    return [
      ...new Set([
        ...this.socialStore.votes.keys(),
        ...this.socialStore.follows.keys(),
        ...this.socialStore.playerFeedback.keys(),
        ...this.reviewSweepStore.scorecards.keys(),
        ...this.contributionStore.suggestions.keys(),
      ]),
    ].sort();
  }

  async deletePlayerFeedbackByUid(uid: string): Promise<number> {
    return this.socialStore.deletePlayerFeedbackByUid(uid);
  }

  async countPlayerFeedbackByUid(uid: string): Promise<number> {
    return this.socialStore.countPlayerFeedbackByUid(uid);
  }

  async createAccessToken(record: AccessTokenRecord): Promise<void> {
    return this.accessTokensStore.createAccessToken(record);
  }

  async getAccessToken(tokenId: string): Promise<AccessTokenRecord | null> {
    return this.accessTokensStore.getAccessToken(tokenId);
  }

  async listAccessTokens(uid: string): Promise<AccessTokenRecord[]> {
    return this.accessTokensStore.listAccessTokens(uid);
  }

  async deleteAccessToken(tokenId: string): Promise<boolean> {
    return this.accessTokensStore.deleteAccessToken(tokenId);
  }

  async touchAccessToken(tokenId: string, at: string): Promise<void> {
    return this.accessTokensStore.touchAccessToken(tokenId, at);
  }

  async getGameAgentKey(slug: string): Promise<GameAgentKeyRecord | null> {
    return this.agentKeysStore.getGameAgentKey(slug);
  }

  async ensureGameAgentKey(slug: string, ownerUid: string, at: string): Promise<GameAgentKeyRecord | null> {
    return this.agentKeysStore.ensureGameAgentKey(slug, ownerUid, at);
  }

  async rotateGameAgentKey(slug: string, ownerUid: string, at: string): Promise<GameAgentKeyRecord | null> {
    return this.agentKeysStore.rotateGameAgentKey(slug, ownerUid, at);
  }

  async beginAgentOpenRound(slug: string, at: string): Promise<boolean> {
    return this.agentKeysStore.beginAgentOpenRound(slug, at);
  }

  async finishAgentOpenRound(slug: string, at: string): Promise<void> {
    return this.agentKeysStore.finishAgentOpenRound(slug, at);
  }

  async getCreatorAgentKey(ownerUid: string): Promise<CreatorAgentKeyRecord | null> {
    return this.agentKeysStore.getCreatorAgentKey(ownerUid);
  }

  async ensureCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord> {
    return this.agentKeysStore.ensureCreatorAgentKey(ownerUid, at);
  }

  async reactivateCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord> {
    return this.agentKeysStore.reactivateCreatorAgentKey(ownerUid, at);
  }

  async rotateCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null> {
    return this.agentKeysStore.rotateCreatorAgentKey(ownerUid, at);
  }

  async touchCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null> {
    return this.agentKeysStore.touchCreatorAgentKey(ownerUid, at);
  }

  async revokeCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null> {
    return this.agentKeysStore.revokeCreatorAgentKey(ownerUid, at);
  }

  async createOAuthClient(record: OAuthClientRecord): Promise<void> {
    return this.oauthStore.createOAuthClient(record);
  }

  async getOAuthClient(clientId: string): Promise<OAuthClientRecord | null> {
    return this.oauthStore.getOAuthClient(clientId);
  }

  async createOAuthGrant(record: OAuthGrantRecord): Promise<void> {
    return this.oauthStore.createOAuthGrant(record);
  }

  async getOAuthGrant(grantId: string): Promise<OAuthGrantRecord | null> {
    return this.oauthStore.getOAuthGrant(grantId);
  }

  async getOAuthGrantByRefreshTokenId(refreshTokenId: string): Promise<OAuthGrantRecord | null> {
    return this.oauthStore.getOAuthGrantByRefreshTokenId(refreshTokenId);
  }

  async listOAuthGrantsByOwner(ownerUid: string): Promise<OAuthGrantRecord[]> {
    return this.oauthStore.listOAuthGrantsByOwner(ownerUid);
  }

  async revokeOAuthGrant(grantId: string, ownerUid: string): Promise<boolean> {
    return this.oauthStore.revokeOAuthGrant(grantId, ownerUid);
  }

  async createOAuthAccessToken(record: OAuthAccessTokenRecord): Promise<void> {
    return this.oauthStore.createOAuthAccessToken(record);
  }

  async getOAuthAccessToken(tokenId: string): Promise<OAuthAccessTokenRecord | null> {
    return this.oauthStore.getOAuthAccessToken(tokenId);
  }

  async deleteOAuthAccessToken(tokenId: string): Promise<boolean> {
    return this.oauthStore.deleteOAuthAccessToken(tokenId);
  }

  async createOAuthAuthCode(record: OAuthAuthCodeRecord): Promise<void> {
    return this.oauthStore.createOAuthAuthCode(record);
  }

  async consumeOAuthAuthCode(codeId: string, codeHash: string, nowMs: number): Promise<OAuthAuthCodeRecord | null> {
    return this.oauthStore.consumeOAuthAuthCode(codeId, codeHash, nowMs);
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
    return this.oauthStore.rotateOAuthRefreshToken(input);
  }

  async issueOAuthTokensFromGrant(input: {
    grantId: string;
    refreshTokenId: string;
    refreshHash: string;
    refreshExpiresAt: string;
    accessToken: OAuthAccessTokenRecord;
    nowMs: number;
  }): Promise<OAuthGrantRecord | null> {
    return this.oauthStore.issueOAuthTokensFromGrant(input);
  }

  // Test/inspection only — production reads go through `listWaitlistEntries`.
  waitlistEntries(): WaitlistEntry[] {
    return Array.from(this.accessStore.waitlist.values());
  }
}

export class FirestoreStore implements Store {
  private db: Firestore;
  private telemetryStore: FirestoreTelemetryStore;
  private oauthStore: FirestoreOAuthStore;
  private playerDataStore: FirestorePlayerDataStore;
  private worldEntriesStore: FirestoreWorldEntriesStore;
  private notificationsStore: FirestoreNotificationsStore;
  private accessTokensStore: FirestoreAccessTokensStore;
  private agentKeysStore: FirestoreAgentKeysStore;
  private accessStore: FirestoreAccessStore;
  private reviewStore: FirestoreReviewStore;
  private reviewSweepStore: FirestoreReviewSweepStore;
  private identityStore: FirestoreIdentityStore;
  private quotaStore: FirestoreQuotaStore;
  private globalQuotaStore: FirestoreGlobalQuotaStore;
  private socialStore: FirestoreSocialStore;
  private contributionStore: FirestoreContributionStore;
  private publicationStore: FirestorePublicationStore;

  constructor(db?: Firestore) {
    this.db = db ?? new Firestore();
    this.telemetryStore = new FirestoreTelemetryStore(this.db);
    this.oauthStore = new FirestoreOAuthStore(this.db);
    this.playerDataStore = new FirestorePlayerDataStore(this.db);
    this.worldEntriesStore = new FirestoreWorldEntriesStore(this.db);
    this.notificationsStore = new FirestoreNotificationsStore(this.db);
    this.accessTokensStore = new FirestoreAccessTokensStore(this.db);
    this.agentKeysStore = new FirestoreAgentKeysStore(this.db);
    this.accessStore = new FirestoreAccessStore(this.db);
    this.reviewStore = new FirestoreReviewStore(this.db);
    this.reviewSweepStore = new FirestoreReviewSweepStore(this.db);
    this.identityStore = new FirestoreIdentityStore(this.db);
    this.quotaStore = new FirestoreQuotaStore(this.db);
    this.globalQuotaStore = new FirestoreGlobalQuotaStore(this.db);
    this.socialStore = new FirestoreSocialStore(this.db);
    this.contributionStore = new FirestoreContributionStore(this.db);
    this.publicationStore = new FirestorePublicationStore(this.db);
  }

  async getUser(uid: string): Promise<User | null> {
    return this.identityStore.getUser(uid);
  }

  async getUserByHandle(handle: string): Promise<User | null> {
    return this.identityStore.getUserByHandle(handle);
  }

  async getHandleReservation(handle: string): Promise<HandleRecord | null> {
    return this.identityStore.getHandleReservation(handle);
  }

  async claimHandle(uid: string, handle: string, at: string): Promise<ClaimHandleResult> {
    return this.identityStore.claimHandle(uid, handle, at);
  }

  async updateCreatorProfile(
    uid: string,
    patch: { profileName?: string; bio?: string; avatarMode?: AvatarMode },
  ): Promise<User | null> {
    return this.identityStore.updateCreatorProfile(uid, patch);
  }

  async releaseCreatorHandles(uid: string, at: string): Promise<string[]> {
    return this.identityStore.releaseCreatorHandles(uid, at);
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
    return this.identityStore.scheduleAccountDeletion(uid, requestedAt, scheduledFor);
  }

  async cancelAccountDeletion(uid: string): Promise<boolean> {
    return this.identityStore.cancelAccountDeletion(uid);
  }

  async listAccountsDueForDeletion(at: string, limit: number): Promise<User[]> {
    return this.identityStore.listAccountsDueForDeletion(at, limit);
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return this.identityStore.findUserByEmail(email);
  }

  async upsertUser(userData: Partial<User> & { uid: string }): Promise<User> {
    return this.identityStore.upsertUser(userData);
  }

  async setEmailUnsubscribed(uid: string, at: string | null): Promise<void> {
    return this.identityStore.setEmailUnsubscribed(uid, at);
  }

  async setDigestOptOut(uid: string, at: string | null): Promise<void> {
    return this.identityStore.setDigestOptOut(uid, at);
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
    return this.publicationStore.getPublication(slug);
  }

  async setPublication(record: PublicationRecord): Promise<void> {
    return this.publicationStore.setPublication(record);
  }

  async setPublicationHealthCheck(slug: string, check: PublicationHealthCheck): Promise<boolean> {
    return this.publicationStore.setPublicationHealthCheck(slug, check);
  }

  async takedownPublication(slug: string, reason: string, at: string): Promise<boolean> {
    return this.publicationStore.takedownPublication(slug, reason, at);
  }

  async archivePublication(slug: string, reason: string, at: string): Promise<boolean> {
    return this.publicationStore.archivePublication(slug, reason, at);
  }

  async listPublications(): Promise<PublicationRecord[]> {
    return this.publicationStore.listPublications();
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
    // `set(..., {merge: true})` on a doc that doesn't exist yet *creates* it — a stale or
    // bogus id from an agent's ack_inbox call would otherwise materialize a phantom
    // message with only `deliveredAt` and no `text`, which crashes every later reader
    // that assumes `text` is a string. Check existence first so a bad id is a no-op.
    const refs = ids.map((id) => collection.doc(id));
    const snaps = await this.db.getAll(...refs);
    const batch = this.db.batch();
    snaps.forEach((snap, index) => {
      if (snap.exists) batch.set(refs[index], { deliveredAt: at }, { merge: true });
    });
    await batch.commit();
  }

  async appendVisitEvents(dateStr: string, events: VisitEvent[]): Promise<void> {
    return this.telemetryStore.appendVisitEvents(dateStr, events);
  }

  async listVisitEvents(
    dateStr: string,
    opts?: { visitId?: string; limit?: number; type?: VisitEvent['type']; excludeType?: VisitEvent['type'] },
  ): Promise<VisitEvent[]> {
    return this.telemetryStore.listVisitEvents(dateStr, opts);
  }

  async appendTelemetryEvents(dateStr: string, events: TelemetryEvent[]): Promise<void> {
    return this.telemetryStore.appendTelemetryEvents(dateStr, events);
  }

  async listTelemetryEvents(dateStr: string, opts?: { slug?: string; limit?: number }): Promise<TelemetryEvent[]> {
    return this.telemetryStore.listTelemetryEvents(dateStr, opts);
  }

  async getUsage(uid: string, dateStr: string): Promise<UsageCounters> {
    return this.quotaStore.getUsage(uid, dateStr);
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
    return this.quotaStore.checkAndIncrementQuota(uid, dateStr, limit, action);
  }

  async getCreationLimits(): Promise<CreationLimits | null> {
    return this.quotaStore.getCreationLimits();
  }

  async setCreationLimits(
    patch: Partial<Omit<CreationLimits, 'updatedAt'>>,
    updatedBy: string,
  ): Promise<CreationLimits> {
    return this.quotaStore.setCreationLimits(patch, updatedBy);
  }

  async getPublicPlayConfig(): Promise<PublicPlayConfig | null> {
    return this.quotaStore.getPublicPlayConfig();
  }

  async setPublicPlaySlugs(slugs: string[], updatedBy: string): Promise<PublicPlayConfig> {
    return this.quotaStore.setPublicPlaySlugs(slugs, updatedBy);
  }

  async getFeaturedPoolConfig(): Promise<FeaturedPoolConfig | null> {
    return this.quotaStore.getFeaturedPoolConfig();
  }

  async setFeaturedPoolSlugs(slugs: string[], updatedBy: string): Promise<FeaturedPoolConfig> {
    return this.quotaStore.setFeaturedPoolSlugs(slugs, updatedBy);
  }

  async getGlobalSubmissionCount(dateStr: string): Promise<number> {
    return this.globalQuotaStore.getGlobalSubmissionCount(dateStr);
  }

  async getGlobalTabCompleteTokenCount(dateStr: string): Promise<number> {
    return this.globalQuotaStore.getGlobalTabCompleteTokenCount(dateStr);
  }

  async checkAndIncrementGlobalSubmissions(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    return this.globalQuotaStore.checkAndIncrementGlobalSubmissions(dateStr, limit);
  }

  async checkAndIncrementGlobalEdits(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }> {
    return this.globalQuotaStore.checkAndIncrementGlobalEdits(dateStr, limit);
  }

  async checkAndIncrementGlobalChats(dateStr: string, limit: number): Promise<{ allowed: boolean; current: number }> {
    return this.globalQuotaStore.checkAndIncrementGlobalChats(dateStr, limit);
  }

  async checkAndIncrementGlobalTabCompleteTokens(
    dateStr: string,
    tokens: number,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    return this.globalQuotaStore.checkAndIncrementGlobalTabCompleteTokens(dateStr, tokens, limit);
  }

  async adjustGlobalTabCompleteTokens(dateStr: string, delta: number): Promise<number> {
    return this.globalQuotaStore.adjustGlobalTabCompleteTokens(dateStr, delta);
  }

  async getGlobalManagedBuildCount(dateStr: string): Promise<number> {
    return this.globalQuotaStore.getGlobalManagedBuildCount(dateStr);
  }

  async checkAndIncrementGlobalManagedBuilds(
    dateStr: string,
    limit: number,
  ): Promise<{ allowed: boolean; current: number }> {
    return this.globalQuotaStore.checkAndIncrementGlobalManagedBuilds(dateStr, limit);
  }

  async upsertWaitlistEntry(entry: {
    uid: string;
    email?: string;
    name?: string;
    locale?: string;
  }): Promise<WaitlistEntry> {
    return this.accessStore.upsertWaitlistEntry(entry);
  }

  async getWaitlistEntry(uid: string): Promise<WaitlistEntry | null> {
    return this.accessStore.getWaitlistEntry(uid);
  }

  async isWaitlistApproved(uid: string, email?: string): Promise<boolean> {
    return this.accessStore.isWaitlistApproved(uid, email);
  }

  async setWaitlistStatus(uid: string, status: WaitlistStatus): Promise<WaitlistEntry | null> {
    return this.accessStore.setWaitlistStatus(uid, status);
  }

  async listWaitlistEntries(opts?: { status?: WaitlistStatus; limit?: number }): Promise<WaitlistEntry[]> {
    return this.accessStore.listWaitlistEntries(opts);
  }

  async countWaitlistEntries(status?: WaitlistStatus): Promise<number> {
    return this.accessStore.countWaitlistEntries(status);
  }

  async setWaitlistStatusByEmail(email: string, status: WaitlistStatus): Promise<WaitlistEntry> {
    return this.accessStore.setWaitlistStatusByEmail(email, status);
  }

  async recordBetaInviteAdmission(entry: {
    uid: string;
    email?: string;
    name?: string;
    locale?: string;
  }): Promise<WaitlistEntry> {
    return this.accessStore.recordBetaInviteAdmission(entry);
  }

  async createBetaInvite(createdByUid: string): Promise<CreatedBetaInvite> {
    return this.accessStore.createBetaInvite(createdByUid);
  }

  async listBetaInvites(opts?: { limit?: number }): Promise<BetaInvite[]> {
    return this.accessStore.listBetaInvites(opts);
  }

  async claimBetaInvite(code: string, uid: string): Promise<ClaimBetaInviteResult> {
    return this.accessStore.claimBetaInvite(code, uid);
  }

  async revokeBetaInvite(id: string, revokedByUid: string): Promise<BetaInvite | null> {
    return this.accessStore.revokeBetaInvite(id, revokedByUid);
  }

  async createNotification(
    uid: string,
    notification: Omit<StoredNotification, 'readAt' | 'emailedAt'> & { createdAt?: string },
  ): Promise<{ created: boolean; notification: StoredNotification }> {
    return this.notificationsStore.createNotification(uid, notification);
  }

  async listNotifications(uid: string, opts?: { limit?: number }): Promise<StoredNotification[]> {
    return this.notificationsStore.listNotifications(uid, opts);
  }

  async markNotificationsRead(uid: string, ids: string[] | 'all'): Promise<void> {
    return this.notificationsStore.markNotificationsRead(uid, ids);
  }

  async deleteNotifications(uid: string, ids: string[] | 'all'): Promise<void> {
    return this.notificationsStore.deleteNotifications(uid, ids);
  }

  async markNotificationEmailed(uid: string, id: string, at?: string): Promise<void> {
    return this.notificationsStore.markNotificationEmailed(uid, id, at);
  }

  async savePushSubscription(uid: string, subscription: Omit<PushSubscriptionRecord, 'createdAt'>): Promise<void> {
    return this.notificationsStore.savePushSubscription(uid, subscription);
  }

  async listPushSubscriptions(uid: string): Promise<PushSubscriptionRecord[]> {
    return this.notificationsStore.listPushSubscriptions(uid);
  }

  async deletePushSubscription(uid: string, endpoint: string): Promise<void> {
    return this.notificationsStore.deletePushSubscription(uid, endpoint);
  }

  async getVote(slug: string, uid: string): Promise<VoteValue | null> {
    return this.socialStore.getVote(slug, uid);
  }

  async castVote(slug: string, uid: string, value: VoteValue): Promise<GameVoteCounts> {
    return this.socialStore.castVote(slug, uid, value);
  }

  async clearVote(slug: string, uid: string): Promise<GameVoteCounts> {
    return this.socialStore.clearVote(slug, uid);
  }

  async setGameFollow(slug: string, uid: string, at: string): Promise<number> {
    return this.socialStore.setGameFollow(slug, uid, at);
  }

  async clearGameFollow(slug: string, uid: string): Promise<number> {
    return this.socialStore.clearGameFollow(slug, uid);
  }

  async isFollowingGame(slug: string, uid: string): Promise<boolean> {
    return this.socialStore.isFollowingGame(slug, uid);
  }

  async countGameFollowers(slug: string): Promise<number> {
    return this.socialStore.countGameFollowers(slug);
  }

  async listGameFollowers(slug: string, opts?: { limit?: number }): Promise<string[]> {
    return this.socialStore.listGameFollowers(slug, opts);
  }

  async getVoteCounts(slug: string): Promise<GameVoteCounts> {
    return this.socialStore.getVoteCounts(slug);
  }

  async getGameSave(uid: string, slug: string): Promise<GameSaveRecord | null> {
    return this.playerDataStore.getGameSave(uid, slug);
  }

  async putGameSave(uid: string, slug: string, data: string, version: number): Promise<GameSaveRecord> {
    return this.playerDataStore.putGameSave(uid, slug, data, version);
  }

  async deleteGameSave(uid: string, slug: string): Promise<void> {
    return this.playerDataStore.deleteGameSave(uid, slug);
  }

  async listGameSaves(uid: string): Promise<GameSaveRecord[]> {
    return this.playerDataStore.listGameSaves(uid);
  }

  async deleteGameSaves(uid: string): Promise<number> {
    return this.playerDataStore.deleteGameSaves(uid);
  }

  async getEditorDraft(uid: string, slug: string): Promise<EditorDraftRecord | null> {
    return this.playerDataStore.getEditorDraft(uid, slug);
  }

  async putEditorDraft(
    uid: string,
    slug: string,
    content: string,
    expectedRevision?: number,
  ): Promise<{ conflict: false; record: EditorDraftRecord } | { conflict: true; revision: number }> {
    return this.playerDataStore.putEditorDraft(uid, slug, content, expectedRevision);
  }

  async deleteEditorDraft(uid: string, slug: string): Promise<void> {
    return this.playerDataStore.deleteEditorDraft(uid, slug);
  }

  async listEditorDrafts(uid: string): Promise<EditorDraftRecord[]> {
    return this.playerDataStore.listEditorDrafts(uid);
  }

  async deleteEditorDrafts(uid: string): Promise<number> {
    return this.playerDataStore.deleteEditorDrafts(uid);
  }

  async recordPlayAffinity(uid: string, slug: string, at?: string): Promise<PlayAffinityRecord> {
    return this.playerDataStore.recordPlayAffinity(uid, slug, at);
  }

  async listPlayAffinity(uid: string): Promise<PlayAffinityRecord[]> {
    return this.playerDataStore.listPlayAffinity(uid);
  }

  async deletePlayAffinity(uid: string): Promise<number> {
    return this.playerDataStore.deletePlayAffinity(uid);
  }

  async listWorldEntries(worldId: string): Promise<WorldEntryRecord[]> {
    return this.worldEntriesStore.listWorldEntries(worldId);
  }

  async getWorldEntry(worldId: string, key: string): Promise<WorldEntryRecord | null> {
    return this.worldEntriesStore.getWorldEntry(worldId, key);
  }

  async putWorldEntry(options: {
    worldId: string;
    key: string;
    uid: string;
    fields: Record<string, string | number | boolean>;
    maxPerPlayer: number;
    maxEntries: number;
  }): Promise<{ ok: true; entry: WorldEntryRecord } | { ok: false; reason: 'conflict' | 'quota' | 'full' }> {
    return this.worldEntriesStore.putWorldEntry(options);
  }

  async deleteWorldEntry(worldId: string, key: string, uid: string): Promise<boolean> {
    return this.worldEntriesStore.deleteWorldEntry(worldId, key, uid);
  }

  async countWorldEntries(worldId: string, uid: string): Promise<number> {
    return this.worldEntriesStore.countWorldEntries(worldId, uid);
  }

  async listWorldsForUser(uid: string): Promise<string[]> {
    return this.worldEntriesStore.listWorldsForUser(uid);
  }

  async deleteWorldEntriesForUser(uid: string): Promise<number> {
    return this.worldEntriesStore.deleteWorldEntriesForUser(uid);
  }

  async addPlayerFeedback(slug: string, uid: string, text: string): Promise<PlayerFeedbackRecord> {
    return this.socialStore.addPlayerFeedback(slug, uid, text);
  }

  async listPlayerFeedback(slug: string, opts?: { limit?: number }): Promise<PlayerFeedbackRecord[]> {
    return this.socialStore.listPlayerFeedback(slug, opts);
  }

  async countPlayerFeedback(slug: string): Promise<number> {
    return this.socialStore.countPlayerFeedback(slug);
  }

  async upsertGameAssessment(
    input: Omit<GameAssessment, 'id' | 'createdAt' | 'updatedAt' | 'gameVersion' | 'resolution'> & {
      createdAt?: string;
      gameVersion?: string | null;
    },
  ): Promise<GameAssessment> {
    return this.reviewStore.upsertGameAssessment(input);
  }

  async getGameAssessment(slug: string, reviewerUid: string): Promise<GameAssessment | null> {
    return this.reviewStore.getGameAssessment(slug, reviewerUid);
  }

  async setGameAssessmentResolution(
    slug: string,
    reviewerUid: string,
    resolution: AssessmentResolution | null,
    expectedUpdatedAt?: string,
  ): Promise<ResolutionWriteResult> {
    return this.reviewStore.setGameAssessmentResolution(slug, reviewerUid, resolution, expectedUpdatedAt);
  }

  async listGameAssessmentsBySlug(slug: string): Promise<GameAssessment[]> {
    return this.reviewStore.listGameAssessmentsBySlug(slug);
  }

  async listGameAssessmentsByReviewer(reviewerUid: string): Promise<GameAssessment[]> {
    return this.reviewStore.listGameAssessmentsByReviewer(reviewerUid);
  }

  async listGameAssessments(opts?: { limit?: number }): Promise<GameAssessment[]> {
    return this.reviewStore.listGameAssessments(opts);
  }

  async listGameAssessmentsBySource(source: AssessmentSource): Promise<GameAssessment[]> {
    return this.reviewStore.listGameAssessmentsBySource(source);
  }

  async countGameAssessmentsByUid(uid: string): Promise<number> {
    return this.reviewStore.countGameAssessmentsByUid(uid);
  }

  async listGameAssessmentHistory(slug: string, reviewerUid: string): Promise<GameAssessmentHistoryEntry[]> {
    return this.reviewStore.listGameAssessmentHistory(slug, reviewerUid);
  }

  async upsertReReviewRequests(
    requests: Array<Pick<ReReviewRequest, 'slug' | 'reviewerUid' | 'gameVersion' | 'reason' | 'createdBy'>>,
  ): Promise<ReReviewRequest[]> {
    return this.reviewStore.upsertReReviewRequests(requests);
  }

  async getReReviewRequest(slug: string, reviewerUid: string): Promise<ReReviewRequest | null> {
    return this.reviewStore.getReReviewRequest(slug, reviewerUid);
  }

  async listOpenReReviewRequestsForReviewer(reviewerUid: string): Promise<ReReviewRequest[]> {
    return this.reviewStore.listOpenReReviewRequestsForReviewer(reviewerUid);
  }

  async listReReviewRequests(opts?: { limit?: number }): Promise<ReReviewRequest[]> {
    return this.reviewStore.listReReviewRequests(opts);
  }

  async resolveReReviewRequest(slug: string, reviewerUid: string): Promise<ReReviewRequest | null> {
    return this.reviewStore.resolveReReviewRequest(slug, reviewerUid);
  }

  async deleteGameAssessmentsByUid(uid: string): Promise<number> {
    return this.reviewStore.deleteGameAssessmentsByUid(uid);
  }

  async getOpenReviewSweep(): Promise<ReviewSweep | null> {
    return this.reviewSweepStore.getOpenReviewSweep();
  }

  async getReviewSweep(id: string): Promise<ReviewSweep | null> {
    return this.reviewSweepStore.getReviewSweep(id);
  }

  async listReviewSweeps(opts?: { limit?: number }): Promise<ReviewSweep[]> {
    return this.reviewSweepStore.listReviewSweeps(opts);
  }

  async createReviewSweep(sweep: ReviewSweep): Promise<ReviewSweep> {
    return this.reviewSweepStore.createReviewSweep(sweep);
  }

  async updateReviewSweep(
    id: string,
    patch: Partial<Omit<ReviewSweep, 'id' | 'createdAt' | 'createdBy' | 'slugs' | 'source'>>,
  ): Promise<ReviewSweep | null> {
    return this.reviewSweepStore.updateReviewSweep(id, patch);
  }

  async putScorecard(slug: string, scorecard: Scorecard): Promise<void> {
    return this.reviewSweepStore.putScorecard(slug, scorecard);
  }

  async listScorecards(opts?: { limit?: number }): Promise<Scorecard[]> {
    return this.reviewSweepStore.listScorecards(opts);
  }

  async listGameSlugs(): Promise<string[]> {
    // `listDocuments()` rather than `get()`: it lists references without reading
    // documents, and — the part that matters here — it includes games whose parent
    // document was never written but which have subcollections underneath. A game that
    // only ever received feedback is exactly that case, and a `get()` would miss it.
    const refs = await this.db.collection('games').listDocuments();
    return refs.map((ref) => ref.id).sort();
  }

  async deletePlayerFeedbackByUid(uid: string): Promise<number> {
    return this.socialStore.deletePlayerFeedbackByUid(uid);
  }

  async countPlayerFeedbackByUid(uid: string): Promise<number> {
    return this.socialStore.countPlayerFeedbackByUid(uid);
  }

  async getScorecard(slug: string): Promise<Scorecard | null> {
    return this.reviewSweepStore.getScorecard(slug);
  }

  async purgeLegacyGameSuggestions(limit: number): Promise<number> {
    return this.contributionStore.purgeLegacyGameSuggestions(limit);
  }

  async getGameAutonomy(slug: string): Promise<string | null> {
    return this.contributionStore.getGameAutonomy(slug);
  }

  async setGameAutonomy(slug: string, mode: string): Promise<void> {
    return this.contributionStore.setGameAutonomy(slug, mode);
  }

  async putSuggestion(record: SuggestionRecord): Promise<void> {
    return this.contributionStore.putSuggestion(record);
  }

  async getSuggestion(id: string): Promise<SuggestionRecord | null> {
    return this.contributionStore.getSuggestion(id);
  }

  async listSuggestions(opts?: {
    status?: SuggestionStatus[];
    ownerUid?: string;
    limit?: number;
  }): Promise<SuggestionRecord[]> {
    return this.contributionStore.listSuggestions(opts);
  }

  async putProposal(record: ProposalRecord): Promise<void> {
    return this.contributionStore.putProposal(record);
  }

  async getProposal(id: string): Promise<ProposalRecord | null> {
    return this.contributionStore.getProposal(id);
  }

  async listProposals(opts?: {
    proposerUid?: string;
    targetOwnerUid?: string | null;
    targetSlug?: string;
    state?: ProposalState[];
    limit?: number;
  }): Promise<ProposalRecord[]> {
    return this.contributionStore.listProposals(opts);
  }

  async getContributionSettings(slug: string): Promise<GameContributionSettings | null> {
    return this.contributionStore.getContributionSettings(slug);
  }

  async putContributionSettings(record: GameContributionSettings): Promise<void> {
    return this.contributionStore.putContributionSettings(record);
  }

  async isContributorBlocked(ownerUid: string, blockedUid: string): Promise<boolean> {
    return this.contributionStore.isContributorBlocked(ownerUid, blockedUid);
  }

  async blockContributor(record: ContributorBlockRecord): Promise<void> {
    return this.contributionStore.blockContributor(record);
  }

  async unblockContributor(ownerUid: string, blockedUid: string): Promise<void> {
    return this.contributionStore.unblockContributor(ownerUid, blockedUid);
  }

  async listContributorBlocks(ownerUid: string): Promise<ContributorBlockRecord[]> {
    return this.contributionStore.listContributorBlocks(ownerUid);
  }

  async createAccessToken(record: AccessTokenRecord): Promise<void> {
    return this.accessTokensStore.createAccessToken(record);
  }

  async getAccessToken(tokenId: string): Promise<AccessTokenRecord | null> {
    return this.accessTokensStore.getAccessToken(tokenId);
  }

  async listAccessTokens(uid: string): Promise<AccessTokenRecord[]> {
    return this.accessTokensStore.listAccessTokens(uid);
  }

  async deleteAccessToken(tokenId: string): Promise<boolean> {
    return this.accessTokensStore.deleteAccessToken(tokenId);
  }

  async getGameAgentKey(slug: string): Promise<GameAgentKeyRecord | null> {
    return this.agentKeysStore.getGameAgentKey(slug);
  }

  async ensureGameAgentKey(slug: string, ownerUid: string, at: string): Promise<GameAgentKeyRecord | null> {
    return this.agentKeysStore.ensureGameAgentKey(slug, ownerUid, at);
  }

  async rotateGameAgentKey(slug: string, ownerUid: string, at: string): Promise<GameAgentKeyRecord | null> {
    return this.agentKeysStore.rotateGameAgentKey(slug, ownerUid, at);
  }

  async beginAgentOpenRound(slug: string, at: string): Promise<boolean> {
    return this.agentKeysStore.beginAgentOpenRound(slug, at);
  }

  async finishAgentOpenRound(slug: string, at: string): Promise<void> {
    return this.agentKeysStore.finishAgentOpenRound(slug, at);
  }

  async getCreatorAgentKey(ownerUid: string): Promise<CreatorAgentKeyRecord | null> {
    return this.agentKeysStore.getCreatorAgentKey(ownerUid);
  }

  async ensureCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord> {
    return this.agentKeysStore.ensureCreatorAgentKey(ownerUid, at);
  }

  async reactivateCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord> {
    return this.agentKeysStore.reactivateCreatorAgentKey(ownerUid, at);
  }

  async rotateCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null> {
    return this.agentKeysStore.rotateCreatorAgentKey(ownerUid, at);
  }

  async touchCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null> {
    return this.agentKeysStore.touchCreatorAgentKey(ownerUid, at);
  }

  async revokeCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null> {
    return this.agentKeysStore.revokeCreatorAgentKey(ownerUid, at);
  }

  async touchAccessToken(tokenId: string, at: string): Promise<void> {
    return this.accessTokensStore.touchAccessToken(tokenId, at);
  }

  async createOAuthClient(record: OAuthClientRecord): Promise<void> {
    return this.oauthStore.createOAuthClient(record);
  }

  async getOAuthClient(clientId: string): Promise<OAuthClientRecord | null> {
    return this.oauthStore.getOAuthClient(clientId);
  }

  async createOAuthGrant(record: OAuthGrantRecord): Promise<void> {
    return this.oauthStore.createOAuthGrant(record);
  }

  async getOAuthGrant(grantId: string): Promise<OAuthGrantRecord | null> {
    return this.oauthStore.getOAuthGrant(grantId);
  }

  async getOAuthGrantByRefreshTokenId(refreshTokenId: string): Promise<OAuthGrantRecord | null> {
    return this.oauthStore.getOAuthGrantByRefreshTokenId(refreshTokenId);
  }

  async listOAuthGrantsByOwner(ownerUid: string): Promise<OAuthGrantRecord[]> {
    return this.oauthStore.listOAuthGrantsByOwner(ownerUid);
  }

  async revokeOAuthGrant(grantId: string, ownerUid: string): Promise<boolean> {
    return this.oauthStore.revokeOAuthGrant(grantId, ownerUid);
  }

  async createOAuthAccessToken(record: OAuthAccessTokenRecord): Promise<void> {
    return this.oauthStore.createOAuthAccessToken(record);
  }

  async getOAuthAccessToken(tokenId: string): Promise<OAuthAccessTokenRecord | null> {
    return this.oauthStore.getOAuthAccessToken(tokenId);
  }

  async deleteOAuthAccessToken(tokenId: string): Promise<boolean> {
    return this.oauthStore.deleteOAuthAccessToken(tokenId);
  }

  async createOAuthAuthCode(record: OAuthAuthCodeRecord): Promise<void> {
    return this.oauthStore.createOAuthAuthCode(record);
  }

  async consumeOAuthAuthCode(codeId: string, codeHash: string, nowMs: number): Promise<OAuthAuthCodeRecord | null> {
    return this.oauthStore.consumeOAuthAuthCode(codeId, codeHash, nowMs);
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
    return this.oauthStore.rotateOAuthRefreshToken(input);
  }

  async issueOAuthTokensFromGrant(input: {
    grantId: string;
    refreshTokenId: string;
    refreshHash: string;
    refreshExpiresAt: string;
    accessToken: OAuthAccessTokenRecord;
    nowMs: number;
  }): Promise<OAuthGrantRecord | null> {
    return this.oauthStore.issueOAuthTokensFromGrant(input);
  }
}
