import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AgentChannelOptions } from './agent-surface/agent-channel.js';
import type { McpServerOptions } from './agent-surface/mcp-server.js';
import { isMcpPresenceEventText } from './agent-surface/mcp-presence.js';
import { registerNotifySweepRoutes } from './notifications/notify-sweep-routes.js';
import {
  createCreationGate,
  createChatGate,
  createGateRunGate,
  createSearchGate,
  type ChatGate,
  type CreationGate,
} from './creation/creation-limits.js';
import {
  createManagedAvailabilityGate,
  type ManagedAvailabilityGate,
  type ManagedUnavailableReason,
} from './agent-surface/managed-availability.js';
import {
  createGitHubClient,
  parseSpecTitle,
  type CatalogGameEntry,
  type GitHubClient,
} from './catalog/github-client.js';
import { createSnapshotReaderFromEnv, type GameSnapshotReader } from './catalog/game-snapshot.js';
import { registerAdminGameRoutes } from './catalog/admin-game-routes.js';
import { createSlugResolver } from './catalog/slug-resolver.js';
import { registerSelfBuildConnectRoutes } from './agent-surface/self-build-connect-routes.js';
import { registerDraftLifecycleRoutes } from './creation/draft-lifecycle-routes.js';
import { registerCliChatRoutes } from './creation/cli-chat-routes.js';
import { createGameCreator, registerCreateGameRoute } from './creation/create-game.js';
import {
  createSeedDispatchClientFromEnv,
  type DispatchQueuedJob,
  type SeedDispatchClient,
} from './creation/seed-dispatch.js';
import type { IntakeAgent } from './creation/intake-agent.js';
import { createDispatcher } from './creation/dispatch-build.js';
import { createResumeBuild, type ResumeOutcome } from './creation/resume-build.js';
import { createJobReconciler } from './creation/job-reconciler.js';
import { registerHandoffSealRoutes } from './creation/handoff-seal-routes.js';
import { registerFeedbackRoutes } from './creation/feedback-routes.js';
import { registerImproveRoutes } from './creation/improve-routes.js';
import { createSeedPipeline, type SeedPipeline } from './creation/seed-pipeline.js';
import { registerCreatorSelfRoutes } from './creation/creator-self-routes.js';
import { registerCatalogRoutes } from './catalog/catalog-routes.js';
import { registerGamePlayRoute } from './catalog/game-play-route.js';
import { registerCatalogSearchRoutes } from './catalog/catalog-search-routes.js';
import { registerDraftPreviewRoutes } from './delivery/draft-preview-routes.js';
import { registerCreatorMediaRoutes } from './delivery/creator-media.js';
import { probeGateCrash } from './delivery/gate-crash.js';
import { postGateScreenshotToThread } from './delivery/gate-screenshot.js';
import { createBuildStatusAssembler } from './delivery/build-status.js';
import { createChatOrchestration } from './creation/chat-orchestration.js';
import { createStagedPreviewPublisher, type StagedPreviewOptions } from './delivery/staged-preview.js';
import { createInternalAuthVerifierFromEnv, type InternalAuthVerifier } from './platform/internal-auth.js';
import type { AgentBackend, SeedFiles } from './agent-surface/agent-backend.js';
import {
  createAgentBackendRegistryFromEnv,
  resolveBuilderBackend,
  type AgentBackendRegistry,
  type ManagedBackendDeps,
} from './agent-surface/agent-backend-env.js';
import { createSeedProvidersFromEnv } from './creation/seed-provider-env.js';
import { createSeedAvailabilityGate, type SeedAvailabilityGate } from './creation/seed-availability.js';
import { isActiveBuildRound, type BuilderKind } from './creation/builder.js';
import { codeSurfaceEnabled, isLiveAgentRound } from './creation/code-surface.js';
import { sessionCrashStall } from './creation/session-crash.js';
import { selfBuildDeliveryCap } from './platform/self-build-delivery-cap.js';
import {
  runTypecheckPreflight,
  sharedSourcesFromKitTree,
  TYPECHECK_PREFLIGHT_MAX_REFUSALS,
} from './creation/typecheck-preflight.js';
import { DEFAULT_SEED_PROVIDER, type GameSeeder } from './creation/game-seed.js';
import { createSourceDeliveryService } from './delivery/source-delivery.js';
import { createKitFileStore } from './agent-surface/kit-files.js';
import {
  canTransition,
  isTerminal,
  planObservedStatusTransition,
  resolveJobState,
  type JobState,
  type JobTransition,
} from './creation/job-state.js';
import { createNativeJobStatusAssembler } from './delivery/native-job-status.js';
import { type StudioChatAgent } from './creation/chat-agent.js';
import { createLocalGamesClient, resolveLocalGamesDir } from './catalog/local-games-repo.js';
import { createMailerFromEnv, type Mailer } from './notifications/mailer.js';
import { createDefaultContentChecker, type ContentChecker } from './platform/moderation.js';
import { notifyOnTransition, type EmitDeps } from './notifications/notify.js';
import { isAdminSession } from './platform/admin-session.js';
import {
  type AgentKeysStore,
  type BuildLogStore,
  type BuildMediaStore,
  type CreatorMessageOrigin,
  type DispatchStore,
  type IdentityStore,
  type PublicationStore,
  type QuotaStore,
  type RoundBudgetStore,
  type RoundsStore,
  type Store,
  type SubmissionQueryStore,
  type SubmissionRecord,
  type SubmissionStore,
} from './platform/store.js';
import {
  CREATOR_FEEDBACK_MARKER,
  type SubmissionStatus,
  type SubmissionStatusResponse,
} from './platform/submission-status.js';
import { InvalidTokenError, verifyToken } from './platform/submission-token.js';
import { normalizeLocale, type Translator } from './platform/translate.js';
import { isRateLimited } from './platform/ip-rate-limit.js';

/**
 * The store slices `registerSubmissionRoutes` actually reaches into — every domain this
 * one 5000+ line function touches, named so the Phase 3 decomposition target is visible
 * as a type rather than left to be re-derived from a grep. Not yet the type of
 * `SubmissionRoutesOptions.store` itself: this file forwards `store` on to
 * agent-channel/mcp-server/notify/the gate factories, which still want the wide `Store`
 * -- narrowing those is Phase 3, not this file's edit.
 */
export type SubmissionRoutesStore = IdentityStore &
  RoundsStore &
  RoundBudgetStore &
  DispatchStore &
  SubmissionStore &
  SubmissionQueryStore &
  BuildLogStore &
  BuildMediaStore &
  PublicationStore &
  QuotaStore &
  AgentKeysStore;

// Base64 PNG, no data: prefix — same shape as a playtest screenshot.

// Re-exported for callers (and tests) that knew it here; it now lives with the status
// parser, which reads the same marker back off the PR to rebuild the revision history.
export { CREATOR_FEEDBACK_MARKER };

interface CachedStatus {
  expiresAt: number;
  value: SubmissionStatusResponse;
}

