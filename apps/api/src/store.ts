import { FieldValue, Firestore } from '@google-cloud/firestore';
import type { AssessmentSource, VoteValue, WaitlistStatus } from '@gamedevpl/contract';
import type { AgentTaskState } from './agent-state.js';
import type { SeedFiles } from './agent-backend.js';
import type { BuilderKind } from './builder.js';
import type { PublicationHealthCheck, PublicationRecord } from './delivery/games-store.js';
import type { AvatarMode } from './creator-profile.js';
import type { AgentSessionTokens, JobTransition } from './job-state.js';
import type { ProposalState } from './community/proposal-state.js';
import type { BuildEvent, SubmissionStatus } from './submission-status.js';
import type { PublicationStore } from './store/slices/publication.js';
export type { PublicationStore };
import { InMemoryPublicationStore, FirestorePublicationStore } from './store/slices/publication.js';
import type { RoundsStore } from './store/slices/rounds.js';
export type { RoundsStore };
import { InMemoryRoundsStore, FirestoreRoundsStore } from './store/slices/rounds.js';
import type { RoundBudgetStore } from './store/slices/round-budget.js';
export type { RoundBudgetStore };
import { InMemoryRoundBudgetStore, FirestoreRoundBudgetStore } from './store/slices/round-budget.js';
import type { DispatchStore } from './store/slices/dispatch.js';
export type { DispatchStore };
import { InMemoryDispatchStore, FirestoreDispatchStore } from './store/slices/dispatch.js';
import type { SubmissionStore } from './store/slices/submission.js';
export type { SubmissionStore };
import { InMemorySubmissionStore, FirestoreSubmissionStore } from './store/slices/submission.js';
import type { SubmissionQueryStore } from './store/slices/submission-queries.js';
export type { SubmissionQueryStore };
import { InMemorySubmissionQueryStore, FirestoreSubmissionQueryStore } from './store/slices/submission-queries.js';
import type { BuildLogStore } from './store/slices/build-log.js';
export type { BuildLogStore };
import { InMemoryBuildLogStore, FirestoreBuildLogStore } from './store/slices/build-log.js';
import type { BuildMediaStore } from './store/slices/build-media.js';
export type { BuildMediaStore };
import { InMemoryBuildMediaStore, FirestoreBuildMediaStore } from './store/slices/build-media.js';

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

// RoundsStore, InMemoryRoundsStore and FirestoreRoundsStore live in
// ./store/slices/rounds.js; RoundBudgetStore and its implementations live in
// ./store/slices/round-budget.js (Phase 2 wave 4).

// DispatchStore, InMemoryDispatchStore and FirestoreDispatchStore live in
// ./store/slices/dispatch.js -- imported at the top of the file (Phase 2 wave 4).

// SubmissionStore and SubmissionQueryStore, their InMemory and Firestore
// implementations, live in ./store/slices/submission.js and
// ./store/slices/submission-queries.js (Phase 2 wave 4).

// BuildLogStore and BuildMediaStore, their InMemory and Firestore
// implementations, live in ./store/slices/build-log.js and
// ./store/slices/build-media.js (Phase 2 wave 4).

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
    OAuthStore {}

// compareSuggestions moved to ./store/slices/contribution.js; emptyUsageCounters moved
// to ./store/slices/quota.js; byNewestFirst moved to ./store/slices/build-log.js
// (Phase 2 wave 4). None is used elsewhere in this file.

