import type { PublicationStore } from '../store/slices/publication.js';
export type { PublicationStore };
import type { RoundsStore } from '../store/slices/rounds.js';
export type { RoundsStore };
import type { RoundBudgetStore } from '../store/slices/round-budget.js';
export type { RoundBudgetStore };
import type { DispatchStore } from '../store/slices/dispatch.js';
export type { DispatchStore };
import type { SubmissionStore } from '../store/slices/submission.js';
export type { SubmissionStore };
import type { SubmissionQueryStore } from '../store/slices/submission-queries.js';
export type { SubmissionQueryStore };
import type { BuildLogStore } from '../store/slices/build-log.js';
export type { BuildLogStore };
import type { BuildMediaStore } from '../store/slices/build-media.js';
export type { BuildMediaStore };
import type { CatalogEnrichmentStore } from '../store/slices/catalog-enrichment.js';
export type { CatalogEnrichmentStore };
import type { CatalogEnrichmentRecord } from '../store/records/catalog-enrichment.js';
export type { CatalogEnrichmentRecord };

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
import type {
  User,
  HandleRecord,
  AccountIdentityDeletionResult,
  ClaimHandleResult,
} from '../store/records/identity.js';
export type { User, HandleRecord, AccountIdentityDeletionResult, ClaimHandleResult };
import { DELETED_ACCOUNT_UID, ACTIVE_DAYS_KEPT, withActiveDay } from '../store/records/identity.js';
export { DELETED_ACCOUNT_UID, ACTIVE_DAYS_KEPT, withActiveDay };
import type { IdentityStore } from '../store/slices/identity.js';
export type { IdentityStore };
import type { BuilderHandoff, AgentEndedBy } from '../store/records/rounds.js';
export type { BuilderHandoff, AgentEndedBy };
import type { SubmissionRecord } from '../store/records/submission.js';
export type { SubmissionRecord };
import type { JobSeedOutcome, JobCostEntry } from '../store/records/dispatch.js';
export type { JobSeedOutcome, JobCostEntry };
import {
  MAX_JOB_COSTS,
  applyMeasuredTokens,
  MAX_JOB_TRANSITIONS,
  JOB_ID_FLOOR,
  dispatchAttempt,
} from '../store/records/dispatch.js';
export { MAX_JOB_COSTS, applyMeasuredTokens, MAX_JOB_TRANSITIONS, JOB_ID_FLOOR, dispatchAttempt };
import type {
  CreatorMessage,
  CreatorMessageOrigin,
  BuildShot,
  BuildShotSummary,
  BuildPreview,
  BuildPreviewSummary,
} from '../store/records/build-log.js';
export type { CreatorMessage, CreatorMessageOrigin, BuildShot, BuildShotSummary, BuildPreview, BuildPreviewSummary };
import { isStudioOrigin } from '../store/records/build-log.js';
export { isStudioOrigin };
import type { CreationLimits, PublicPlayConfig, FeaturedPoolConfig, UsageCounters } from '../store/records/quota.js';
export type { CreationLimits, PublicPlayConfig, FeaturedPoolConfig, UsageCounters };
import type { QuotaStore } from '../store/slices/quota.js';
export type { QuotaStore };
import type { GlobalQuotaStore } from '../store/slices/quota-global.js';
export type { GlobalQuotaStore };
import type { TelemetryEventType, TelemetryEvent, VisitEvent } from '../store/records/telemetry.js';
export type { TelemetryEventType, TelemetryEvent, VisitEvent };
// The retention constants (TELEMETRY_TTL_FIELD, telemetryExpiresAt, ...) are no longer
// re-exported here -- their only consumers were InMemoryStore/FirestoreStore, both now in
// ./store/slices/telemetry.js, and store.test.ts, now store/records/telemetry.test.ts.
import type { TelemetryStore } from '../store/slices/telemetry.js';
export type { TelemetryStore };
import type { OAuthStore } from '../store/slices/oauth.js';
export type { OAuthStore };
import type { CliChatStore } from '../store/slices/cli-chat.js';
export type { CliChatStore };
import type { PlayerDataStore } from '../store/slices/player-data.js';
export type { PlayerDataStore };
import type { WorldEntriesStore } from '../store/slices/world-entries.js';
export type { WorldEntriesStore };
import type {
  NotificationType,
  ProposalNotificationType,
  SubmissionNotificationType,
  OperatorNotificationType,
  StoredNotification,
} from '../store/records/notifications.js';
export type {
  NotificationType,
  ProposalNotificationType,
  SubmissionNotificationType,
  OperatorNotificationType,
  StoredNotification,
};
import type { NotificationsStore } from '../store/slices/notifications.js';
export type { NotificationsStore };
import type { GameVoteCounts, PlayerFeedbackRecord } from '../store/records/social.js';
export type { GameVoteCounts, PlayerFeedbackRecord };
import type { SocialStore } from '../store/slices/social.js';
export type { SocialStore };
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
} from '../store/records/review.js';
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
import type { ReviewStore } from '../store/slices/review.js';
export type { ReviewStore };
import type { ReviewSweepStore } from '../store/slices/review-sweeps.js';
export type { ReviewSweepStore };
import type {
  GameSaveRecord,
  EditorDraftRecord,
  PlayAffinityRecord,
  WorldEntryRecord,
} from '../store/records/player-data.js';
export type { GameSaveRecord, EditorDraftRecord, PlayAffinityRecord, WorldEntryRecord };
import { MAX_EDITOR_DRAFT_BYTES, MAX_GAME_SAVE_BYTES } from '../store/records/player-data.js';
export { MAX_EDITOR_DRAFT_BYTES, MAX_GAME_SAVE_BYTES };
import type {
  SuggestionStatus,
  SuggestionRecord,
  ProposalBase,
  ProposalMessage,
  ProposalRecord,
  GameContributionSettings,
  ContributorBlockRecord,
} from '../store/records/contribution.js';
export type {
  SuggestionStatus,
  SuggestionRecord,
  ProposalBase,
  ProposalMessage,
  ProposalRecord,
  GameContributionSettings,
  ContributorBlockRecord,
};
import { OPEN_SUGGESTION_STATUSES, MAX_PROPOSAL_MESSAGES, compareProposals } from '../store/records/contribution.js';
export { OPEN_SUGGESTION_STATUSES, MAX_PROPOSAL_MESSAGES, compareProposals };
import type { ContributionStore } from '../store/slices/contribution.js';
export type { ContributionStore };
import type { WaitlistEntry, BetaInvite, CreatedBetaInvite, ClaimBetaInviteResult } from '../store/records/access.js';
export type { WaitlistEntry, BetaInvite, CreatedBetaInvite, ClaimBetaInviteResult };
import type { AccessStore } from '../store/slices/access.js';
export type { AccessStore };
import type { AccessTokenRecord } from '../store/records/access-tokens.js';
export type { AccessTokenRecord };
import type { AccessTokensStore } from '../store/slices/access-tokens.js';
export type { AccessTokensStore };
import type { GameAgentKeyRecord, CreatorAgentKeyRecord } from '../store/records/agent-keys.js';
export type { GameAgentKeyRecord, CreatorAgentKeyRecord };
import type { AgentKeysStore } from '../store/slices/agent-keys.js';
export type { AgentKeysStore };
import type {
  OAuthClientRecord,
  OAuthGrantRecord,
  OAuthAccessTokenRecord,
  OAuthAuthCodeRecord,
  RotateRefreshTokenResult,
} from '../store/records/oauth.js';
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

// Slice implementations live next to each interface; this file only composes them.

// Not delegated -- InMemory's listGameSlugs reaches into Social/Contribution/Review's
// Maps, which a delegate-only PublicationStore slice must not depend on.
export interface GameSlugsStore {
  // Every slug with a `games/{slug}` entry, including doc-less games with only
  // subcollections (votes, feedback, scorecard) -- the erase path's game-discovery walk.
  listGameSlugs(): Promise<string[]>;
}

export interface Store
  extends
    IdentityStore,
    AccountErasureStore,
    RoundsStore,
    RoundBudgetStore,
    DispatchStore,
    SubmissionStore,
    SubmissionQueryStore,
    BuildLogStore,
    BuildMediaStore,
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
    CatalogEnrichmentStore,
    OAuthStore,
    CliChatStore {}

// The two implementations moved to ./store/in-memory.js and ./store/firestore.js.

// Re-exported here so every importer keeps the one name it already uses.
export { InMemoryStore } from '../store/in-memory.js';
export { FirestoreStore } from '../store/firestore.js';