export interface SubmissionRoutesOptions {
  githubToken?: string;
  gamesRepo?: string;
  submissionTokenSecret?: string;
  /**
   * Localizes an agent-relayed change request on the write that stores it. Used by the
   * two relay paths and by nothing that serves a read — see the note on the instance.
   * Defaults to createTranslatorFromEnv(); tests inject a stub.
   */
  translator?: Translator;
  githubClient?: GitHubClient;
  fetchImpl?: typeof fetch;
  now?: () => number;
  // The real need is SubmissionRoutesStore, defined above; kept as the full Store
  // because forwarding to agent-channel/mcp-server/notify/the gate factories still
  // wants the wide type -- narrowing those is Phase 3, not this file's edit.
  store?: Store;
  dailySubmissionQuota?: number;
  /**
   * The global creation breaker (pause switch + shared daily ceiling). Built from the
   * store by default; an explicit null disables it, which is what the tests that assert
   * pre-breaker behaviour pass.
   */
  creationGate?: CreationGate | null;
  // Whether `platform` can be offered right now; null means always available.
  managedAvailabilityGate?: ManagedAvailabilityGate | null;
  /** Global ceiling used when the Firestore config doc sets none. See creation-limits.ts. */
  globalDailySubmissionCap?: number;
  /** How long the breaker's config is cached — the delay on a flip taking effect. */
  creationLimitsTtlMs?: number;
  dailyFeedbackQuota?: number;
  /** Separate from submissions so improving a live game does not crowd out creating one. */
  dailyImprovementQuota?: number;
  // Fronts every feedback/improve message (chat-agent.ts). Always on when set.
  chatAgent?: StudioChatAgent;
  intakeAgent?: IntakeAgent;
  // The chat agent's own circuit breaker (creation-limits.ts); null disables.
  chatGate?: ChatGate | null;
  // Ceiling used when the config doc sets none (creation-limits.ts).
  globalDailyChatCap?: number;
  // Per-creator daily ceiling on chat-agent turns — separate from build quota.
  dailyChatQuota?: number;
  contentChecker?: ContentChecker;
  internalAuthVerifier?: InternalAuthVerifier;
  // Seed handoff (seed-dispatch.ts); undefined reads env, null forces inline.
  seedDispatch?: SeedDispatchClient | null;
  /** Mailer for notification email fan-out; defaults to createMailerFromEnv(). */
  notifyMailer?: Mailer;
  /** Absolute origin for email links; defaults to APP_BASE_URL or https://www.gamedev.pl. */
  notifyAppBaseUrl?: string;
  /** Secret for signing unsubscribe tokens; defaults to SESSION_SECRET. */
  unsubscribeSecret?: string;
  /** Caps and seams for the agent build channel; see registerAgentChannelRoutes. */
  /**
   * Which coding-agent backend builds submitted games. Treated as the `platform` entry
   * of the registry when {@link agentBackends} is omitted — keeps existing tests and
   * call sites working unchanged.
   */
  agentBackend?: AgentBackend;
  /**
   * Per-builder registry. When set, wins over {@link agentBackend}. `self` is always
   * filled in (a default self backend) if the caller omits it.
   */
  agentBackends?: Partial<AgentBackendRegistry> & { platform?: AgentBackend };
  /** Dependencies for the environment-selected managed platform backend. */
  managedBackendDeps?: ManagedBackendDeps;
  /**
   * Writes the first draft a new build starts from. Absent means every build starts from
   * an empty directory, which is what they all did before seeding existed.
   */
  gameSeeder?: GameSeeder;
  // Provider ids `gameSeeder` was built with, and the fallback provider.
  seedProviders?: { providers: string[]; defaultProvider: string };
  // Test seam for the availability gate.
  seedAvailabilityGate?: SeedAvailabilityGate;
  agentChannel?: Pick<
    AgentChannelOptions,
    | 'maxEventsPerBuild'
    | 'maxEventsPerWindow'
    | 'gamesStore'
    | 'objectStore'
    | 'maxSubmitsPerWindow'
    | 'onSourcesDelivered'
    | 'knowledgeSearch'
    | 'maxKnowledgeAnswersPerWindow'
    | 'maxKnowledgeChunksPerWindow'
  >;
  /**
   * Timing seams for the live staged preview (`staged-preview.ts`). The defaults are
   * tuned for a real build — several seconds of debounce, tens of seconds between
   * assemblies — which is exactly what a test cannot wait out.
   */
  stagedPreview?: Pick<StagedPreviewOptions, 'debounceMs' | 'minGapMs' | 'maxBytes'>;
  /**
   * Pre-assembled published games. Defaults to the bucket in
   * GAMES_SNAPSHOT_BUCKET, or null when unset. Always a fast path in front of
   * GitHub, never a requirement — see game-snapshot.ts.
   */
  snapshotReader?: GameSnapshotReader | null;
  /**
   * Cap on in-memory assembled draft previews (HTML can be large). Defaults to
   * 50; tests pass a smaller value to exercise eviction without minting dozens
   * of issues.
   */
  maxCachedDraftPreviews?: number;
  /** How many times a job may be sent back for finishing without delivering. */
  maxDeliveryNudges?: number;
  /**
   * Who gets the operator alerts the sweep raises. Empty (the default) means the queue
   * is still visible in the console and nobody is told about it — which is the honest
   * default for an environment that has not named an operator.
   */
  adminUids?: Set<string>;
}

function checkUserAccess(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!request.user) {
    reply.status(401).send({ error: 'authentication required' });
    return false;
  }
  if (request.user.tier === 'blocked') {
    reply.status(403).send({ error: 'account is blocked' });
    return false;
  }
  return true;
}

/** What `registerSubmissionRoutes` hands back for other route modules to build on. */
// What the two agent surfaces need that only this registrar can build.

// buildApp mounts both and supplies the rest — store, buckets, gate trigger, flags.

export interface AgentSurfaceSeams {
  channel: Pick<
    AgentChannelOptions,
    | 'agentTokenSecret'
    | 'now'
    | 'sourceDelivery'
    | 'onEvent'
    | 'onBuilderHandoffAcknowledged'
    | 'onSourcesStaged'
    | 'onRegenerateSeed'
  >;
  mcp: Pick<
    McpServerOptions,
    | 'agentTokenSecret'
    | 'now'
    | 'startImprovementRound'
    | 'continueDraftRound'
    | 'createGame'
    | 'contentChecker'
    | 'dailyImprovementQuota'
    | 'dailyFeedbackQuota'
  >;
}

export interface SubmissionRoutesHandle {
  // The agent channel and MCP mounts' half of the wiring; buildApp mounts both.
  agentSurface: AgentSurfaceSeams;
  /** The resolved games-repo client, or null when this deployment cannot reach one. */
  githubClient: GitHubClient | null;
  /** Whether the resolved registry has a platform backend. */
  hasPlatformBackend: boolean;
  // Vendors with a real backend built at boot.
  configuredVendors: string[];
  // MANAGED_AGENT_VENDOR, the fallback when no override is stored.
  defaultVendor?: string;
  // Seed vendors configured at boot — vertex is always in here.
  configuredSeedProviders: string[];
  // Fallback when no console override is stored.
  defaultSeedProvider: string;
  /**
   * Finds a published entry in the repo-backed catalog only.
   *
   * The public media route gives this source priority over migrated store bytes, so
   * profile cards must use the same winner or they can advertise a stale filename.
   */
  getRepoPublishedCatalogEntry: (slug: string) => Promise<CatalogGameEntry | null>;
  /**
   * The notification fan-out dependencies (mailer, base URL, unsubscribe secret) as
   * this module resolved them.
   *
   * Exposed so a second emitter — the follower fan-out on publish — reaches the same
   * mailer and the same unsubscribe secret rather than re-deriving them from env. Two
   * derivations is two places for "respect the unsubscribe" to drift apart.
   */
  buildNotifyDeps: () => EmitDeps;
  /**
   * Starts a post-publish improvement round, choosing job dispatch or a legacy issue.
   *
   * Exported rather than reimplemented so the suggestion inbox and the creator's own
   * improve request cannot disagree about how work reaches an agent. Dispatch stopped
   * being "create an issue"; a second copy of that decision is a second thing to migrate.
   */
  startImprovementRound: (input: {
    jobId: number;
    text: string;
    title: string;
    locale: string;
    log: { error: (context: object, message: string) => void };
    /**
     * Who builds the new improvement job. Defaults to the source game's last-used
     * builder (`builder` / `defaultBuilder`), then `platform`.
     */
    builder?: BuilderKind;
    /** Who opened this improvement — drives the queued transition and status.openedBy. */
    openedBy?: 'creator' | 'agent';
    /**
     * Set when a person or their agent put this request into words, to open the new
     * job's thread with it. Omit for a machine-assembled brief — see the implementation.
     */
    requestedBy?: CreatorMessageOrigin;
    /** When set, the new job is owned by this uid (slug-transfer safe). */
    ownerUid?: string;
  }) => Promise<{ route: 'job'; jobId: number } | { route: 'unavailable'; reason: ManagedUnavailableReason } | null>;
  /**
   * Drops the cached status response for a job, so the next poll reflects a write that
   * did not come through the agent channel or the submission routes themselves.
   *
   * Exposed for the Code surface's owner-authored staging routes (creator-code.ts):
   * an owner's `PUT …/sources/stage` is the same kind of write the channel's own
   * `onEvent` busts the cache for, and a second, independent cache would let Studio
   * poll a stale status for up to the 60s TTL after an owner staged a file.
   */
  invalidateStatusCache: (jobId: number) => void;
  /**
   * Arms the staged-preview publisher for a job, the same debounced assembly the agent
   * channel's `onSourcesStaged` triggers. Null when the publisher could not be built
   * (no store / games store / GitHub client configured) — callers treat that as a
   * no-op, same as the channel does.
   */
  scheduleStagedPreview: ((jobId: number) => void) | null;
  redispatchQueuedJob: (input: {
    jobId: number;
    log: { error: (context: object, message: string) => void };
  }) => Promise<{ outcome: 'retried' | 'exhausted' | 'skipped'; reason?: string }>;
  // /api/internal/seed's worker: first dispatch from the stored brief.
  dispatchQueuedJob: DispatchQueuedJob;
  // The seed route's other jobs: regenerate a seed, assemble a preview.
  regenerateSeedNow: SeedPipeline['runSeedRegeneration'];
  publishStagedPreviewNow: ((jobId: number) => Promise<unknown>) | null;
}

/**
 * Registers the submission routes and hands back the seams other modules build on.
 */