export class InMemoryStore implements Store {
  private identityStore = new InMemoryIdentityStore();
  private submissions = new Map<number, SubmissionRecord>();
  private publicationStore = new InMemoryPublicationStore();
  private roundsStore = new InMemoryRoundsStore(this.submissions);
  private roundBudgetStore = new InMemoryRoundBudgetStore(this.submissions);
  private dispatchStore = new InMemoryDispatchStore(this.submissions);
  private submissionStore = new InMemorySubmissionStore(this.submissions);
  private submissionQueryStore = new InMemorySubmissionQueryStore(this.submissions);
  private buildLogStore = new InMemoryBuildLogStore(this.submissions);
  private buildMediaStore = new InMemoryBuildMediaStore();
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
    return this.submissionStore.createSubmission(issueNumber, ownerUid, title);
  }

  async getSubmission(issueNumber: number): Promise<SubmissionRecord | null> {
    return this.submissionStore.getSubmission(issueNumber);
  }

  async setSubmissionNotifiedStatus(issueNumber: number, status: SubmissionStatus): Promise<void> {
    return this.submissionStore.setSubmissionNotifiedStatus(issueNumber, status);
  }

  async setSubmissionLastStatus(issueNumber: number, status: SubmissionStatus): Promise<void> {
    return this.submissionStore.setSubmissionLastStatus(issueNumber, status);
  }

  async recordJobTransition(issueNumber: number, transition: JobTransition): Promise<boolean> {
    return this.dispatchStore.recordJobTransition(issueNumber, transition);
  }

  async bumpRoundGeneration(issueNumber: number): Promise<number | null> {
    return this.roundsStore.bumpRoundGeneration(issueNumber);
  }

  async pinRoundKitEngineRef(issueNumber: number, engineRef: string, replace = false): Promise<string | null> {
    return this.roundsStore.pinRoundKitEngineRef(issueNumber, engineRef, replace);
  }

  async requestBuilderHandoff(
    issueNumber: number,
    to: BuilderKind,
    requestedAt: string,
    awaitsAgentAck = true,
  ): Promise<boolean> {
    return this.roundsStore.requestBuilderHandoff(issueNumber, to, requestedAt, awaitsAgentAck);
  }

  async acknowledgeBuilderHandoff(issueNumber: number, acknowledgedAt: string): Promise<BuilderHandoff | null> {
    return this.roundsStore.acknowledgeBuilderHandoff(issueNumber, acknowledgedAt);
  }

  async clearBuilderHandoff(issueNumber: number): Promise<void> {
    return this.roundsStore.clearBuilderHandoff(issueNumber);
  }

  async ensureRoundGeneration(issueNumber: number): Promise<number | null> {
    return this.roundsStore.ensureRoundGeneration(issueNumber);
  }

  async clearAgentEnded(issueNumber: number): Promise<void> {
    return this.roundsStore.clearAgentEnded(issueNumber);
  }

  async setSubmissionAgentState(issueNumber: number, agentState: AgentTaskState): Promise<void> {
    return this.roundsStore.setSubmissionAgentState(issueNumber, agentState);
  }

  async setRoundBuilder(
    issueNumber: number,
    builder: BuilderKind,
    options?: { resetRoundBudget?: boolean },
  ): Promise<void> {
    return this.roundsStore.setRoundBuilder(issueNumber, builder, options);
  }

  async setSubmissionSeed(issueNumber: number, seed: SeedFiles | null): Promise<void> {
    return this.roundsStore.setSubmissionSeed(issueNumber, seed);
  }

  async setSeedStatus(issueNumber: number, status: 'pending' | 'unavailable'): Promise<void> {
    return this.roundsStore.setSeedStatus(issueNumber, status);
  }

  async incrementSeedRegenerations(issueNumber: number): Promise<number> {
    return this.roundBudgetStore.incrementSeedRegenerations(issueNumber);
  }

  async incrementRoundDeliveryCount(issueNumber: number): Promise<number> {
    return this.roundBudgetStore.incrementRoundDeliveryCount(issueNumber);
  }

  async incrementRoundTypecheckPreflightRefusals(issueNumber: number): Promise<number> {
    return this.roundBudgetStore.incrementRoundTypecheckPreflightRefusals(issueNumber);
  }

  async setRoundTypecheckPreflightBypassErrors(issueNumber: number, message: string | null): Promise<void> {
    return this.roundBudgetStore.setRoundTypecheckPreflightBypassErrors(issueNumber, message);
  }

  async incrementRoundSubmitAttempts(issueNumber: number): Promise<number> {
    return this.roundBudgetStore.incrementRoundSubmitAttempts(issueNumber);
  }

  async incrementRoundPreflightRefusal(issueNumber: number, kind: 'audio' | 'symbols'): Promise<number> {
    return this.roundBudgetStore.incrementRoundPreflightRefusal(issueNumber, kind);
  }

  async setRoundLastGateMetricKey(issueNumber: number, key: string): Promise<void> {
    return this.roundBudgetStore.setRoundLastGateMetricKey(issueNumber, key);
  }

  async allocateJobId(): Promise<number> {
    return this.dispatchStore.allocateJobId();
  }

  async recordDispatch(
    issueNumber: number,
    dispatch: { backend: string; ref: string; workspace?: string; seedWorkspace?: string; credentialRef?: string },
  ): Promise<void> {
    return this.dispatchStore.recordDispatch(issueNumber, dispatch);
  }

  async clearDispatchSeedWorkspace(issueNumber: number): Promise<void> {
    return this.dispatchStore.clearDispatchSeedWorkspace(issueNumber);
  }

  async recordSeedOutcome(issueNumber: number, outcome: JobSeedOutcome): Promise<void> {
    return this.dispatchStore.recordSeedOutcome(issueNumber, outcome);
  }

  async listSeedOutcomesSince(since: string): Promise<JobSeedOutcome[]> {
    return this.dispatchStore.listSeedOutcomesSince(since);
  }

  async recordJobCost(issueNumber: number, entry: JobCostEntry): Promise<void> {
    return this.dispatchStore.recordJobCost(issueNumber, entry);
  }

  async setJobCostCredits(issueNumber: number, ref: string, credits: number): Promise<void> {
    return this.dispatchStore.setJobCostCredits(issueNumber, ref, credits);
  }

  async setJobCostTokens(issueNumber: number, ref: string, tokens: AgentSessionTokens): Promise<void> {
    return this.dispatchStore.setJobCostTokens(issueNumber, ref, tokens);
  }

  async setDispatchWorkspace(issueNumber: number, workspace: string): Promise<void> {
    return this.dispatchStore.setDispatchWorkspace(issueNumber, workspace);
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
    return this.submissionStore.setSubmissionSlug(issueNumber, slug);
  }

  async setSubmissionTitle(issueNumber: number, title: string): Promise<void> {
    return this.submissionStore.setSubmissionTitle(issueNumber, title);
  }

  async setSubmissionDeliveredVersion(issueNumber: number, version: string): Promise<void> {
    return this.submissionStore.setSubmissionDeliveredVersion(issueNumber, version);
  }

  async setSubmissionPreviewVersion(issueNumber: number, version: string): Promise<void> {
    return this.submissionStore.setSubmissionPreviewVersion(issueNumber, version);
  }

  async recordDeliveryNudge(issueNumber: number): Promise<number> {
    return this.submissionStore.recordDeliveryNudge(issueNumber);
  }

  async getSubmissionBySlug(slug: string): Promise<SubmissionRecord | null> {
    return this.submissionQueryStore.getSubmissionBySlug(slug);
  }

  async listSubmissionsBySlug(slug: string): Promise<SubmissionRecord[]> {
    return this.submissionQueryStore.listSubmissionsBySlug(slug);
  }

  async getPublishedSubmissionBySlug(slug: string): Promise<SubmissionRecord | null> {
    return this.submissionQueryStore.getPublishedSubmissionBySlug(slug);
  }

  async setSubmissionPublishedAt(issueNumber: number, at: string): Promise<void> {
    return this.submissionStore.setSubmissionPublishedAt(issueNumber, at);
  }

  async setSubmissionAbandoned(issueNumber: number, at: string): Promise<void> {
    return this.submissionStore.setSubmissionAbandoned(issueNumber, at);
  }

  async setDraftShared(issueNumber: number, at: string | null): Promise<void> {
    return this.submissionStore.setDraftShared(issueNumber, at);
  }

  async setSubmissionLocale(issueNumber: number, locale: string): Promise<void> {
    return this.submissionStore.setSubmissionLocale(issueNumber, locale);
  }

  async setSubmissionClarificationCount(issueNumber: number, count: number): Promise<void> {
    return this.submissionStore.setSubmissionClarificationCount(issueNumber, count);
  }

  async setSubmissionBrief(
    issueNumber: number,
    brief: { spec: string; qa: string[]; specIsSystemGenerated?: boolean },
  ): Promise<void> {
    return this.submissionStore.setSubmissionBrief(issueNumber, brief);
  }

  async appendBuildEvent(
    issueNumber: number,
    event: Omit<BuildEvent, 'id' | 'createdAt'> & { createdAt?: string },
    options?: { preserveEnded?: boolean },
  ): Promise<BuildEvent> {
    return this.buildLogStore.appendBuildEvent(issueNumber, event, options);
  }

  async touchLastAgentSignalAt(
    issueNumber: number,
    at?: string,
    presence?: { key: string },
    options?: { preserveEnded?: boolean },
  ): Promise<void> {
    return this.buildLogStore.touchLastAgentSignalAt(issueNumber, at, presence, options);
  }

  async markAgentEnded(issueNumber: number, at?: string, by: AgentEndedBy = 'end'): Promise<void> {
    return this.buildLogStore.markAgentEnded(issueNumber, at, by);
  }

  async listBuildEvents(issueNumber: number, opts?: { limit?: number }): Promise<BuildEvent[]> {
    return this.buildLogStore.listBuildEvents(issueNumber, opts);
  }

  async countBuildEvents(issueNumber: number): Promise<number> {
    return this.buildLogStore.countBuildEvents(issueNumber);
  }

  async appendBuildShot(
    issueNumber: number,
    shot: Omit<BuildShot, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildShot> {
    return this.buildMediaStore.appendBuildShot(issueNumber, shot);
  }

  async listBuildShots(issueNumber: number, opts?: { limit?: number }): Promise<BuildShotSummary[]> {
    return this.buildMediaStore.listBuildShots(issueNumber, opts);
  }

  async getBuildShot(issueNumber: number, id: string): Promise<BuildShot | null> {
    return this.buildMediaStore.getBuildShot(issueNumber, id);
  }

  async countBuildShots(issueNumber: number): Promise<number> {
    return this.buildMediaStore.countBuildShots(issueNumber);
  }

  async appendBuildPreview(
    issueNumber: number,
    preview: Omit<BuildPreview, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildPreview> {
    return this.buildMediaStore.appendBuildPreview(issueNumber, preview);
  }

  async listBuildPreviews(issueNumber: number, opts?: { limit?: number }): Promise<BuildPreviewSummary[]> {
    return this.buildMediaStore.listBuildPreviews(issueNumber, opts);
  }

  async getBuildPreview(issueNumber: number, id: string): Promise<BuildPreview | null> {
    return this.buildMediaStore.getBuildPreview(issueNumber, id);
  }

  async countBuildPreviews(issueNumber: number): Promise<number> {
    return this.buildMediaStore.countBuildPreviews(issueNumber);
  }

  async pruneBuildPreviews(issueNumber: number, keep: number): Promise<number> {
    return this.buildMediaStore.pruneBuildPreviews(issueNumber, keep);
  }

  async appendCreatorMessage(
    issueNumber: number,
    text: string,
    opts?: { origin?: CreatorMessageOrigin; delivered?: boolean; textLocalized?: string; locale?: string },
  ): Promise<CreatorMessage> {
    return this.buildLogStore.appendCreatorMessage(issueNumber, text, opts);
  }

  async listPendingCreatorMessages(issueNumber: number, opts?: { limit?: number }): Promise<CreatorMessage[]> {
    return this.buildLogStore.listPendingCreatorMessages(issueNumber, opts);
  }

  async listCreatorMessages(issueNumber: number, opts?: { limit?: number }): Promise<CreatorMessage[]> {
    return this.buildLogStore.listCreatorMessages(issueNumber, opts);
  }

  async markCreatorMessagesDelivered(issueNumber: number, ids: string[]): Promise<void> {
    return this.buildLogStore.markCreatorMessagesDelivered(issueNumber, ids);
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
    return this.submissionQueryStore.listRecentlyPublished(limit);
  }

  async listActiveSubmissions(): Promise<SubmissionRecord[]> {
    return this.submissionQueryStore.listActiveSubmissions();
  }

  async listSubmissionsMissingSlug(): Promise<SubmissionRecord[]> {
    return this.submissionQueryStore.listSubmissionsMissingSlug();
  }

  async listSubmissionsWithDelivery(): Promise<SubmissionRecord[]> {
    return this.submissionQueryStore.listSubmissionsWithDelivery();
  }

  async listSubmissionsByOwner(ownerUid: string, opts?: { limit?: number }): Promise<SubmissionRecord[]> {
    return this.submissionQueryStore.listSubmissionsByOwner(ownerUid, opts);
  }

  async listQueuedSubmissions(): Promise<SubmissionRecord[]> {
    return this.submissionQueryStore.listQueuedSubmissions();
  }

  async claimDispatchReaperAttempt(issueNumber: number, at: string): Promise<boolean> {
    return this.dispatchStore.claimDispatchReaperAttempt(issueNumber, at);
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
  private roundsStore: FirestoreRoundsStore;
  private roundBudgetStore: FirestoreRoundBudgetStore;
  private dispatchStore: FirestoreDispatchStore;
  private submissionStore: FirestoreSubmissionStore;
  private submissionQueryStore: FirestoreSubmissionQueryStore;
  private buildLogStore: FirestoreBuildLogStore;
  private buildMediaStore: FirestoreBuildMediaStore;

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
    this.roundsStore = new FirestoreRoundsStore(this.db);
    this.roundBudgetStore = new FirestoreRoundBudgetStore(this.db);
    this.dispatchStore = new FirestoreDispatchStore(this.db);
    this.submissionStore = new FirestoreSubmissionStore(this.db);
    this.submissionQueryStore = new FirestoreSubmissionQueryStore(this.db);
    this.buildLogStore = new FirestoreBuildLogStore(this.db);
    this.buildMediaStore = new FirestoreBuildMediaStore(this.db);
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
    return this.submissionStore.createSubmission(issueNumber, ownerUid, title);
  }

  async getSubmission(issueNumber: number): Promise<SubmissionRecord | null> {
    return this.submissionStore.getSubmission(issueNumber);
  }

  async setSubmissionNotifiedStatus(issueNumber: number, status: SubmissionStatus): Promise<void> {
    return this.submissionStore.setSubmissionNotifiedStatus(issueNumber, status);
  }

  async setSubmissionLastStatus(issueNumber: number, status: SubmissionStatus): Promise<void> {
    return this.submissionStore.setSubmissionLastStatus(issueNumber, status);
  }

  async recordJobTransition(issueNumber: number, transition: JobTransition): Promise<boolean> {
    return this.dispatchStore.recordJobTransition(issueNumber, transition);
  }

  async bumpRoundGeneration(issueNumber: number): Promise<number | null> {
    return this.roundsStore.bumpRoundGeneration(issueNumber);
  }

  async pinRoundKitEngineRef(issueNumber: number, engineRef: string, replace = false): Promise<string | null> {
    return this.roundsStore.pinRoundKitEngineRef(issueNumber, engineRef, replace);
  }

  async requestBuilderHandoff(
    issueNumber: number,
    to: BuilderKind,
    requestedAt: string,
    awaitsAgentAck = true,
  ): Promise<boolean> {
    return this.roundsStore.requestBuilderHandoff(issueNumber, to, requestedAt, awaitsAgentAck);
  }

  async acknowledgeBuilderHandoff(issueNumber: number, acknowledgedAt: string): Promise<BuilderHandoff | null> {
    return this.roundsStore.acknowledgeBuilderHandoff(issueNumber, acknowledgedAt);
  }

  async clearBuilderHandoff(issueNumber: number): Promise<void> {
    return this.roundsStore.clearBuilderHandoff(issueNumber);
  }

  async ensureRoundGeneration(issueNumber: number): Promise<number | null> {
    return this.roundsStore.ensureRoundGeneration(issueNumber);
  }

  async clearAgentEnded(issueNumber: number): Promise<void> {
    return this.roundsStore.clearAgentEnded(issueNumber);
  }

  async setSubmissionAgentState(issueNumber: number, agentState: AgentTaskState): Promise<void> {
    return this.roundsStore.setSubmissionAgentState(issueNumber, agentState);
  }

  async setRoundBuilder(
    issueNumber: number,
    builder: BuilderKind,
    options?: { resetRoundBudget?: boolean },
  ): Promise<void> {
    return this.roundsStore.setRoundBuilder(issueNumber, builder, options);
  }

  async setSubmissionSeed(issueNumber: number, seed: SeedFiles | null): Promise<void> {
    return this.roundsStore.setSubmissionSeed(issueNumber, seed);
  }

  async setSeedStatus(issueNumber: number, status: 'pending' | 'unavailable'): Promise<void> {
    return this.roundsStore.setSeedStatus(issueNumber, status);
  }

  async incrementSeedRegenerations(issueNumber: number): Promise<number> {
    return this.roundBudgetStore.incrementSeedRegenerations(issueNumber);
  }

  async incrementRoundDeliveryCount(issueNumber: number): Promise<number> {
    return this.roundBudgetStore.incrementRoundDeliveryCount(issueNumber);
  }

  async incrementRoundTypecheckPreflightRefusals(issueNumber: number): Promise<number> {
    return this.roundBudgetStore.incrementRoundTypecheckPreflightRefusals(issueNumber);
  }

  async setRoundTypecheckPreflightBypassErrors(issueNumber: number, message: string | null): Promise<void> {
    return this.roundBudgetStore.setRoundTypecheckPreflightBypassErrors(issueNumber, message);
  }

  async incrementRoundSubmitAttempts(issueNumber: number): Promise<number> {
    return this.roundBudgetStore.incrementRoundSubmitAttempts(issueNumber);
  }

  async incrementRoundPreflightRefusal(issueNumber: number, kind: 'audio' | 'symbols'): Promise<number> {
    return this.roundBudgetStore.incrementRoundPreflightRefusal(issueNumber, kind);
  }

  async setRoundLastGateMetricKey(issueNumber: number, key: string): Promise<void> {
    return this.roundBudgetStore.setRoundLastGateMetricKey(issueNumber, key);
  }

  async allocateJobId(): Promise<number> {
    return this.dispatchStore.allocateJobId();
  }

  async recordDispatch(
    issueNumber: number,
    dispatch: { backend: string; ref: string; workspace?: string; seedWorkspace?: string; credentialRef?: string },
  ): Promise<void> {
    return this.dispatchStore.recordDispatch(issueNumber, dispatch);
  }

  async recordSeedOutcome(issueNumber: number, outcome: JobSeedOutcome): Promise<void> {
    return this.dispatchStore.recordSeedOutcome(issueNumber, outcome);
  }

  async listSeedOutcomesSince(since: string): Promise<JobSeedOutcome[]> {
    return this.dispatchStore.listSeedOutcomesSince(since);
  }

  async recordJobCost(issueNumber: number, entry: JobCostEntry): Promise<void> {
    return this.dispatchStore.recordJobCost(issueNumber, entry);
  }

  async setJobCostCredits(issueNumber: number, ref: string, credits: number): Promise<void> {
    return this.dispatchStore.setJobCostCredits(issueNumber, ref, credits);
  }

  async setJobCostTokens(issueNumber: number, ref: string, tokens: AgentSessionTokens): Promise<void> {
    return this.dispatchStore.setJobCostTokens(issueNumber, ref, tokens);
  }

  async setDispatchWorkspace(issueNumber: number, workspace: string): Promise<void> {
    return this.dispatchStore.setDispatchWorkspace(issueNumber, workspace);
  }

  async clearDispatchSeedWorkspace(issueNumber: number): Promise<void> {
    return this.dispatchStore.clearDispatchSeedWorkspace(issueNumber);
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
    return this.submissionStore.setSubmissionSlug(issueNumber, slug);
  }

  async setSubmissionTitle(issueNumber: number, title: string): Promise<void> {
    return this.submissionStore.setSubmissionTitle(issueNumber, title);
  }

  async setSubmissionDeliveredVersion(issueNumber: number, version: string): Promise<void> {
    return this.submissionStore.setSubmissionDeliveredVersion(issueNumber, version);
  }

  async setSubmissionPreviewVersion(issueNumber: number, version: string): Promise<void> {
    return this.submissionStore.setSubmissionPreviewVersion(issueNumber, version);
  }

  async recordDeliveryNudge(issueNumber: number): Promise<number> {
    return this.submissionStore.recordDeliveryNudge(issueNumber);
  }

  async setSubmissionPublishedAt(issueNumber: number, at: string): Promise<void> {
    return this.submissionStore.setSubmissionPublishedAt(issueNumber, at);
  }

  async setSubmissionAbandoned(issueNumber: number, at: string): Promise<void> {
    return this.submissionStore.setSubmissionAbandoned(issueNumber, at);
  }

  async setDraftShared(issueNumber: number, at: string | null): Promise<void> {
    return this.submissionStore.setDraftShared(issueNumber, at);
  }

  async setSubmissionLocale(issueNumber: number, locale: string): Promise<void> {
    return this.submissionStore.setSubmissionLocale(issueNumber, locale);
  }

  async setSubmissionClarificationCount(issueNumber: number, count: number): Promise<void> {
    return this.submissionStore.setSubmissionClarificationCount(issueNumber, count);
  }

  async setSubmissionBrief(
    issueNumber: number,
    brief: { spec: string; qa: string[]; specIsSystemGenerated?: boolean },
  ): Promise<void> {
    return this.submissionStore.setSubmissionBrief(issueNumber, brief);
  }

  async appendBuildEvent(
    issueNumber: number,
    event: Omit<BuildEvent, 'id' | 'createdAt'> & { createdAt?: string },
    options?: { preserveEnded?: boolean },
  ): Promise<BuildEvent> {
    return this.buildLogStore.appendBuildEvent(issueNumber, event, options);
  }

  async touchLastAgentSignalAt(
    issueNumber: number,
    at?: string,
    presence?: { key: string },
    options?: { preserveEnded?: boolean },
  ): Promise<void> {
    return this.buildLogStore.touchLastAgentSignalAt(issueNumber, at, presence, options);
  }

  async markAgentEnded(issueNumber: number, at?: string, by: AgentEndedBy = 'end'): Promise<void> {
    return this.buildLogStore.markAgentEnded(issueNumber, at, by);
  }

  async listBuildEvents(issueNumber: number, opts?: { limit?: number }): Promise<BuildEvent[]> {
    return this.buildLogStore.listBuildEvents(issueNumber, opts);
  }

  async countBuildEvents(issueNumber: number): Promise<number> {
    return this.buildLogStore.countBuildEvents(issueNumber);
  }

  async appendBuildShot(
    issueNumber: number,
    shot: Omit<BuildShot, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildShot> {
    return this.buildMediaStore.appendBuildShot(issueNumber, shot);
  }

  async listBuildShots(issueNumber: number, opts?: { limit?: number }): Promise<BuildShotSummary[]> {
    return this.buildMediaStore.listBuildShots(issueNumber, opts);
  }

  async getBuildShot(issueNumber: number, id: string): Promise<BuildShot | null> {
    return this.buildMediaStore.getBuildShot(issueNumber, id);
  }

  async countBuildShots(issueNumber: number): Promise<number> {
    return this.buildMediaStore.countBuildShots(issueNumber);
  }

  async appendBuildPreview(
    issueNumber: number,
    preview: Omit<BuildPreview, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildPreview> {
    return this.buildMediaStore.appendBuildPreview(issueNumber, preview);
  }

  async listBuildPreviews(issueNumber: number, opts?: { limit?: number }): Promise<BuildPreviewSummary[]> {
    return this.buildMediaStore.listBuildPreviews(issueNumber, opts);
  }

  async getBuildPreview(issueNumber: number, id: string): Promise<BuildPreview | null> {
    return this.buildMediaStore.getBuildPreview(issueNumber, id);
  }

  async countBuildPreviews(issueNumber: number): Promise<number> {
    return this.buildMediaStore.countBuildPreviews(issueNumber);
  }

  async pruneBuildPreviews(issueNumber: number, keep: number): Promise<number> {
    return this.buildMediaStore.pruneBuildPreviews(issueNumber, keep);
  }

  async appendCreatorMessage(
    issueNumber: number,
    text: string,
    opts?: { origin?: CreatorMessageOrigin; delivered?: boolean; textLocalized?: string; locale?: string },
  ): Promise<CreatorMessage> {
    return this.buildLogStore.appendCreatorMessage(issueNumber, text, opts);
  }

  async listPendingCreatorMessages(issueNumber: number, opts?: { limit?: number }): Promise<CreatorMessage[]> {
    return this.buildLogStore.listPendingCreatorMessages(issueNumber, opts);
  }

  async listCreatorMessages(issueNumber: number, opts?: { limit?: number }): Promise<CreatorMessage[]> {
    return this.buildLogStore.listCreatorMessages(issueNumber, opts);
  }

  async markCreatorMessagesDelivered(issueNumber: number, ids: string[]): Promise<void> {
    return this.buildLogStore.markCreatorMessagesDelivered(issueNumber, ids);
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
    return this.submissionQueryStore.listRecentlyPublished(limit);
  }

  async getSubmissionBySlug(slug: string): Promise<SubmissionRecord | null> {
    return this.submissionQueryStore.getSubmissionBySlug(slug);
  }

  async listSubmissionsBySlug(slug: string): Promise<SubmissionRecord[]> {
    return this.submissionQueryStore.listSubmissionsBySlug(slug);
  }

  async getPublishedSubmissionBySlug(slug: string): Promise<SubmissionRecord | null> {
    return this.submissionQueryStore.getPublishedSubmissionBySlug(slug);
  }

  async listActiveSubmissions(): Promise<SubmissionRecord[]> {
    return this.submissionQueryStore.listActiveSubmissions();
  }

  async listSubmissionsMissingSlug(): Promise<SubmissionRecord[]> {
    return this.submissionQueryStore.listSubmissionsMissingSlug();
  }

  async listSubmissionsWithDelivery(): Promise<SubmissionRecord[]> {
    return this.submissionQueryStore.listSubmissionsWithDelivery();
  }

  async listSubmissionsByOwner(ownerUid: string, opts?: { limit?: number }): Promise<SubmissionRecord[]> {
    return this.submissionQueryStore.listSubmissionsByOwner(ownerUid, opts);
  }

  async listQueuedSubmissions(): Promise<SubmissionRecord[]> {
    return this.submissionQueryStore.listQueuedSubmissions();
  }

  async claimDispatchReaperAttempt(issueNumber: number, at: string): Promise<boolean> {
    return this.dispatchStore.claimDispatchReaperAttempt(issueNumber, at);
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
