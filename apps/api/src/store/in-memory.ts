import type { Store } from '../platform/store.js';
import type { SeedFiles } from '../agent-surface/agent-backend.js';
import type { ProposalState } from '../community/proposal-state.js';
import type { AgentTaskState } from '../creation/agent-state.js';
import type { BuilderKind } from '../creation/builder.js';
import type { AgentSessionTokens, JobTransition } from '../creation/job-state.js';
import type { PublicationHealthCheck, PublicationRecord } from '../delivery/games-store.js';
import type { AvatarMode } from '../platform/creator-profile.js';
import type { BuildEvent, SubmissionStatus } from '../platform/submission-status.js';
import type { AccessTokenRecord } from './records/access-tokens.js';
import type { BetaInvite, ClaimBetaInviteResult, CreatedBetaInvite, WaitlistEntry } from './records/access.js';
import type { CreatorAgentKeyRecord, GameAgentKeyRecord } from './records/agent-keys.js';
import type {
  BuildPreview,
  BuildPreviewSummary,
  BuildShot,
  BuildShotSummary,
  CreatorMessage,
  CreatorMessageOrigin,
} from './records/build-log.js';
import type { CatalogEnrichmentRecord } from './records/catalog-enrichment.js';
import type {
  ContributorBlockRecord,
  GameContributionSettings,
  ProposalRecord,
  SuggestionRecord,
  SuggestionStatus,
} from './records/contribution.js';
import type { JobCostEntry, JobSeedOutcome } from './records/dispatch.js';
import { DELETED_ACCOUNT_UID } from './records/identity.js';
import type { AccountIdentityDeletionResult, ClaimHandleResult, HandleRecord, User } from './records/identity.js';
import type { PushSubscriptionRecord, StoredNotification } from './records/notifications.js';
import type {
  OAuthAccessTokenRecord,
  OAuthAuthCodeRecord,
  OAuthClientRecord,
  OAuthGrantRecord,
  RotateRefreshTokenResult,
} from './records/oauth.js';
import type { EditorDraftRecord, GameSaveRecord, PlayAffinityRecord, WorldEntryRecord } from './records/player-data.js';
import type { CreationLimits, FeaturedPoolConfig, PublicPlayConfig, UsageCounters } from './records/quota.js';
import type {
  AssessmentResolution,
  GameAssessment,
  GameAssessmentHistoryEntry,
  ReReviewRequest,
  ResolutionWriteResult,
  ReviewSweep,
  Scorecard,
} from './records/review.js';
import type { AgentEndedBy, BuilderHandoff } from './records/rounds.js';
import type { GameVoteCounts, PlayerFeedbackRecord } from './records/social.js';
import type { SubmissionRecord } from './records/submission.js';
import type { TelemetryEvent, VisitEvent } from './records/telemetry.js';
import { InMemoryAccessTokensStore } from './slices/access-tokens.js';
import { InMemoryAccessStore } from './slices/access.js';
import { InMemoryAgentKeysStore } from './slices/agent-keys.js';
import { InMemoryBuildLogStore } from './slices/build-log.js';
import { InMemoryBuildMediaStore } from './slices/build-media.js';
import { InMemoryCatalogEnrichmentStore } from './slices/catalog-enrichment.js';
import { InMemoryContributionStore } from './slices/contribution.js';
import { InMemoryDispatchStore } from './slices/dispatch.js';
import { InMemoryIdentityStore } from './slices/identity.js';
import { InMemoryNotificationsStore } from './slices/notifications.js';
import { InMemoryOAuthStore } from './slices/oauth.js';
import { InMemoryPlayerDataStore } from './slices/player-data.js';
import { InMemoryPublicationStore } from './slices/publication.js';
import { InMemoryGlobalQuotaStore } from './slices/quota-global.js';
import { InMemoryQuotaStore } from './slices/quota.js';
import { InMemoryReviewSweepStore } from './slices/review-sweeps.js';
import { InMemoryReviewStore } from './slices/review.js';
import { InMemoryRoundBudgetStore } from './slices/round-budget.js';
import { InMemoryRoundsStore } from './slices/rounds.js';
import { InMemorySocialStore } from './slices/social.js';
import { InMemorySubmissionQueryStore } from './slices/submission-queries.js';
import { InMemorySubmissionStore } from './slices/submission.js';
import { InMemoryTelemetryStore } from './slices/telemetry.js';
import { InMemoryWorldEntriesStore } from './slices/world-entries.js';
import type { AssessmentSource, VoteValue, WaitlistStatus } from '@gamedevpl/contract';

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
  private catalogEnrichmentStore = new InMemoryCatalogEnrichmentStore();
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
      this.submissions.set(submission.jobId, {
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

  async createSubmission(jobId: number, ownerUid: string, title: string): Promise<SubmissionRecord> {
    return this.submissionStore.createSubmission(jobId, ownerUid, title);
  }

  async getSubmission(jobId: number): Promise<SubmissionRecord | null> {
    return this.submissionStore.getSubmission(jobId);
  }

  async setSubmissionNotifiedStatus(jobId: number, status: SubmissionStatus): Promise<void> {
    return this.submissionStore.setSubmissionNotifiedStatus(jobId, status);
  }

  async setSubmissionLastStatus(jobId: number, status: SubmissionStatus): Promise<void> {
    return this.submissionStore.setSubmissionLastStatus(jobId, status);
  }

  async recordJobTransition(jobId: number, transition: JobTransition): Promise<boolean> {
    return this.dispatchStore.recordJobTransition(jobId, transition);
  }

  async bumpRoundGeneration(jobId: number): Promise<number | null> {
    return this.roundsStore.bumpRoundGeneration(jobId);
  }

  async pinRoundKitEngineRef(jobId: number, engineRef: string, replace = false): Promise<string | null> {
    return this.roundsStore.pinRoundKitEngineRef(jobId, engineRef, replace);
  }

  async requestBuilderHandoff(
    jobId: number,
    to: BuilderKind,
    requestedAt: string,
    awaitsAgentAck = true,
  ): Promise<boolean> {
    return this.roundsStore.requestBuilderHandoff(jobId, to, requestedAt, awaitsAgentAck);
  }

  async claimSeal(jobId: number, at: string): Promise<SubmissionRecord | null> {
    return this.roundsStore.claimSeal(jobId, at);
  }

  async acknowledgeBuilderHandoff(jobId: number, acknowledgedAt: string): Promise<BuilderHandoff | null> {
    return this.roundsStore.acknowledgeBuilderHandoff(jobId, acknowledgedAt);
  }

  async clearBuilderHandoff(jobId: number): Promise<void> {
    return this.roundsStore.clearBuilderHandoff(jobId);
  }

  async ensureRoundGeneration(jobId: number): Promise<number | null> {
    return this.roundsStore.ensureRoundGeneration(jobId);
  }

  async clearAgentEnded(jobId: number): Promise<void> {
    return this.roundsStore.clearAgentEnded(jobId);
  }

  async setSubmissionAgentState(jobId: number, agentState: AgentTaskState): Promise<void> {
    return this.roundsStore.setSubmissionAgentState(jobId, agentState);
  }

  async setRoundBuilder(jobId: number, builder: BuilderKind, options?: { resetRoundBudget?: boolean }): Promise<void> {
    return this.roundsStore.setRoundBuilder(jobId, builder, options);
  }

  async setSubmissionSeed(jobId: number, seed: SeedFiles | null): Promise<void> {
    return this.roundsStore.setSubmissionSeed(jobId, seed);
  }

  async setSeedStatus(jobId: number, status: 'pending' | 'unavailable'): Promise<void> {
    return this.roundsStore.setSeedStatus(jobId, status);
  }

  async incrementSeedRegenerations(jobId: number): Promise<number> {
    return this.roundBudgetStore.incrementSeedRegenerations(jobId);
  }

  async incrementRoundDeliveryCount(jobId: number): Promise<number> {
    return this.roundBudgetStore.incrementRoundDeliveryCount(jobId);
  }

  async incrementRoundTypecheckPreflightRefusals(jobId: number): Promise<number> {
    return this.roundBudgetStore.incrementRoundTypecheckPreflightRefusals(jobId);
  }

  async setRoundTypecheckPreflightBypassErrors(jobId: number, message: string | null): Promise<void> {
    return this.roundBudgetStore.setRoundTypecheckPreflightBypassErrors(jobId, message);
  }

  async incrementRoundSubmitAttempts(jobId: number): Promise<number> {
    return this.roundBudgetStore.incrementRoundSubmitAttempts(jobId);
  }

  async incrementRoundPreflightRefusal(jobId: number, kind: 'audio' | 'symbols'): Promise<number> {
    return this.roundBudgetStore.incrementRoundPreflightRefusal(jobId, kind);
  }

  async setRoundLastGateMetricKey(jobId: number, key: string): Promise<void> {
    return this.roundBudgetStore.setRoundLastGateMetricKey(jobId, key);
  }

  async allocateJobId(): Promise<number> {
    return this.dispatchStore.allocateJobId();
  }

  async recordDispatch(
    jobId: number,
    dispatch: { backend: string; ref: string; workspace?: string; seedWorkspace?: string; credentialRef?: string },
  ): Promise<void> {
    return this.dispatchStore.recordDispatch(jobId, dispatch);
  }

  async clearDispatchSeedWorkspace(jobId: number): Promise<void> {
    return this.dispatchStore.clearDispatchSeedWorkspace(jobId);
  }

  async recordSeedOutcome(jobId: number, outcome: JobSeedOutcome): Promise<void> {
    return this.dispatchStore.recordSeedOutcome(jobId, outcome);
  }

  async listSeedOutcomesSince(since: string): Promise<JobSeedOutcome[]> {
    return this.dispatchStore.listSeedOutcomesSince(since);
  }

  async recordJobCost(jobId: number, entry: JobCostEntry): Promise<void> {
    return this.dispatchStore.recordJobCost(jobId, entry);
  }

  async setJobCostCredits(jobId: number, ref: string, credits: number): Promise<void> {
    return this.dispatchStore.setJobCostCredits(jobId, ref, credits);
  }

  async setJobCostTokens(jobId: number, ref: string, tokens: AgentSessionTokens): Promise<void> {
    return this.dispatchStore.setJobCostTokens(jobId, ref, tokens);
  }

  async setDispatchWorkspace(jobId: number, workspace: string): Promise<void> {
    return this.dispatchStore.setDispatchWorkspace(jobId, workspace);
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

  async getCatalogEnrichment(slug: string): Promise<CatalogEnrichmentRecord | null> {
    return this.catalogEnrichmentStore.getCatalogEnrichment(slug);
  }

  async setCatalogEnrichment(record: CatalogEnrichmentRecord): Promise<void> {
    return this.catalogEnrichmentStore.setCatalogEnrichment(record);
  }

  async listCatalogEnrichments(): Promise<CatalogEnrichmentRecord[]> {
    return this.catalogEnrichmentStore.listCatalogEnrichments();
  }

  async setSubmissionSlug(jobId: number, slug: string): Promise<void> {
    return this.submissionStore.setSubmissionSlug(jobId, slug);
  }

  async setSubmissionTitle(jobId: number, title: string): Promise<void> {
    return this.submissionStore.setSubmissionTitle(jobId, title);
  }

  async setSubmissionDeliveredVersion(jobId: number, version: string): Promise<void> {
    return this.submissionStore.setSubmissionDeliveredVersion(jobId, version);
  }

  async setSubmissionPreviewVersion(jobId: number, version: string): Promise<void> {
    return this.submissionStore.setSubmissionPreviewVersion(jobId, version);
  }

  async recordDeliveryNudge(jobId: number): Promise<number> {
    return this.submissionStore.recordDeliveryNudge(jobId);
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

  async setSubmissionPublishedAt(jobId: number, at: string): Promise<void> {
    return this.submissionStore.setSubmissionPublishedAt(jobId, at);
  }

  async setSubmissionAbandoned(jobId: number, at: string): Promise<void> {
    return this.submissionStore.setSubmissionAbandoned(jobId, at);
  }

  async setDraftShared(jobId: number, at: string | null): Promise<void> {
    return this.submissionStore.setDraftShared(jobId, at);
  }

  async setSubmissionLocale(jobId: number, locale: string): Promise<void> {
    return this.submissionStore.setSubmissionLocale(jobId, locale);
  }

  async setSubmissionClarificationCount(jobId: number, count: number): Promise<void> {
    return this.submissionStore.setSubmissionClarificationCount(jobId, count);
  }

  async setSubmissionBrief(
    jobId: number,
    brief: { spec: string; qa: string[]; specIsSystemGenerated?: boolean },
  ): Promise<void> {
    return this.submissionStore.setSubmissionBrief(jobId, brief);
  }

  async appendBuildEvent(
    jobId: number,
    event: Omit<BuildEvent, 'id' | 'createdAt'> & { createdAt?: string },
    options?: { preserveEnded?: boolean },
  ): Promise<BuildEvent> {
    return this.buildLogStore.appendBuildEvent(jobId, event, options);
  }

  async touchLastAgentSignalAt(
    jobId: number,
    at?: string,
    presence?: { key: string },
    options?: { preserveEnded?: boolean },
  ): Promise<void> {
    return this.buildLogStore.touchLastAgentSignalAt(jobId, at, presence, options);
  }

  async markAgentEnded(jobId: number, at?: string, by: AgentEndedBy = 'end'): Promise<void> {
    return this.buildLogStore.markAgentEnded(jobId, at, by);
  }

  async listBuildEvents(jobId: number, opts?: { limit?: number }): Promise<BuildEvent[]> {
    return this.buildLogStore.listBuildEvents(jobId, opts);
  }

  async countBuildEvents(jobId: number): Promise<number> {
    return this.buildLogStore.countBuildEvents(jobId);
  }

  async appendBuildShot(
    jobId: number,
    shot: Omit<BuildShot, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildShot> {
    return this.buildMediaStore.appendBuildShot(jobId, shot);
  }

  async listBuildShots(jobId: number, opts?: { limit?: number }): Promise<BuildShotSummary[]> {
    return this.buildMediaStore.listBuildShots(jobId, opts);
  }

  async getBuildShot(jobId: number, id: string): Promise<BuildShot | null> {
    return this.buildMediaStore.getBuildShot(jobId, id);
  }

  async countBuildShots(jobId: number): Promise<number> {
    return this.buildMediaStore.countBuildShots(jobId);
  }

  async appendBuildPreview(
    jobId: number,
    preview: Omit<BuildPreview, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildPreview> {
    return this.buildMediaStore.appendBuildPreview(jobId, preview);
  }

  async listBuildPreviews(jobId: number, opts?: { limit?: number }): Promise<BuildPreviewSummary[]> {
    return this.buildMediaStore.listBuildPreviews(jobId, opts);
  }

  async getBuildPreview(jobId: number, id: string): Promise<BuildPreview | null> {
    return this.buildMediaStore.getBuildPreview(jobId, id);
  }

  async countBuildPreviews(jobId: number): Promise<number> {
    return this.buildMediaStore.countBuildPreviews(jobId);
  }

  async pruneBuildPreviews(jobId: number, keep: number): Promise<number> {
    return this.buildMediaStore.pruneBuildPreviews(jobId, keep);
  }

  async appendCreatorMessage(
    jobId: number,
    text: string,
    opts?: { origin?: CreatorMessageOrigin; delivered?: boolean; textLocalized?: string; locale?: string },
  ): Promise<CreatorMessage> {
    return this.buildLogStore.appendCreatorMessage(jobId, text, opts);
  }

  async listPendingCreatorMessages(jobId: number, opts?: { limit?: number }): Promise<CreatorMessage[]> {
    return this.buildLogStore.listPendingCreatorMessages(jobId, opts);
  }

  async listCreatorMessages(jobId: number, opts?: { limit?: number }): Promise<CreatorMessage[]> {
    return this.buildLogStore.listCreatorMessages(jobId, opts);
  }

  async markCreatorMessagesDelivered(jobId: number, ids: string[]): Promise<void> {
    return this.buildLogStore.markCreatorMessagesDelivered(jobId, ids);
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

  async listOpenRoundsByOwner(ownerUid: string): Promise<SubmissionRecord[]> {
    return this.submissionQueryStore.listOpenRoundsByOwner(ownerUid);
  }

  async listQueuedSubmissions(): Promise<SubmissionRecord[]> {
    return this.submissionQueryStore.listQueuedSubmissions();
  }

  async claimDispatchReaperAttempt(jobId: number, at: string): Promise<boolean> {
    return this.dispatchStore.claimDispatchReaperAttempt(jobId, at);
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