export async function registerSubmissionRoutes(
  app: FastifyInstance,
  options: SubmissionRoutesOptions = {},
): Promise<SubmissionRoutesHandle> {
  const githubToken = options.githubToken ?? process.env.GITHUB_TOKEN;
  const gamesRepo = options.gamesRepo ?? process.env.GAMES_REPO ?? 'gamedevpl/www.gamedev.pl-games';

  // Local development runs the whole product without a GitHub token: game content is
  // read from a games checkout or bundled fixtures, and issues live in memory. It is
  // deliberately narrow — production must keep 503-ing when its config is missing, and
  // tests (NODE_ENV=test) must keep observing the unconfigured behaviour they assert.
  const nodeEnv = process.env.NODE_ENV;
  const localGames =
    nodeEnv !== 'production' && nodeEnv !== 'test' && !githubToken && !options.githubClient
      ? await resolveLocalGamesDir()
      : null;

  const submissionTokenSecret =
    options.submissionTokenSecret ??
    process.env.SUBMISSION_TOKEN_SECRET ??
    // Signs status tokens for builds that only ever exist on this machine.
    (localGames ? 'local-development-submission-secret' : undefined);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const store = options.store;
  const adminUids = options.adminUids;
  const dailySubmissionQuota = options.dailySubmissionQuota ?? 5;

  // Per-user quotas bound one creator; this bounds everyone at once, and can be pulled
  // without a redeploy (creation-limits.ts explains why that mattered enough to put the
  // config in Firestore). Absent a store there is nothing to count in, so no breaker.
  const creationGate =
    options.creationGate === undefined
      ? store
        ? createCreationGate({
            store,
            now,
            ttlMs: options.creationLimitsTtlMs,
            defaultGlobalDailyCap: options.globalDailySubmissionCap,
            logWarn: (payload, message) => app.log.warn(payload, message),
          })
        : null
      : options.creationGate;

  const dailyFeedbackQuota = options.dailyFeedbackQuota ?? 20;
  // Start small (docs/improvement-loop-plan.md): agent runs are scarce, and a published
  // improvement is a real implementer job — not a draft tweak.
  const dailyImprovementQuota = options.dailyImprovementQuota ?? Number(process.env.DAILY_IMPROVEMENT_QUOTA ?? '2');
  // Per-creator daily ceiling, same UsageCounters mechanism as feedback/improve.
  const dailyChatQuota = options.dailyChatQuota ?? Number(process.env.DAILY_CHAT_QUOTA ?? '300');
  // See creation-limits.ts.
  const chatGate =
    options.chatGate === undefined
      ? store
        ? createChatGate({
            store,
            now,
            ttlMs: options.creationLimitsTtlMs,
            defaultGlobalDailyCap: options.globalDailyChatCap,
            logWarn: (payload, message) => app.log.warn(payload, message),
          })
        : null
      : options.chatGate;
  const improvementRateLimitWindowMs = 60 * 60 * 1000;
  const maxImprovementsPerWindow = 10;
  const internalAuthVerifier = options.internalAuthVerifier ?? createInternalAuthVerifierFromEnv();
  const gameSeeder = options.gameSeeder;
  const gamesStoreForSeed = options.agentChannel?.gamesStore;
  function invalidateDeliveryCaches(jobId: number): void {
    buildStatus.invalidateEvents(jobId);
    invalidateStatusCache(jobId);
  }
  const kitFileStoreForDelivery = options.agentChannel?.objectStore
    ? createKitFileStore(options.agentChannel.objectStore)
    : null;

  function buildAgentRegistry(): AgentBackendRegistry {
    const selfOptions = store
      ? {
          persistSeed: async (jobId: number, seed: SeedFiles) => {
            await store.setSubmissionSeed(jobId, seed);
          },
          readSeed: async (jobId: number) => {
            const record = await store.getSubmission(jobId);
            return record?.seed;
          },
          readSignals: async (jobId: number) => {
            const record = await store.getSubmission(jobId);
            if (!record) return null;
            return {
              lastAgentSignalAt: record.lastAgentSignalAt,
              deliveredVersion: record.deliveredVersion,
              previewVersion: record.previewVersion,
              agentEndedAt: record.agentEndedAt,
            };
          },
        }
      : undefined;
    const configuredManagedDeps = options.managedBackendDeps;
    const managedDeps =
      configuredManagedDeps || store
        ? {
            ...configuredManagedDeps,
            ...(store
              ? {
                  readCredentialRef: async (jobId: number, sessionRef: string) => {
                    const record = await store.getSubmission(jobId);
                    return record?.dispatch?.credentialRefs?.[sessionRef];
                  },
                }
              : {}),
          }
        : undefined;
    const environmentRegistry = createAgentBackendRegistryFromEnv(app.log, selfOptions, managedDeps);
    // Explicit backends win; do not pre-wire Copilot over managed.
    const self = options.agentBackends?.self ?? environmentRegistry.self;
    // An injected backend skips vendor selection: always resolved, single entry.
    const injectedPlatform =
      options.agentBackend ??
      options.agentBackends?.platform ??
      options.agentBackends?.platformByVendor?.values().next().value;
    if (injectedPlatform) {
      const vendor = environmentRegistry.defaultVendor ?? injectedPlatform.name ?? 'injected';
      return { platformByVendor: new Map([[vendor, injectedPlatform]]), defaultVendor: vendor, self };
    }
    return {
      platformByVendor: environmentRegistry.platformByVendor,
      ...(environmentRegistry.defaultVendor ? { defaultVendor: environmentRegistry.defaultVendor } : {}),
      self,
    };
  }

  const agentBackends = buildAgentRegistry();

  const managedAvailabilityGate =
    options.managedAvailabilityGate === undefined
      ? createManagedAvailabilityGate({
          store,
          now,
          ttlMs: options.creationLimitsTtlMs,
          hasPlatformBackend: agentBackends.platformByVendor.size > 0,
          configuredVendors: new Set(agentBackends.platformByVendor.keys()),
          ...(agentBackends.defaultVendor ? { defaultVendor: agentBackends.defaultVendor } : {}),
          logWarn: (payload, message) => app.log.warn(payload, message),
        })
      : options.managedAvailabilityGate;

  // Mirrors what gameSeeder was built from. No seeder, nothing is really reachable.
  function resolveSeedProviderEnv(): { providers: string[]; defaultProvider: string } {
    if (options.seedProviders) return options.seedProviders;
    if (!gameSeeder) return { providers: [], defaultProvider: DEFAULT_SEED_PROVIDER };
    const env = createSeedProvidersFromEnv(app.log);
    return { providers: [...env.providers.keys()], defaultProvider: env.defaultProvider };
  }
  const seedProviderEnv = resolveSeedProviderEnv();
  const configuredSeedProviders = new Set(seedProviderEnv.providers);

  const seedAvailabilityGate =
    options.seedAvailabilityGate === undefined
      ? createSeedAvailabilityGate({
          store,
          now,
          ttlMs: options.creationLimitsTtlMs,
          configuredProviders: configuredSeedProviders,
          defaultProvider: seedProviderEnv.defaultProvider,
          logWarn: (payload, message) => app.log.warn(payload, message),
        })
      : options.seedAvailabilityGate;

  async function backendFor(builder: BuilderKind | undefined): Promise<AgentBackend | undefined> {
    const resolvedBuilder = builder ?? 'platform';
    if (resolvedBuilder === 'self') return agentBackends.self;
    const vendor = await managedAvailabilityGate?.resolveVendor();
    return resolveBuilderBackend(agentBackends, resolvedBuilder, vendor);
  }

  function backendByStoredName(name: string | undefined): AgentBackend | undefined {
    if (!name) return undefined;
    if (agentBackends.self.name === name) return agentBackends.self;
    for (const backend of agentBackends.platformByVendor.values()) {
      if (backend.name === name) return backend;
    }
    return undefined;
  }

  function builderOf(record: SubmissionRecord | null | undefined): BuilderKind {
    return record?.builder ?? record?.defaultBuilder ?? 'platform';
  }
  // Shared deps for notification emission (in-app + best-effort email). The mailer
  // degrades to a no-op without RESEND_API_KEY, and email is skipped entirely
  // unless an unsubscribe secret is available — so this is safe when unconfigured.
  const notifyMailer = options.notifyMailer ?? createMailerFromEnv();
  const notifyAppBaseUrl = options.notifyAppBaseUrl ?? process.env.APP_BASE_URL?.trim() ?? 'https://www.gamedev.pl';
  const unsubscribeSecret = options.unsubscribeSecret ?? process.env.SESSION_SECRET;
  /**
   * Feeds a derived status into the job state machine.
   *
   * Both the status poll and the sweep call this, so an in-flight build accumulates a
   * real state and history whichever one happens to observe it first. It is additive
   * for now — the status route still answers from the derivation — but it is what
   * populates the record that will answer instead, and it makes time-in-state and
   * stall detection available immediately for jobs that predate the job model.
   *
   * Best effort by design: this is bookkeeping, and a failed write must never turn a
   * creator's status poll into an error.
   */
  async function recordDerivedJobState(
    record: SubmissionRecord,
    observed: SubmissionStatus,
  ): Promise<JobTransition | null> {
    if (!store) return null;
    const transition = planObservedStatusTransition(record.state, observed, new Date(now()).toISOString());
    if (!transition) return null;
    try {
      await store.recordJobTransition(record.jobId, transition);
    } catch (error) {
      app.log.error({ err: error, jobId: record.jobId }, 'job transition write failed');
      return null;
    }
    // Returned so the caller can judge staleness against the state it just wrote. The
    // caller holds a snapshot taken before this write, and a stall computed from that
    // snapshot would measure how long the job sat in the state it has *just left* —
    // which is how a job that is visibly progressing gets reported as stuck.
    return transition;
  }

  /**
   * Hands a job to a coding agent.
   *
   * This is what replaces the games repo's `assign-copilot.yml` — a workflow whose only
   * job was assigning a bot the REST API will not list, needing a PAT of its own because
   * the default token could not do it. Dispatching from here also means the *product*
   * decides which backend and which model builds a game, rather than that being a
   * property of a label somebody put on an issue.
   *
   * The GitHub issue survives for now as the job's identity — every store key, every
   * token and the whole build channel are derived from its number — but nothing reads it
   * as a work item any more. Re-keying jobs onto ids we mint is a change of its own, and
   * doing it in the same step as moving dispatch would put two risky migrations in one
   * deploy for no gain.
   *
   * Best effort against a missing backend: without one configured (local development, or
   * before the dispatch credential exists in an environment) the submission still
   * succeeds and the label workflow remains the path that starts it. A creator must never
   * lose a submission to orchestration that is not wired up yet.
   */
  /**
   * Books one agent session against a job.
   *
   * A session is the billed unit on the Copilot backend — one premium request each,
   * charged when the session starts and regardless of what it produces. That last part
   * is why this is recorded here rather than on delivery: a round that fails, stalls, or
   * finishes without uploading cost exactly as much as one that shipped a game, and a
   * ledger that only counted successes would report the cost of building games as a
   * fraction of what it is.
   *
   * Never throws. A ledger is worth having, and it is not worth dropping a build for.
   */
  async function recordSessionCost(
    jobId: number,
    ref: string,
    backend: AgentBackend,
    log: { error: (context: object, message: string) => void },
  ): Promise<void> {
    // Self builds run on the creator's machine — there is no platform agent session to bill.
    if (!store || backend.name === 'self') return;
    try {
      await store.recordJobCost(jobId, {
        kind: 'agent_session',
        at: new Date(now()).toISOString(),
        by: backend.name,
        ref,
        // Placeholder: usage is not on the dispatch response. Observation overwrites
        // this with the real `session.usage.amount / 1e9` once the session reports it
        // (typically 46–861 credits). Leaving 1 forever under-reports by up to 860×.
        credits: 1,
      });
    } catch (error) {
      log.error({ err: error, jobId }, 'could not record the cost of an agent session');
    }
  }

  /** Seeds replacement builders from the latest delivered sources. */
  async function seedFromLatestDelivery(record: SubmissionRecord): Promise<SeedFiles | undefined> {
    if (!gamesStoreForSeed || !record.slug || !record.deliveredVersion) return undefined;
    try {
      const manifest = await gamesStoreForSeed.getManifest(record.slug, record.deliveredVersion);
      if (!manifest) return undefined;
      const files: { path: string; content: string }[] = [];
      for (const path of manifest.sourceFiles) {
        const content = await gamesStoreForSeed.getSourceFile(record.slug, record.deliveredVersion, path);
        if (content === null) return undefined;
        files.push({ path, content });
      }
      return { slug: record.slug, files, references: [] };
    } catch {
      return undefined;
    }
  }

  const resumeBuild = createResumeBuild({
    store,
    submissionTokenSecret,
    managedAvailabilityGate,
    now,
    notifyAppBaseUrl,
    backendFor,
    backendByStoredName,
    builderOf,
    recordSessionCost,
    releaseWorkspace,
    seedFromLatestDelivery,
  });

  // Acks a pending handoff and starts the target builder.
  async function acknowledgeBuilderHandoff(input: {
    jobId: number;
    acknowledgedAt: string;
    log: { error: (context: object, message: string) => void };
  }): Promise<ResumeOutcome | { started: false; reason: string }> {
    if (!store) return { started: false, reason: 'not_configured' };
    const current = await store.getSubmission(input.jobId);
    const requested = current?.builderHandoff;
    if (!requested) return { started: false, reason: 'handoff_not_pending' };
    const acknowledged = await store.acknowledgeBuilderHandoff(input.jobId, input.acknowledgedAt);
    if (!acknowledged) return { started: false, reason: 'handoff_already_acknowledged' };
    const outcome = await resumeBuild({
      jobId: input.jobId,
      feedback: current?.spec ?? `Continue building "${current?.title ?? 'this game'}" for gamedev.pl.`,
      locale: current?.locale ?? 'en',
      log: input.log,
      builder: acknowledged.to,
      preserveRoundBudget: true,
      transition: {
        by: 'creator',
        reason: acknowledged.to === 'self' ? 'platform_builder_handoff' : 'self_builder_handoff',
      },
    });
    if (outcome.started) await store.clearBuilderHandoff(input.jobId);
    invalidateStatusCache(input.jobId);
    return outcome;
  }

  /**
   * Starts a round of post-publish improvement work on an already-published game.
   *
   * **An improvement is a new job, not another round of the old one.** The state machine
   * says so outright — `published` has no outgoing transitions, with the note "improvements
   * start a *new* job, so publishing is terminal for this one". Resuming a published job
   * would dispatch an agent and then silently fail to record a transition, because
   * `published → building` is not legal; the agent would work, deliver, and find a job
   * that can never move to gating, review, or publication. Nothing would say so.
   *
   * The new job inherits the slug, which is what turns "build a game" into "revise this
   * one": `buildPrompt` branches on `slug` + `feedback` to tell the agent to continue the
   * existing game and to restore its delivered sources from the games store rather than
   * trusting whatever the checkout happens to contain.
   *
   * Two callers — the creator's own improve request and an approved player-evidence
   * suggestion — so that they cannot disagree about how work reaches an agent. When the
   * legacy issue leg is retired this is one branch to delete rather than two that drifted.
   */
  async function startImprovementRound(input: {
    /** The job that owns the published game. Its slug and owner seed the new job. */
    jobId: number;
    /** Already moderated and sanitized. Untrusted text: data, never instructions. */
    text: string;
    title: string;
    locale: string;
    log: { error: (context: object, message: string) => void };
    /**
     * Who builds this improvement. Explicit choice wins; otherwise inherit the source
     * game's last-used builder. A new job has neither field until dispatch sets them,
     * so omitting this used to silently route every post-publish improve to `platform`.
     */
    builder?: BuilderKind;
    /** Who opened this improvement — drives the queued transition and status.openedBy. */
    openedBy?: 'creator' | 'agent';
    /**
     * Who put this round's request into words, when a person or their agent did. Set it
     * and `text` opens the new job's thread, attributed accordingly — `creator` for the
     * Studio improve composer, `agent` for a relay through MCP `open_round`.
     *
     * Publishing is terminal, so an improvement is a *new* job with an empty thread, and
     * the request that started it used to live only in the brief the agent reads. The
     * creator would send a change request, land on the new round, and find no trace of
     * what they had just asked for — worse after a reload, which drops the page's own
     * local echo of it too.
     *
     * Omitted on purpose by the suggestion paths: `buildImprovementBrief` assembles those
     * out of player evidence, so nobody typed them. Putting one on the creator's side of
     * the thread would be the bug #539 fixed, wearing a different hat.
     */
    requestedBy?: CreatorMessageOrigin;
    /**
     * Owner of the new job. Defaults to the published source's ownerUid. Pass the
     * authorized creator after a slug transfer so quota and Studio stay aligned.
     */
    ownerUid?: string;
  }): Promise<{ route: 'job'; jobId: number } | { route: 'unavailable'; reason: ManagedUnavailableReason } | null> {
    if (!store) return null;
    const source = await store.getSubmission(input.jobId);
    // Without a slug there is no game to improve, and dispatching would quietly
    // commission a brand-new one against a creator's improvement request.
    if (!source?.slug) return null;

    // Resolve against the *source* game before the new job exists. `dispatchBuild`
    // would otherwise ask `builderOf` on a blank record and always pick `platform`.
    const builder = input.builder ?? builderOf(source);

    if (builder === 'platform' && managedAvailabilityGate) {
      const ownerUid = input.ownerUid ?? source.ownerUid;
      const dateStr = new Date(now()).toISOString().slice(0, 10);
      const availability = await managedAvailabilityGate.checkAndSpend(ownerUid, dateStr);
      if (!availability.available) return { route: 'unavailable', reason: availability.reason };
    }

    const jobId = await store.allocateJobId();
    await store.createSubmission(jobId, input.ownerUid ?? source.ownerUid, source.title);
    await store.setSubmissionLocale(jobId, input.locale);
    // Set before dispatch: the slug is what makes this an improvement rather than a new
    // game, and a job that dispatched without one has already told the agent the wrong
    // thing.
    await store.setSubmissionSlug(jobId, source.slug);
    // The change request is this round's brief, so persist it. `dispatchBuild` below
    // carries the same text into a platform backend's prompt, but a self round has no
    // backend to read it: the creator's own agent calls get_brief, which serves the
    // stored brief and nothing else. Without this an agent-opened improvement round
    // starts with an empty spec and no idea what the creator asked for.
    // No requestedBy means an autonomous suggestion sweep wrote `text`, not the creator.
    await store.setSubmissionBrief(jobId, {
      spec: input.text,
      qa: [],
      ...(input.requestedBy ? {} : { specIsSystemGenerated: true }),
    });
    // Open the new job's thread with the request that started it. Written already
    // delivered: the brief below carries the same words to the agent, and a pending
    // note would read as a second, newer instruction to act on.
    if (input.requestedBy) {
      try {
        const relayed = await relayedMessageLocalization(input.requestedBy, input.text);
        await store.appendCreatorMessage(jobId, relayed.text, {
          origin: input.requestedBy,
          delivered: true,
          ...(relayed.textLocalized && relayed.locale
            ? { textLocalized: relayed.textLocalized, locale: relayed.locale }
            : {}),
        });
      } catch (seedError) {
        // Best effort. The request still reaches the agent as the brief, so a failure
        // here costs the creator the echo, not the round.
        input.log.error({ err: seedError, jobId }, 'failed to seed the improvement thread');
      }
    }
    await store.recordJobTransition(jobId, {
      to: 'queued',
      at: new Date(now()).toISOString(),
      by: input.openedBy === 'agent' ? 'agent' : 'creator',
      reason: input.openedBy === 'agent' ? 'agent_open_round' : 'improvement_requested',
    });

    const dispatched = await dispatchBuild({
      jobId,
      // The brief is both the spec and the change request: `feedback` selects the
      // "revise, do not rebuild" prompt, and `spec` is what a backend without that
      // distinction would read.
      spec: input.text,
      feedback: input.text,
      slug: source.slug,
      locale: input.locale,
      log: input.log,
      builder,
    });
    // The job exists either way. A failed dispatch leaves it `queued`, which the operator
    // queue already reports as `not_dispatched` — a visible stall rather than a silently
    // dead request.
    return dispatched ? { route: 'job', jobId } : null;
  }

  /**
   * Reopens an unpublished draft after the previous round closed (typically gate-green
   * `ready_for_review`). Same job, new round — not a post-publish improvement.
   *
   * Shared by MCP `continue_draft` so Studio feedback and the agent path cannot disagree
   * about how a closed green draft starts moving again.
   */
  async function continueDraftRound(input: {
    jobId: number;
    feedback: string;
    locale: string;
    log: { error: (context: object, message: string) => void };
    openedBy?: 'creator' | 'agent';
  }): Promise<{ ok: true; jobId: number; alreadyOpen: boolean } | { ok: false; reason: string }> {
    if (!store) return { ok: false, reason: 'not_configured' };
    const record = await store.getSubmission(input.jobId);
    if (!record || record.abandonedAt) {
      return { ok: false, reason: 'draft_not_found' };
    }
    if (record.publishedAt) {
      return { ok: false, reason: 'already_published' };
    }
    if (record.state === 'publishing') {
      return { ok: false, reason: 'publishing' };
    }
    if (isActiveBuildRound(record)) {
      return { ok: true, jobId: input.jobId, alreadyOpen: true };
    }
    // Only states where a new round is the honest next step. Canceled/abandoned stay dead.
    // `undefined` is a legacy/partial record — resumeBuild adopts it into `dispatched`.
    const state = record.state;
    const continuable =
      state === 'ready_for_review' ||
      state === 'failed' ||
      state === 'needs_changes' ||
      state === 'queued' ||
      state === undefined;
    if (!continuable) {
      return { ok: false, reason: 'not_continuable' };
    }

    try {
      // Record who typed this. An agent calling `continue_draft` writes its own summary
      // of a conversation held somewhere else — usually in English, whatever the creator
      // was speaking — so the thread must not present it as the creator's own words.
      const origin = input.openedBy === 'agent' ? ('agent' as const) : ('creator' as const);
      const relayed = await relayedMessageLocalization(origin, input.feedback);
      await store.appendCreatorMessage(input.jobId, relayed.text, {
        origin,
        ...(relayed.textLocalized && relayed.locale
          ? { textLocalized: relayed.textLocalized, locale: relayed.locale }
          : {}),
      });
    } catch (queueError) {
      input.log.error({ err: queueError, jobId: input.jobId }, 'failed to queue continue_draft feedback');
      return { ok: false, reason: 'queue_failed' };
    }

    const outcome = await resumeBuild({
      jobId: input.jobId,
      feedback: input.feedback,
      locale: input.locale,
      log: input.log,
      // deliveredVersion misses platform rounds; dispatch presence is the real "never ran" signal.
      ...(record.dispatch?.refs?.length ? {} : { undelivered: true }),
      builder: 'self',
      transition: {
        by: input.openedBy === 'agent' ? 'agent' : 'creator',
        reason: 'continue_draft',
      },
    });
    if (!outcome.started) {
      return { ok: false, reason: outcome.reason ?? 'resume_failed' };
    }
    return { ok: true, jobId: input.jobId, alreadyOpen: false };
  }

  /**
   * Drops a workspace the job is finished with.
   *
   * Best effort on purpose: the branch holds nothing authoritative — the game is in the
   * store — so failing to delete it leaves litter, and treating litter as an error would
   * fail a round that otherwise worked. Logged so the litter is countable.
   */
  async function releaseWorkspace(
    jobId: number,
    workspace: string,
    log: { error: (context: object, message: string) => void },
    // Vendor that built this workspace; unknown falls back to every vendor.
    backendName?: string,
  ): Promise<void> {
    // Workspace cleanup is a platform (Copilot) concern — self rounds have none.
    const matched = backendName
      ? [...agentBackends.platformByVendor.values()].filter((backend) => backend.name === backendName)
      : [];
    const candidates = matched.length ? matched : [...agentBackends.platformByVendor.values()];
    await Promise.all(
      candidates
        .filter((backend): backend is AgentBackend & { cleanup: NonNullable<AgentBackend['cleanup']> } =>
          Boolean(backend.cleanup),
        )
        .map(async (backend) => {
          try {
            await backend.cleanup({ ref: '', workspace });
          } catch (error) {
            log.error(
              { err: error, jobId, workspace, backend: backend.name },
              'could not delete a spent build workspace',
            );
          }
        }),
    );
  }

  function buildNotifyDeps(): EmitDeps {
    return {
      store: store!,
      mailer: notifyMailer,
      appBaseUrl: notifyAppBaseUrl,
      unsubscribeSecret,
      logError: (err, msg) => app.log.error({ err }, msg),
    };
  }

  const contentChecker = options.contentChecker ?? createDefaultContentChecker();

  // Published games live on the games repo's default branch.
  const publishedRef = process.env.GAMES_PUBLISHED_REF ?? 'main';

  // Pre-assembled published games, baked on merge by scripts/publish-snapshot.ts.
  // `undefined` means "read the environment"; an explicit null disables it (tests
  // that assert the GitHub-backed behaviour pass null).
  const snapshotReader = options.snapshotReader === undefined ? createSnapshotReaderFromEnv() : options.snapshotReader;
  if (snapshotReader) {
    app.log.info('serving published games from the snapshot bucket only (no GitHub fallback)');
  }

  const githubClient =
    githubToken && submissionTokenSecret
      ? (options.githubClient ?? createGitHubClient({ token: githubToken, repo: gamesRepo, fetchImpl }))
      : localGames
        ? createLocalGamesClient({ rootDir: localGames.rootDir })
        : null;

  if (localGames) {
    app.log.info(
      { rootDir: localGames.rootDir, source: localGames.source },
      localGames.source === 'fixtures'
        ? 'no GITHUB_TOKEN: serving bundled fixture games (see docs/local-development.md)'
        : 'no GITHUB_TOKEN: serving games from a local checkout',
    );
  }

  const seedDispatch =
    options.seedDispatch === undefined ? createSeedDispatchClientFromEnv(process.env, app.log) : options.seedDispatch;
  const seedPipeline = createSeedPipeline({
    store,
    now,
    gameSeeder,
    seedAvailabilityGate,
    builderOf,
    backendFor,
    githubClient,
    publishedRef,
    ...(seedDispatch
      ? {
          handoff: (jobId: number, steer?: string) =>
            seedDispatch.enqueue(jobId, { action: 'regenerate', ...(steer ? { steer } : {}) }),
        }
      : {}),
  });
  const { seedDeliveryFor, seedBuild, regenerateSeed, publishSeedPreview } = seedPipeline;

  const { dispatchBuild, redispatchQueuedJob, dispatchQueuedJob } = createDispatcher({
    store,
    submissionTokenSecret,
    gameSeeder,
    now,
    notifyAppBaseUrl,
    backendFor,
    builderOf,
    recordSessionCost,
    seedDeliveryFor,
    seedBuild,
    publishSeedPreview,
  });

  const rateLimitWindowMs = 60 * 60 * 1000;
  const maxSubmissionsPerWindow = 5;
  const submissionsByIp = new Map<string, number[]>();
  const statusRateLimitWindowMs = 60 * 1000;
  const maxStatusChecksPerWindow = 120;
  const statusChecksByIp = new Map<string, number[]>();
  // Keyed by `${jobId}:${locale}` — the response body is localized, so two
  // languages must not share an entry.
  const statusCache = new Map<string, CachedStatus>();
  // In-flight refreshes, same keys. A status page polls on a timer, so several
  // watchers of one build land together; without this each miss launched its own
  // fan-out of GitHub reads, multiplying the burst that gets the token limited.
  const statusRefreshes = new Map<string, Promise<SubmissionStatusResponse>>();
  // Bumped on invalidate so a refresh that started on a stale snapshot cannot
  // repopulate the cache after feedback/handoff cleared it.
  const statusCacheEpoch = new Map<number, number>();
  /** Drop every locale variant so the next poll rebuilds from the job record. */
  function invalidateStatusCache(jobId: number): void {
    for (const key of [...statusCache.keys()]) {
      if (key.startsWith(`${jobId}:`)) statusCache.delete(key);
    }
    for (const key of [...statusRefreshes.keys()]) {
      if (key.startsWith(`${jobId}:`)) statusRefreshes.delete(key);
    }
    statusCacheEpoch.set(jobId, (statusCacheEpoch.get(jobId) ?? 0) + 1);
  }

  const buildStatus = createBuildStatusAssembler({
    store,
    gamesStore: options.agentChannel?.gamesStore,
    now,
    managedAvailabilityGate,
    isPresenceEventText: isMcpPresenceEventText,
  });
  const { attachBuildEvents } = buildStatus;

  const chatOrchestration = createChatOrchestration({
    store,
    now,
    log: app.log,
    isPresenceEventText: isMcpPresenceEventText,
    chatAgent: options.chatAgent,
    chatGate,
    dailyChatQuota,
    translator: options.translator,
  });
  const { runChatAgent, relayedMessageLocalization } = chatOrchestration;

  const draftPreviewRoutes = await registerDraftPreviewRoutes(app, {
    store,
    gamesStore: options.agentChannel?.gamesStore,
    now,
    submissionTokenSecret,
    githubConfigured: Boolean(githubClient),
    checkUserAccess,
    maxCachedDraftPreviews: options.maxCachedDraftPreviews,
  });
  // Feedback posts a GitHub comment (which re-triggers the agent), so cap it tightly.
  const feedbackRateLimitWindowMs = 60 * 60 * 1000;
  const maxFeedbackPerWindow = 10;
  const feedbackByIp = new Map<string, number[]>();

  const gamesRateLimitWindowMs = 60 * 1000;
  const maxGamesPerWindow = 60;

  // A single catalog page render can request a poster, a video, and up to 4
  // screenshots per card across every published game — a much bigger, legitimate
  // burst than loading a game bundle, so gallery media gets its own bucket.
  const maxMediaPerWindow = 400;
  const mediaByIp = new Map<string, number[]>();

  const catalogRoutes = await registerCatalogRoutes(app, {
    store,
    gamesStore: options.agentChannel?.gamesStore,
    now,
    githubClient,
    snapshotReader,
    publishedRef,
    mediaByIp,
    maxMediaPerWindow,
    mediaRateLimitWindowMs: gamesRateLimitWindowMs,
  });
  await registerCatalogSearchRoutes(app, {
    store,
    githubClient,
    publishedRef,
    getCatalogEntries: catalogRoutes.getCatalogEntries,
    now,
    // Built here rather than in the route: `catalog` does not import `creation`.
    searchGate: store
      ? createSearchGate({
          store,
          now,
          ttlMs: options.creationLimitsTtlMs,
          logWarn: (payload, message) => app.log.warn(payload, message),
        })
      : null,
  });
  await registerCreatorMediaRoutes(app, {
    store,
    now,
    submissionTokenSecret,
    checkUserAccess,
    mediaByIp,
    maxMediaPerWindow,
    mediaRateLimitWindowMs: gamesRateLimitWindowMs,
  });
  const gamePlayRoute = await registerGamePlayRoute(app, {
    store,
    githubClient,
    snapshotReader,
    publishedRef,
    now,
    catalog: catalogRoutes,
    draftPreview: draftPreviewRoutes,
    maxGamesPerWindow,
    gamesRateLimitWindowMs,
  });

  // Trusts a cache hit without re-checking publication state.
  function invalidatePublishedGameCaches(slug: string): void {
    gamePlayRoute.invalidateGameCache(slug);
    catalogRoutes.invalidatePublishedGameCache(slug);
  }

  const { isSlugClaimed, confirmSlugClaim, ensureSubmissionSlug } = createSlugResolver({
    store,
    isSlugPublished: catalogRoutes.isSlugPublished,
  });

  await registerAdminGameRoutes(app, {
    store,
    adminUids,
    now,
    gamesStore: options.agentChannel?.gamesStore,
    onSourcesDelivered: options.agentChannel?.onSourcesDelivered,
    invalidatePublishedGameCaches,
    isSlugClaimed,
    confirmSlugClaim,
  });
  await registerSelfBuildConnectRoutes(app, {
    store,
    now,
    submissionTokenSecret,
    appBaseUrl: notifyAppBaseUrl,
    checkUserAccess,
    ensureSubmissionSlug,
  });
  await registerDraftLifecycleRoutes(app, {
    store,
    now,
    submissionTokenSecret,
    githubClient,
    checkUserAccess,
    backendFor,
    builderOf,
    releaseWorkspace,
    invalidateStatusCache,
    invalidatePublishedGameCaches,
  });
  await registerCreatorSelfRoutes(app, {
    store,
    now,
    checkUserAccess,
    dailySubmissionQuota,
    submissionTokenSecret,
    managedAvailabilityGate,
  });

  const { nativeJobStatus } = createNativeJobStatusAssembler({
    store,
    now,
    builderOf,
    managedAvailabilityGate,
    gamesStore: options.agentChannel?.gamesStore,
    sessionCrashStall,
    codeSurfaceEnabled,
    isLiveAgentRound,
    selfBuildDeliveryCap,
  });

  /**
   * Quiet long enough that asking the backend is cheaper than guessing. Well under the
   * 15-minute stall banner: this is the check that can tell "quiet" apart from "dead",
   * so it has to run before the page starts hedging.
   */
  const observeQuietMs = 2 * 60 * 1000;

  /**
   * How many times a job may be sent back for finishing without delivering.
   *
   * One. A session that forgot the last step takes the reminder; a setup that cannot
   * deliver at all — a broken token, an agent whose instructions genuinely conflict —
   * fails the same way however many times it is asked, and each attempt is a real agent
   * session against a real quota. The second failure is information, not bad luck, and
   * it belongs in front of an operator rather than in another retry.
   */
  const maxDeliveryNudges = options.maxDeliveryNudges ?? 1;

  const { reconcileNativeJob, reconcileGateVerdict } = createJobReconciler({
    store,
    gamesStore: options.agentChannel?.gamesStore,
    log: app.log,
    now,
    observeQuietMs,
    maxDeliveryNudges,
    backendFor,
    builderOf,
    releaseWorkspace,
    resumeBuild,
    acknowledgeBuilderHandoff,
    probeGateCrash,
    postGateScreenshot: postGateScreenshotToThread,
  });

  const { createGame } = createGameCreator({
    store,
    githubClient,
    submissionTokenSecret,
    contentChecker,
    creationGate,
    managedAvailabilityGate,
    now,
    log: app.log,
    dailySubmissionQuota,
    maxSubmissionsPerWindow,
    rateLimitWindowMs,
    submissionsByIp,
    isSlugClaimed,
    confirmSlugClaim,
    dispatchQueuedJob,
    ...(seedDispatch ? { enqueueSeed: (jobId: number) => seedDispatch.enqueue(jobId) } : {}),
  });

  registerCreateGameRoute(app, {
    githubClient,
    submissionTokenSecret,
    checkUserAccess,
    createGame,
  });

  registerCliChatRoutes(app, {
    store,
    contentChecker,
    submissionTokenSecret,
    createGame,
    intakeAgent: options.intakeAgent,
    chatGate,
    dailyChatQuota,
    now,
  });

  registerHandoffSealRoutes(app, {
    store,
    gamesStore: options.agentChannel?.gamesStore,
    githubClient,
    submissionTokenSecret,
    managedAvailabilityGate,
    now,
    checkUserAccess,
    builderOf,
    invalidateStatusCache,
    resumeBuild,
    gateTrigger: options.agentChannel?.onSourcesDelivered,
  });

  /**
   * Derives one submission's status from GitHub and caches it.
   *
   * Concurrent callers for the same key share a single refresh: the work is several
   * GitHub reads, and the whole point is not to issue them more than once per key.
   * Everything with a side effect lives in here rather than in the route, so a
   * coalesced poll observes a transition exactly once no matter how many watchers
   * were waiting on it.
   */
  // No `locale` parameter: the cached status is now language-neutral. Everything that
  // varies by language is resolved per-request in `attachBuildEvents`, from text the
  // agent already sent. `cacheKey` still carries the locale so existing entries and
  // `invalidateStatusCache`'s prefix scan keep working.
  async function refreshStatus(jobId: number, cacheKey: string, token: string): Promise<SubmissionStatusResponse> {
    const existing = statusRefreshes.get(cacheKey);
    if (existing) return existing;

    const epochAtStart = statusCacheEpoch.get(jobId) ?? 0;
    const refresh = (async () => {
      // Every job answers from its own record: there is no issue to read, and the
      // GitHub round-trip it used to need is gone with the path that needed it.
      let record = await store?.getSubmission(jobId);
      if (record) {
        // Two things can have moved the job since the last poll, and they own different
        // stretches of it: the agent's own session up to delivery, our gate after it.
        // Neither fires on both, so asking for both costs one of them nothing.
        const observed = (await reconcileNativeJob(record)) ?? (await reconcileGateVerdict(record));
        if (observed) {
          record = {
            ...record,
            state: observed.to,
            stateSince: observed.at,
            transitions: [...(record.transitions ?? []), observed],
          };
        }
      }
      const status = record ? await nativeJobStatus(record) : ({ status: 'queued' } as SubmissionStatusResponse);
      // Session boot (`dispatched`) must re-observe Agent Tasks every few seconds —
      // a 60s cache would freeze "Starting agent" while GitHub already reports
      // `in_progress`. Skip writing when invalidate raced this refresh.
      if ((statusCacheEpoch.get(jobId) ?? 0) === epochAtStart) {
        const ttlMs = status.phase === 'dispatched' ? 2_000 : 60_000;
        statusCache.set(cacheKey, { value: status, expiresAt: now() + ttlMs });
      }
      if (store && record) {
        try {
          await notifyOnTransition(buildNotifyDeps(), record, status, token);
        } catch (notifyError) {
          app.log.error({ err: notifyError }, 'notification emit on status poll failed');
        }
      }
      return status;
    })().finally(() => {
      statusRefreshes.delete(cacheKey);
    });

    statusRefreshes.set(cacheKey, refresh);
    return refresh;
  }

  app.get(
    '/api/submissions/:token',
    { config: { rateLimit: { max: maxStatusChecksPerWindow, timeWindow: statusRateLimitWindowMs } } },
    async (request, reply) => {
      if (!githubClient || !submissionTokenSecret) {
        return reply.status(503).send({ error: 'submissions are not configured' });
      }

      const token = z.string().parse((request.params as { token?: string }).token);
      const locale = normalizeLocale((request.query as { locale?: string } | undefined)?.locale);
      const currentTime = now();
      if (
        isRateLimited(
          statusChecksByIp,
          request.clientIp,
          currentTime,
          maxStatusChecksPerWindow,
          statusRateLimitWindowMs,
        )
      ) {
        return reply.status(429).send({ error: 'too many status checks, please try again later' });
      }

      let jobId: number;
      try {
        jobId = verifyToken(token, submissionTokenSecret);
      } catch (error) {
        if (error instanceof InvalidTokenError) {
          return reply.status(400).send({ error: 'invalid submission token' });
        }
        throw error;
      }

      const cacheKey = `${jobId}:${locale}`;
      const cached = statusCache.get(cacheKey);
      if (cached && cached.expiresAt > currentTime) {
        // Events are attached outside the cache: the GitHub-derived part of a status
        // is worth a minute, but an agent's live update is worth seconds.
        return reply.send(await attachBuildEvents(cached.value, jobId, locale));
      }

      // An abandoned build is terminal and self-declared: answer from the record
      // rather than deriving from GitHub, where a closed issue reads as
      // "needs_changes" — which would tell the creator the opposite of the truth.
      if (store) {
        const record = await store.getSubmission(jobId);
        if (record?.abandonedAt) {
          return reply.send({ status: 'abandoned' });
        }
      }

      let status: SubmissionStatusResponse;
      try {
        status = await refreshStatus(jobId, cacheKey, token);
      } catch (error) {
        // The refresh is several GitHub reads, and GitHub rate-limits the whole token
        // at once — so this throws in bursts, for everyone watching a build, exactly
        // when builds are being watched. A creator mid-build would rather see progress
        // from a minute ago than the page breaking, and the next poll is seconds away.
        const lastKnown = statusCache.get(cacheKey);
        if (lastKnown) {
          request.log.warn({ err: error, jobId }, 'status refresh failed; serving last known status');
          return reply.send(await attachBuildEvents(lastKnown.value, jobId, locale));
        }
        request.log.error({ err: error }, 'failed to resolve submission status');
        return reply.status(502).send({ error: 'failed to load submission status' });
      }

      return reply.send(await attachBuildEvents(status, jobId, locale));
    },
  );

  registerFeedbackRoutes(app, {
    store,
    githubClient,
    submissionTokenSecret,
    contentChecker,
    now,
    dailyFeedbackQuota,
    maxFeedbackPerWindow,
    feedbackRateLimitWindowMs,
    feedbackByIp,
    checkUserAccess,
    builderOf,
    invalidateStatusCache,
    runChatAgent,
    resumeBuild,
  });

  registerImproveRoutes(app, {
    store,
    githubClient,
    submissionTokenSecret,
    managedAvailabilityGate,
    contentChecker,
    now,
    dailyImprovementQuota,
    maxImprovementsPerWindow,
    improvementRateLimitWindowMs,
    checkUserAccess,
    builderOf,
    invalidateStatusCache,
    runChatAgent,
    startImprovementRound,
  });

  /**
   * The operator's two verbs on a build beyond publish: stop it, and run it again.
   *
   * Registered here rather than in job-admin-routes because they are made of this
   * module's machinery — the dispatcher, the channel token mint, the cost ledger — and
   * the queue module deliberately owns none of that. Same admission rule as every other
   * operator surface: a non-operator gets 404, not 403.
   */
  app.post<{ Params: { jobId: string } }>('/api/admin/jobs/:jobId/cancel', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) return reply.status(404).send({ error: 'not_found' });
    if (!store) return reply.status(503).send({ error: 'store_unavailable' });
    const jobId = Number(request.params.jobId);
    if (!Number.isInteger(jobId)) return reply.status(400).send({ error: 'invalid_job' });

    const record = await store.getSubmission(jobId);
    if (!record) return reply.status(404).send({ error: 'not_found' });

    const state = resolveJobState(record);
    if (state && isTerminal(state)) return reply.status(409).send({ error: 'already_finished', state });
    // The transition table forbids exactly one non-terminal exit to canceled: a bake in
    // flight. Killing a job mid-publish could leave a publication pointing at a version
    // whose job says it never happened — let it land or fail, then act on that.
    if (state && !canTransition(state, 'canceled')) return reply.status(409).send({ error: 'mid_publish', state });

    const at = new Date(now()).toISOString();
    // A record the job model never adopted has no state to transition from; recording
    // the cancel adopts it directly as canceled, which is the fact the operator just
    // established about it.
    await store.recordJobTransition(jobId, { to: 'canceled', at, by: 'operator', reason: 'operator_canceled' });

    // Best effort, and honest about what it did. The Copilot backend has no kill switch —
    // cancellation there is the job being terminal: the channel's control block now says
    // stop, a live session reads it on its next report, and anything it sends anyway is
    // rejected. `stopEnforced: false` is the console's cue to say "told to stop" rather
    // than "stopped".
    let stopEnforced = false;
    const refs = record.dispatch?.refs;
    const cancelBackend = await backendFor(builderOf(record));
    if (cancelBackend && refs?.length) {
      try {
        const ref = refs[refs.length - 1];
        stopEnforced = (await cancelBackend.cancel(ref, record.dispatch?.credentialRefs?.[ref])).enforced;
      } catch (cancelError) {
        request.log.error({ err: cancelError, jobId }, 'agent cancel failed; job is canceled regardless');
      }
    }

    // Same bookkeeping as a creator abandon. Without `abandonedAt` the job is terminal
    // for the queue but still sits on the creator's studio shelf — a reject from this
    // console left street-heist looking "Stopped" with Playtest still offered, because
    // the shelf only filters on `abandonedAt`, not on job state.
    const afterCancel = await store.getSubmission(jobId);
    if (afterCancel?.dispatch?.workspace) {
      await releaseWorkspace(jobId, afterCancel.dispatch.workspace, request.log, afterCancel.dispatch.backend);
    }
    if (afterCancel?.dispatch?.seedWorkspace) {
      await releaseWorkspace(jobId, afterCancel.dispatch.seedWorkspace, request.log, afterCancel.dispatch.backend);
      await store.clearDispatchSeedWorkspace(jobId);
    }
    await store.setSubmissionAbandoned(jobId, at);
    invalidateStatusCache(jobId);

    return reply.send({ ok: true, state: 'canceled', stopEnforced });
  });

  /**
   * What the operator's retry tells the agent. Deliberately thin: the channel already
   * carries the substantive brief — the gate verdict with its report, pending creator
   * messages, the must-deliver reminder — on every call, derived from what we stored.
   * Repeating any of it here would be a second copy that drifts.
   */
  const OPERATOR_RETRY_BRIEF =
    'The operator restarted this build after it stopped making progress. Read the gate verdict and any ' +
    'pending creator messages on the build channel, fix what ended the last round, and deliver again.';

  /** States a retry makes sense from. */
  const OPERATOR_RETRY_STATES: ReadonlySet<JobState> = new Set<JobState>([
    // The round is dead and feedback-as-retry is the creator's move; this is the
    // operator making it for them.
    'failed',
    'needs_changes',
    // Not dead, just stuck — a quiet session or a wedged dispatch. A retry supersedes
    // the old session with a fresh one on the same job.
    'building',
    'dispatched',
  ]);

  app.post<{ Params: { jobId: string } }>('/api/admin/jobs/:jobId/retry', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) return reply.status(404).send({ error: 'not_found' });
    if (!store) return reply.status(503).send({ error: 'store_unavailable' });
    if (!submissionTokenSecret) {
      return reply.status(503).send({ error: 'agent_backend_unavailable' });
    }
    const jobId = Number(request.params.jobId);
    if (!Number.isInteger(jobId)) return reply.status(400).send({ error: 'invalid_job' });

    const record = await store.getSubmission(jobId);
    if (!record) return reply.status(404).send({ error: 'not_found' });
    if (!(await backendFor(builderOf(record)))) {
      return reply.status(503).send({ error: 'agent_backend_unavailable' });
    }

    const state = resolveJobState(record);
    if (!state || !OPERATOR_RETRY_STATES.has(state)) {
      return reply.status(409).send({ error: 'not_retryable', ...(state ? { state } : {}) });
    }
    // Nothing delivered and nothing dispatched: there is no branch to recover, no stored
    // version to restore, and the spec is not on the record — a round started from here
    // would brief the agent with nothing. `queued` jobs land here, which is deliberate:
    // their fix is dispatch coming back, not an empty session.
    const undelivered = !record.deliveredVersion;
    if (undelivered && !record.dispatch?.refs?.length) {
      return reply.status(409).send({ error: 'never_dispatched' });
    }

    const refsBefore = record.dispatch?.refs?.length ?? 0;
    const outcome = await resumeBuild({
      jobId,
      feedback: undelivered ? '' : OPERATOR_RETRY_BRIEF,
      locale: record.locale ?? 'en',
      log: request.log,
      // An undelivered job's work only exists on its branch; the flag is what stops the
      // resume path deleting it and what hands the new session the old workspace.
      ...(undelivered ? { undelivered: true } : {}),
      transition: { by: 'operator', reason: 'operator_retry' },
    });

    // `resumeBuild` reports dispatch failure by returning it rather than throwing — right
    // for the feedback route, where the request is queued on the channel either way, but
    // an operator clicking retry needs the truth now, and needs to be told *which* truth:
    // an exhausted premium-request allowance is a trip to billing, not a button to press
    // again. The ref count is still checked behind it, because a resume that reported
    // success without starting a session would be the same silence one layer down — a new
    // session always appends a ref.
    if (!outcome.started) {
      return reply.status(502).send({ error: outcome.reason });
    }
    const after = await store.getSubmission(jobId);
    if ((after?.dispatch?.refs?.length ?? 0) <= refsBefore) {
      return reply.status(502).send({ error: 'dispatch_failed' });
    }

    // resumeBuild lands on `dispatched` when the walk allows it. A retry that was
    // already `dispatched` records no move (same state), so stamp an operator_retry
    // marker — otherwise the kick is invisible in the job history. Coming from
    // `building` / `failed` already wrote `dispatched` with this reason.
    if (state === 'dispatched' && after?.state === 'dispatched') {
      await store.recordJobTransition(jobId, {
        to: 'dispatched',
        at: new Date(now()).toISOString(),
        by: 'operator',
        reason: 'operator_retry',
      });
    }

    // One credit: the retry is an agent session like any other, booked by resumeBuild.
    // Report the real phase — `dispatched` until GitHub says `in_progress`.
    return reply.send({ ok: true, state: after?.state ?? 'dispatched', creditsSpent: 1 });
  });

  registerNotifySweepRoutes(app, {
    internalAuthVerifier,
    githubClient,
    submissionTokenSecret,
    store,
    gamesStore: options.agentChannel?.gamesStore,
    adminUids,
    now,
    builderOf,
    backendFor,
    acknowledgeBuilderHandoff,
    recordDerivedJobState,
    reconcileNativeJob,
    reconcileGateVerdict,
    nativeJobStatus,
    buildNotifyDeps,
  });

  // Renders the staging buffer while the agent is still filling it, so a creator is not
  // left watching sentences for the minutes between "the game exists" and "the gate
  // agreed". Needs the games store (the buffer), the GitHub client (the engine half) and
  // the store (where a preview lands), all of which this module already holds — which is
  // why it is built here rather than in app.ts.
  const stagedPreviewStore = options.agentChannel?.gamesStore;
  const stagedPreviews =
    store && stagedPreviewStore && githubClient
      ? createStagedPreviewPublisher({
          store,
          gamesStore: stagedPreviewStore,
          githubClient,
          engineRef: publishedRef,
          ...options.stagedPreview,
          now,
          log: app.log,
          ...(seedDispatch ? { handoff: (jobId: number) => seedDispatch.enqueue(jobId, { action: 'staged-preview' }) } : {}),
          onPublished: (jobId) => {
            buildStatus.invalidateEvents(jobId);
            invalidateStatusCache(jobId);
          },
        })
      : null;
  const sourceDelivery =
    store && stagedPreviewStore
      ? createSourceDeliveryService({
          store,
          gamesStore: stagedPreviewStore,
          kitFileStore: kitFileStoreForDelivery,
          stagedPreviews: stagedPreviews ?? undefined,
          now,
          maxSubmitsPerWindow: options.agentChannel?.maxSubmitsPerWindow,
          gateRunGate: createGateRunGate({
            store,
            now,
            ttlMs: options.creationLimitsTtlMs,
            logWarn: (payload, message) => app.log.warn(payload, message),
          }),
          onSourcesDelivered: options.agentChannel?.onSourcesDelivered,
          onEvent: invalidateDeliveryCaches,
          log: app.log,
          parseSpecTitle,
          runTypecheckPreflight,
          sharedSourcesFromKitTree,
          typecheckPreflightMaxRefusals: TYPECHECK_PREFLIGHT_MAX_REFUSALS,
        })
      : undefined;

  const agentSurface: AgentSurfaceSeams = {
    channel: {
      ...(sourceDelivery ? { sourceDelivery } : {}),
      agentTokenSecret: submissionTokenSecret,
      now,
      onEvent: (jobId) => {
        buildStatus.invalidateEvents(jobId);
        // Heartbeat / ended / phase move with channel writes; do not keep serving a
        // minute-old stall next to fresh progress (submit auto-end + continue loop).
        invalidateStatusCache(jobId);
      },
      onBuilderHandoffAcknowledged: (input) => acknowledgeBuilderHandoff(input),
      ...(stagedPreviews ? { onSourcesStaged: ({ jobId }: { jobId: number }) => stagedPreviews.schedule(jobId) } : {}),
      onRegenerateSeed: regenerateSeed,
    },
    mcp: {
      agentTokenSecret: submissionTokenSecret,
      now,
      startImprovementRound,
      continueDraftRound,
      createGame,
      contentChecker,
      dailyImprovementQuota,
      dailyFeedbackQuota,
    },
  };

  return {
    agentSurface,
    githubClient,
    hasPlatformBackend: agentBackends.platformByVendor.size > 0,
    configuredVendors: [...agentBackends.platformByVendor.keys()],
    ...(agentBackends.defaultVendor ? { defaultVendor: agentBackends.defaultVendor } : {}),
    configuredSeedProviders: [...configuredSeedProviders],
    defaultSeedProvider: seedProviderEnv.defaultProvider,
    getRepoPublishedCatalogEntry: catalogRoutes.getPublishedCatalogEntry,
    startImprovementRound,
    buildNotifyDeps,
    invalidateStatusCache,
    scheduleStagedPreview: stagedPreviews ? (jobId) => stagedPreviews.schedule(jobId) : null,
    redispatchQueuedJob,
    dispatchQueuedJob,
    regenerateSeedNow: seedPipeline.runSeedRegeneration,
    publishStagedPreviewNow: stagedPreviews ? (jobId: number) => stagedPreviews.publishNow(jobId) : null,
  };
}
