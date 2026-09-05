import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyRequest,
  type FastifyServerOptions,
} from 'fastify';
import { registerAccessTokenRoutes, type AccessTokenRoutesOptions } from './access-token-routes.js';
import { registerClientAddress } from './client-address.js';
import { registerProxyDiagnosticsRoutes } from './proxy-diagnostics.js';
import { registerJobAdminRoutes } from '../creation/job-admin-routes.js';
import { createGameSeederFromEnv } from '../creation/seed-provider-env.js';
import { createGcsGamesStore } from '../delivery/games-store.js';
import { createGcsObjectStore } from '../delivery/gcs-sign.js';
import { createQueryKnowledgeFromEnv } from '../creation/knowledge-search.js';
import { createCloudBuildGateTrigger, gateTriggerOptionsFromEnv } from '../delivery/gate-trigger.js';
import { withGateRunCeiling } from './gate-run-ceiling.js';
import { registerAdminRoutes } from './admin.js';
import { parseAppleClientIds, type AppleAuthVerifier } from './apple-auth.js';
import { registerAuthPlugin, type GoogleAuthVerifier } from './auth.js';
import { registerCreatorProfileRoutes } from '../creation/creator-profile-routes.js';
import { catalogEntryFromSpec } from '../catalog/github-client.js';
import { registerGamePageRoutes, type GamePageRoutesOptions } from '../catalog/game-page-routes.js';
import { registerGameFollowRoutes, type GameFollowRoutesOptions } from '../notifications/game-follow-routes.js';
import { createFollowerFanout } from '../notifications/game-follow-notify.js';
import { createGitHubClient } from '../catalog/github-client.js';
import { registerProposalRoutes } from '../community/proposal-routes.js';
import { resolveProposalBase } from '../community/proposal-base.js';
import { applyProposalToRepo } from '../community/proposal-apply-bot.js';
import { createSnapshotReaderFromEnv, type GameSnapshotStore } from '../catalog/game-snapshot.js';
import { registerAccountDeletionRoutes, type AccountDeletionRoutesOptions } from './account-deletion-routes.js';
import { registerSpendBrakeRoutes } from './spend-brake.js';
import { registerCreatorCodeRoutes, type CreatorCodeRoutesOptions } from '../creation/creator-code.js';
import { createKitFileStore } from '../agent-surface/kit-files.js';
import { createSourceDeliveryService, isSourceDeliveryValidationError } from '../delivery/source-delivery.js';
import { assertDeliverableSourcePath } from '../delivery/games-store.js';
import { computeStageAdvisories } from '../delivery/stage-hints.js';
import { loadBuildTranscript } from '../delivery/build-transcript.js';
import { parseSpecTitle } from './spec-frontmatter.js';
import {
  runTypecheckPreflight,
  sharedSourcesFromKitTree,
  TYPECHECK_PREFLIGHT_MAX_REFUSALS,
} from '../creation/typecheck-preflight.js';
import { registerCreatorStudioRoutes } from '../creation/creator-studio.js';
import { isMcpPresenceEventText } from '../agent-surface/mcp-presence.js';
import { toRecentBuilds } from '../delivery/recent-builds.js';
import { registerEditorRoutes } from '../creation/editor-drafts.js';
import { VertexEditorAssistant, type EditorAssistant } from '../creation/editor-assist.js';
import { VertexCodeLane } from '../creation/code-lane.js';
import { VertexTabCompleter, type TabCompleter } from '../creation/tab-complete.js';
import { registerRemixRoutes, MAX_REMIX_ID_LENGTH } from '../creation/remix.js';
import { canProposeTo, openProposal, reconcileProposalGate, transitionProposal } from '../community/proposals.js';
import { isProposerTurn, toPublicProposalState } from '../community/proposal-state.js';
import {
  createEditingGate,
  createCreationGate,
  createGateRunGate,
  createTabCompleteGate,
} from '../creation/creation-limits.js';
import { createDefaultContentChecker, type ContentChecker } from './moderation.js';
import { registerContactRoutes, type ContactRoutesOptions } from '../notifications/contact.js';
import { registerEmailRoutes } from '../notifications/email-routes.js';
import { registerGameSaveRoutes, type GameSaveRoutesOptions } from '../realtime/game-saves.js';
import { registerPresenceRoutes, type PresenceRoutesOptions } from '../realtime/presence.js';
import { registerWorldRoutes, type WorldRoutesOptions } from '../realtime/worlds.js';
import { createWorldSchemaSourceFromEnv } from '../realtime/world-source.js';
import { registerZoneRoutes, type ZoneRoutesOptions } from '../realtime/zones.js';
import { createZoneSchemaSourceFromEnv } from '../realtime/zone-source.js';
import { createGamesRepoClientFromEnv } from '../catalog/games-repo-client.js';
import { resolveLocalGamesDir } from '../catalog/local-games-repo.js';
import { registerMultiplayerRoutes, type MultiplayerRoutesOptions } from '../realtime/mp.js';
import { createRelayClientFromEnv, isRelayOnly } from '../realtime/mp-relay.js';
import { registerNotificationRoutes } from '../notifications/notifications.js';
import { emitProposalNotification, emitReviewSweep } from '../notifications/notify.js';
import { registerPlayerFeedbackRoutes, type PlayerFeedbackRoutesOptions } from '../community/player-feedback.js';
import { registerReviewRoutes, type ReviewRoutesOptions } from '../community/review.js';
import { registerPushRoutes } from '../notifications/push-routes.js';
import { registerDigestRoutes, type DigestRoutesOptions } from './digest.js';
import { parseBatchSize, registerHealthSweepRoutes, type HealthSweepRoutesOptions } from '../catalog/game-health.js';
import { registerSuggestionSweepRoutes, type SuggestionSweepRoutesOptions } from '../community/suggestion-sweep.js';
import { registerSeedDispatchRoute, type SeedDispatchRouteOptions } from '../creation/seed-dispatch.js';
import { registerDispatchReaperRoutes, type DispatchReaperRoutesOptions } from '../creation/dispatch-reaper.js';
import {
  buildImprovementBrief,
  registerSuggestionInboxRoutes,
  type SuggestionInboxRoutesOptions,
} from '../community/suggestion-inbox.js';
import { registerScorecardRoutes, type ScorecardRoutesOptions } from '../creation/scorecard.js';
import { createDefaultThemeExtractor } from '../community/feedback-themes.js';
import { createInternalAuthVerifierFromEnv, type InternalAuthVerifier } from './internal-auth.js';
import { registerRefineRoute, type SpecRefiner } from '../creation/refine.js';
import { BOT_UID_PREFIX, InMemoryStore, type Store } from './store.js';
import { registerAgentChannelRoutes, type AgentChannelOptions } from '../agent-surface/agent-channel.js';
import { registerMcpServerRoutes } from '../agent-surface/mcp-server.js';
import { registerSubmissionRoutes, type SubmissionRoutesOptions } from '../submissions.js';
import { mintToken } from './submission-token.js';
import { registerTelemetryRoutes, type TelemetryRoutesOptions } from '../telemetry/telemetry.js';
import { registerVisitTelemetryRoutes } from '../telemetry/visit-telemetry.js';
import { registerCliSurfaceRoutes } from './cli-surface.js';
import { registerCreatorPatRoutes } from './creator-pat-routes.js';
import { registerCreatorVersionRoutes } from '../creation/creator-versions.js';
import { registerVoteRoutes, type VoteRoutesOptions } from '../community/votes.js';
import { registerRecommendationRoutes, type RecommendationRoutesOptions } from '../catalog/recommendations.js';
import { createCombinedPublishedSlugGate, createPublishedSlugGateFromEnv } from '../catalog/published-slugs.js';
import { createCatalogGenreSourceFromEnv } from '../catalog/catalog-genre-source.js';
import { registerRateLimit } from './rate-limit.js';
import { isKnownSpaShellPath, looksLikeStaticAsset } from './spa-paths.js';
import { registerOAuthProtectedResourceRoutes } from '../agent-surface/mcp-oauth-metadata.js';
import { registerMcpServerDiscoveryRoutes } from '../agent-surface/mcp-server-discovery.js';
import { registerOpenAiAppsChallengeRoute } from './openai-apps-challenge.js';
import { registerOAuthAuthorizationServerRoutes } from './oauth-as.js';
import { registerTokenLoginRoutes } from './oauth-token-login.js';
import { registerCreatorAgentKeyRoutes } from '../agent-surface/creator-agent-key-routes.js';
import { isPublishedEntry } from '@gamedevpl/contract';

const GAME_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function parsePublicPlaySlugs(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((slug) => slug.trim().toLowerCase())
        .filter((slug) => GAME_SLUG_PATTERN.test(slug)),
    ),
  ];
}

function isPublicPlayRequest(request: FastifyRequest, publicPlaySlugs: Set<string>): boolean {
  const path = request.url.split('?')[0] ?? request.url;

  if (request.method === 'POST' && path === '/api/telemetry') {
    const body = request.body;
    return (
      typeof body === 'object' &&
      body !== null &&
      'slug' in body &&
      typeof (body as { slug?: unknown }).slug === 'string' &&
      publicPlaySlugs.has((body as { slug: string }).slug)
    );
  }

  if (request.method !== 'GET') return false;
  const match = path.match(/^\/api\/games\/([^/]+)(?:\/(votes|world|presence))?\/?$/);
  if (!match?.[1]) return false;

  let slug: string;
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    return false;
  }

  return publicPlaySlugs.has(slug);
}

export interface BuildAppOptions {
  /** `false` in tests by default; pass a Pino destination to assert on log lines. */
  logger?: FastifyServerOptions['logger'];
  store?: Store;
  sessionSecret?: string;
  sessionSecretPrev?: string;
  googleClientId?: string;
  googleAuthVerifier?: GoogleAuthVerifier;
  /** Seam for Sign in with Apple; defaults to JWKS-or-deny-all from APPLE_CLIENT_IDS. */
  appleAuthVerifier?: AppleAuthVerifier;
  submissionRoutes?: SubmissionRoutesOptions;
  // Shared secret the Copilot MCP connector authenticates with.
  platformConnectorSecret?: string;
  contentChecker?: ContentChecker;
  specRefiner?: SpecRefiner;
  /** The editor's NL tuning router. Defaults to the Vertex one; stubbed in tests. */
  editorAssistant?: EditorAssistant;
  // Ghost-text completer (TA-01). Defaults to Vertex; stubbed in tests.
  tabCompleter?: TabCompleter;
  multiplayerRoutes?: MultiplayerRoutesOptions;
  /** Seams for play-session telemetry; defaults to a live catalog-backed slug gate. */
  telemetryRoutes?: Omit<TelemetryRoutesOptions, 'store'>;
  /** Seams for game votes; defaults to a live catalog-backed slug gate. */
  voteRoutes?: Omit<VoteRoutesOptions, 'store'>;
  /** Seams for home-page recommendations; defaults to live catalog + scorecards. */
  recommendationRoutes?: Omit<RecommendationRoutesOptions, 'store'>;
  /** Seams for per-player game saves; defaults to a live catalog-backed slug gate. */
  gameSaveRoutes?: Omit<GameSaveRoutesOptions, 'store'>;
  /** Seams for shared worlds; defaults to a live games-repo-backed schema source. */
  worldRoutes?: Partial<Omit<WorldRoutesOptions, 'store'>>;
  /** Seams for ambient presence. Note the absence of a store: it keeps nothing durable. */
  presenceRoutes?: Partial<PresenceRoutesOptions>;
  zoneRoutes?: Partial<ZoneRoutesOptions>;
  /** Seams for written player feedback; defaults to a live catalog-backed slug gate. */
  playerFeedbackRoutes?: Omit<PlayerFeedbackRoutesOptions, 'store' | 'contentChecker'>;
  /** Seams for the nightly scorecard sweep; defaults to OIDC-or-deny-all from env. */
  scorecardRoutes?: Partial<Omit<ScorecardRoutesOptions, 'store'>>;
  digestRoutes?: Partial<Omit<DigestRoutesOptions, 'store'>>;
  suggestionSweepRoutes?: Partial<Omit<SuggestionSweepRoutesOptions, 'store'>>;
  seedDispatchRoutes?: Partial<Omit<SeedDispatchRouteOptions, 'dispatchQueuedJob'>>;
  dispatchReaperRoutes?: Partial<Omit<DispatchReaperRoutesOptions, 'store' | 'redispatchQueuedJob'>>;
  /** Seams for the published-shelf health sweep; defaults to OIDC-or-deny-all from env. */
  healthSweepRoutes?: Partial<HealthSweepRoutesOptions>;
  /** Seams for the creator suggestion inbox; the GitHub client is shared with submissions. */
  suggestionInboxRoutes?: Partial<Omit<SuggestionInboxRoutesOptions, 'store'>>;
  /** Seams for the public contact form (mailer fake in tests). */
  contactRoutes?: ContactRoutesOptions;
  /** Seams for the public game page (cache TTL / clock under test). */
  gamePageRoutes?: Partial<Omit<GamePageRoutesOptions, 'store'>>;
  /** Seams for per-game following. */
  gameFollowRoutes?: Partial<Omit<GameFollowRoutesOptions, 'store'>>;
  /** Seams for delayed account erasure; defaults to OIDC-or-deny-all from env. */
  accountDeletionRoutes?: Partial<
    Omit<AccountDeletionRoutesOptions, 'store' | 'adminUids' | 'internalAuthVerifier'>
  > & { internalAuthVerifier?: AccountDeletionRoutesOptions['internalAuthVerifier'] };
  // Seam for the spend brake; OIDC-or-deny-all from env.
  spendBrakeRoutes?: { internalAuthVerifier?: InternalAuthVerifier };
  // Private beta allowlist — uids (comma-separated) allowed to sign in and access gated routes
  betaAllowedUids?: string;
  // Private beta allowlist — Google-verified emails (comma-separated, case-insensitive)
  betaAllowedEmails?: string;
  // Promotional published game slugs that remain playable without a session
  publicPlaySlugs?: string;
  /** Cache lifetime for the operator-managed promotional allowlist. */
  publicPlayTtlMs?: number;
  // Uids (comma-separated) allowed to read the operator telemetry view
  adminUids?: string;
  reviewerUids?: string;
  // Seams for reviewer desk; defaults to snapshot/GitHub catalog.
  reviewRoutes?: Omit<ReviewRoutesOptions, 'store' | 'adminUids' | 'reviewerUids'>;
  creatorCodeRoutes?: Partial<Omit<CreatorCodeRoutesOptions, 'store'>>;
  // Seams for personal access tokens; its clock also goes to token-info.
  accessTokenRoutes?: Partial<Omit<AccessTokenRoutesOptions, 'store' | 'adminUids'>>;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  // trustProxy stays 1, and raising it is a spoofing hole: see docs/deployment.md.
  // maxParamLength: a remix id is a self-describing token (apps/api/src/remix.ts)
  // that carries the game's slug, so it is longer than Fastify's 100-character
  // default allows. Over the limit the router answers 414 before any handler runs
  // — which would read as "every remix on a long-slugged game is broken" with
  // nothing in the logs. MAX_REMIX_ID_LENGTH is the bound the minter respects.
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: (_address, hop) => hop === 0,
    routerOptions: { maxParamLength: MAX_REMIX_ID_LENGTH },
  });

  registerClientAddress(app);

  // Fastify's default 500 echoes err.message; 4xx replies pass through.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    // Fastify reads both; statusCode wins when an error carries each.
    const statusCode = error.statusCode ?? (error as { status?: number }).status ?? 500;
    if (statusCode >= 400 && statusCode < 500) {
      void reply.send(error);
      return;
    }
    request.log.error({ err: error, method: request.method, url: request.url }, 'unhandled route error');
    void reply.code(500).send({ error: 'internal' });
  });

  const store = options.store ?? new InMemoryStore();

  const isProd = process.env.NODE_ENV === 'production';
  const webOrigin = process.env.WEB_ORIGIN?.trim();

  // In production, WEB_ORIGIN pins CORS to the deployed site (e.g. https://www.gamedev.pl);
  // a comma-separated list is allowed. When unset in prod, origin is false (disabling cross-origin
  // requests, while allowing same-origin SPA traffic). In dev, origin defaults to true.
  await app.register(cors, {
    origin: webOrigin ? webOrigin.split(',').map((entry) => entry.trim()) : isProd ? false : true,
    credentials: true,
  });

  // IP rate limiting (opt-in per route via `{ config: { rateLimit } }`). Registered
  // before route plugins so annotated handlers are covered. Imported as
  // `fastify-rate-limit` so CodeQL's js/missing-rate-limiting model recognizes it.
  await registerRateLimit(app);

  // Private beta controls. When PRIVATE_BETA=true, all data routes require a session
  // and sign-in is restricted to uids/emails in the allowlist.
  // Flip to false (config, not code) to open the site. Tests/dev default to false.
  const privateBeta =
    options.betaAllowedUids !== undefined || options.betaAllowedEmails !== undefined
      ? true // explicit test injection implies beta mode
      : (process.env.PRIVATE_BETA ?? '').toLowerCase() === 'true';

  const betaAllowedUids = new Set(
    (options.betaAllowedUids ?? process.env.BETA_ALLOWED_UIDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const betaAllowedEmails = new Set(
    (options.betaAllowedEmails ?? process.env.BETA_ALLOWED_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const publicPlayFallbackSlugs = new Set(
    parsePublicPlaySlugs(options.publicPlaySlugs ?? process.env.PUBLIC_PLAY_SLUGS),
  );
  const publicPlayTtlMs = options.publicPlayTtlMs ?? 60_000;
  let publicPlayCache: { slugs: Set<string>; expiresAt: number } | null = null;
  const getPublicPlaySlugs = async (): Promise<Set<string>> => {
    const now = Date.now();
    if (publicPlayCache && publicPlayCache.expiresAt > now) return publicPlayCache.slugs;
    try {
      const stored = await store.getPublicPlayConfig();
      const slugs = new Set(stored?.slugs ?? publicPlayFallbackSlugs);
      publicPlayCache = { slugs, expiresAt: now + publicPlayTtlMs };
      return slugs;
    } catch {
      const fallback = publicPlayCache?.slugs ?? publicPlayFallbackSlugs;
      publicPlayCache = { slugs: fallback, expiresAt: now + publicPlayTtlMs };
      return fallback;
    }
  };

  const adminUids = new Set(
    (options.adminUids ?? process.env.ADMIN_UIDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const reviewerUids = new Set(
    (options.reviewerUids ?? process.env.REVIEWER_UIDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  // Count moderation before capping it.
  const contentChecker =
    options.contentChecker ??
    createDefaultContentChecker({
      onPaidCall: () => {
        const dateStr = new Date(Date.now()).toISOString().slice(0, 10);
        void store?.incrementGlobalModerationCalls(dateStr, 1).catch(() => {});
      },
    });

  // Auth plugin registers cookies, /api/auth/* endpoints, and user session decorator.
  // The private-beta allowlist is enforced inside the plugin on /api/auth/google.
  await registerAuthPlugin(app, {
    store,
    sessionSecret: options.sessionSecret,
    sessionSecretPrev: options.sessionSecretPrev,
    googleClientId: options.googleClientId,
    googleAuthVerifier: options.googleAuthVerifier,
    appleAuthVerifier: options.appleAuthVerifier,
    privateBeta,
    betaAllowedUids,
    betaAllowedEmails,
    // So the session can tell the client whether to offer the operator console. Not
    // authorization — every operator route still checks this same set itself.
    adminUids,
    // Same hint contract for the reviewer desk.
    reviewerUids,
    // A floored day count, so token-info reads the minting clock.
    now: options.accessTokenRoutes?.now,
  });

  // Where a delivered game is stored, and what verifies it. Resolved once and shared by
  // every registration that needs them: three copies of these expressions is three ways
  // for delivery, publishing and the health sweep to end up pointed at different buckets
  // or different gates.
  const gamesStoreBucket = process.env.GAMES_STORE_BUCKET?.trim();
  const gamesStore =
    options.submissionRoutes?.agentChannel?.gamesStore ??
    (gamesStoreBucket ? createGcsGamesStore({ bucket: gamesStoreBucket }) : undefined);
  // Same bucket as deliveries: kits/ and examples/ live next to games/<slug>/versions/.
  const objectStore =
    options.submissionRoutes?.agentChannel?.objectStore ??
    (gamesStoreBucket ? createGcsObjectStore({ bucket: gamesStoreBucket }) : undefined);
  // Wrapped once here so every entry point — delivery, editor, remix, proposals,
  // re-gate and the health sweep — starts builds through the same daily ceiling.
  const gateTrigger = withGateRunCeiling(
    options.submissionRoutes?.agentChannel?.onSourcesDelivered ??
      createCloudBuildGateTrigger(gateTriggerOptionsFromEnv(), app.log),
    createGateRunGate({ store, logWarn: (payload, msg) => app.log.warn(payload, msg) }),
    { logWarn: (payload, msg) => app.log.warn(payload, msg) },
  );
  // Off unless KNOWLEDGE_SEARCH_ENGINE_ID is set — see knowledge-search.ts.
  const knowledgeSearch =
    options.submissionRoutes?.agentChannel?.knowledgeSearch ?? createQueryKnowledgeFromEnv(app.log);

  /**
   * The catalog lane's plumbing (research §4a), assembled once and shared.
   *
   * `snapshotReader` anchors a repo-lane proposal to the commit the live snapshot was baked
   * from — the game a player is actually looking at when they decide to change it, which is
   * also what makes drift detectable later. `gamesRepoClient` is what turns an accepted
   * repo-lane proposal into a pull request; absent in deployments with no games-repo
   * credentials, which degrades the feature to "reviewable but not yet merged back" rather
   * than breaking it.
   *
   * One resolver, shared with the MCP proposal tools mounted below, so an agent's proposal
   * and a reviewer's diff cannot disagree about a game's sources.
   */
  const proposalGithubToken = options.submissionRoutes?.githubToken ?? process.env.GITHUB_TOKEN;
  const snapshotReader = createSnapshotReaderFromEnv();
  const gamesRepoName =
    options.submissionRoutes?.gamesRepo ?? process.env.GAMES_REPO ?? 'gamedevpl/www.gamedev.pl-games';
  const gamesRepoClient =
    options.submissionRoutes?.githubClient ??
    (proposalGithubToken ? createGitHubClient({ token: proposalGithubToken, repo: gamesRepoName }) : null);

  const proposalBaseOptions = {
    store,
    gamesStore,
    snapshotStore: (snapshotReader as unknown as GameSnapshotStore | null) ?? null,
    gamesRepo: gamesRepoName,
    ...(proposalGithubToken ? { gamesRepoToken: proposalGithubToken } : {}),
  };

  const resolveBaseForProposal = async (slug: string) => {
    try {
      return await resolveProposalBase(proposalBaseOptions, slug);
    } catch {
      // A base we cannot read is not a proposal we can open, nor a diff we can compute.
      // Callers degrade rather than fail: the review card falls back to "play it and read
      // the description", and an agent is told it could not read that game's sources.
      return null;
    }
  };

  // Env registry selects managed; explicit platform backends still win.
  const resolvedAgentBackends = options.submissionRoutes?.agentBackends;

  const agentChannelOptions: AgentChannelOptions = {
    ...options.submissionRoutes?.agentChannel,
    // Without a bucket the delivery verb answers 503 rather than accepting an agent's
    // work and silently dropping it — which is the right behaviour for local
    // development, where there is no bucket at all.
    gamesStore,
    objectStore,
    knowledgeSearch,
    // Run the gate as soon as a game is delivered. Without this a candidate is stored
    // and never verified, so it can never publish — the upload path would end in a
    // queue nobody drains.
    onSourcesDelivered: gateTrigger,
    // N1: delivery's and creation's machinery, bound here rather than imported.
    isSourceDeliveryValidationError,
    computeStageAdvisories: (input) =>
      computeStageAdvisories({ ...input, runTypecheckPreflight, sharedSourcesFromKitTree }),
    loadBuildTranscript: (transcriptStore, record, opts) =>
      loadBuildTranscript(transcriptStore, record, isMcpPresenceEventText, opts),
  };

  const platformConnectorSecret = options.platformConnectorSecret ?? process.env.COPILOT_MCP_CONNECTOR_SECRET;

  const submissionSeams = await registerSubmissionRoutes(app, {
    ...options.submissionRoutes,
    store,
    contentChecker,
    // Same allowlist the console is gated on: the people who can see the queue are the
    // people its alerts are addressed to. Two lists would drift, and the failure mode of
    // drift here is an alert nobody receives.
    adminUids,
    agentBackend: options.submissionRoutes?.agentBackend,
    // Self needs store callbacks inside registerSubmissionRoutes; do not pre-build it.
    agentBackends: resolvedAgentBackends,
    managedBackendDeps: {
      // N1: catalog's GitHub client, built here for copilot's run cancel.
      githubClientFactory: createGitHubClient,
      ...(options.submissionRoutes?.managedBackendDeps ??
        (options.submissionRoutes?.agentBackend
          ? undefined
          : {
              readSignals: async (jobId: number) => {
                const record = await store.getSubmission(jobId);
                return record
                  ? {
                      deliveredVersion: record.deliveredVersion,
                      previewVersion: record.previewVersion,
                      agentEndedAt: record.agentEndedAt,
                    }
                  : null;
              },
              readCredentialRef: async (jobId: number, sessionRef: string) => {
                const record = await store.getSubmission(jobId);
                return record?.dispatch?.credentialRefs?.[sessionRef];
              },
            })),
    },
    gameSeeder:
      options.submissionRoutes?.gameSeeder ?? createGameSeederFromEnv(app.log, knowledgeSearch, snapshotReader),
    agentChannel: agentChannelOptions,
  });

  // The agent's wire and the MCP tools over it, mounted where the route table lives.

  const { agentSurface } = submissionSeams;

  await registerAgentChannelRoutes(app, { ...agentChannelOptions, ...agentSurface.channel, store });

  // Remote MCP (BY-05): streamable-HTTP tools wrapping the channel above. Same secret
  // and store — sessionKey is derived from the round key, never a new creator credential.
  await registerMcpServerRoutes(app, {
    ...agentSurface.mcp,
    store,
    platformConnectorSecret,
    // So /api/mcp can say the product is closed. Not a gate.
    privateBeta,
    gamesStore,
    objectStore,
    // Proposal rounds: an agent contributing to a game its creator does not own.
    resolveProposalBase: resolveBaseForProposal,
    onSourcesDelivered: gateTrigger,
    // N1: community's state machine and delivery's path rule, wired here.
    proposals: {
      canProposeTo,
      openProposal,
      reconcileProposalGate,
      transitionProposal,
      isProposerTurn,
      toPublicProposalState,
    },
    assertDeliverableSourcePath,
  });

  // Multiplayer room relay (docs/multiplayer-plan.md). Registered after the auth
  // plugin so /api/mp/sessions sees request.user, and before the beta wall hook
  // so the wall's /api/mp/ws exemption applies to a route that actually exists.
  //
  // One image runs both roles (store-launch-plan.md T0, private www.gamedev.pl-ops repo): with MP_RELAY_URL set this
  // process forwards room creation and stops serving the socket; with MP_RELAY_ONLY set it
  // IS the relay. Neither set is the single-process default that local dev and the tests
  // use, so explicit options here always win over env.
  await app.register(fastifyWebsocket, { options: { maxPayload: 4 * 1024 } });
  await registerMultiplayerRoutes(app, {
    relayClient: createRelayClientFromEnv(),
    relayOnly: isRelayOnly(),
    internalAuth: isRelayOnly() ? createInternalAuthVerifierFromEnv(process.env, 'mpRelay') : undefined,
    ...options.multiplayerRoutes,
  });

  await registerRefineRoute(app, {
    store,
    contentChecker,
    specRefiner: options.specRefiner,
  });

  await registerNotificationRoutes(app, { store });

  await registerPushRoutes(app, { store, vapidPublicKey: process.env.VAPID_PUBLIC_KEY?.trim() });

  await registerEmailRoutes(app, { store, unsubscribeSecret: options.sessionSecret });

  // Public contact form → admin@gamedev.pl. Exempted from the private-beta wall
  // below: a published contact point that only signed-in beta users can reach is
  // not a published contact point. Rate-limited and moderated in the handler.
  await registerContactRoutes(app, options.contactRoutes);

  // Play-session telemetry (docs/improvement-loop-plan.md IL-1). Deliberately *not*
  // exempted from the private-beta wall below: during closed beta every player is a
  // signed-in member, so the wall costs nothing and keeps the intake shut to the
  // open internet. Revisit when the site opens — the handler itself never reads
  // request.user and records nothing that identifies a player.
  //
  // One env-derived gate is shared by telemetry, votes, and written feedback: all
  // three ask the same question ("is this a published slug?") and must not drift.
  // The combined gate OR's the games-repo catalog with store publications so
  // self-build games (never in catalog.json) are visible to the same callers the
  // /play route already serves. Call-site overrides still win via the spreads below.
  const envPublishedSlugs = createCombinedPublishedSlugGate({
    repoGate: await createPublishedSlugGateFromEnv(),
    store,
  });
  await registerTelemetryRoutes(app, {
    store,
    publishedSlugs: envPublishedSlugs,
    ...options.telemetryRoutes,
  });

  // Visit telemetry is exempt from the private-beta wall: first-minute arrivals.
  await registerVisitTelemetryRoutes(app, { store });
  await registerCliSurfaceRoutes(app);
  // Thumbs up/down (docs/improvement-loop-plan.md, signal source #2). Casting or
  // clearing a vote needs a session (request.user), same as push subscriptions; the
  // count read does not, so a shared game link shows real numbers to a visitor who
  // has never signed in. `/api/games/` is already exempt from the beta wall below,
  // for the same reason play itself is: it is what a game link has to work through.
  await registerVoteRoutes(app, {
    store,
    publishedSlugs: envPublishedSlugs,
    ...options.voteRoutes,
  });

  // Home-page recommendations. Community half reads scorecards (aggregates about
  // games); personal half reads play affinity under the account. Never touches the
  // anonymous play/visit streams. The arcade grid sorts by the returned order —
  // see docs/recommendations.md.
  const envCatalogGenres = await createCatalogGenreSourceFromEnv();
  await registerRecommendationRoutes(app, {
    store,
    publishedSlugs: envPublishedSlugs,
    catalog: envCatalogGenres,
    ...options.recommendationRoutes,
  });

  // Durable per-player progress (docs/persistent-world-plan.md P1). Same slug gate as
  // votes, but unlike votes there is no public read at all: a save belongs to exactly
  // one person and is meaningless to anyone else, so every method here needs a session.
  // The game never calls this — the shell does, on the game's behalf, over the bridge.
  await registerGameSaveRoutes(app, {
    store,
    publishedSlugs: envPublishedSlugs,
    ...options.gameSaveRoutes,
  });

  // Shared asynchronous worlds (docs/persistent-world-plan.md P2). Unlike saves, the
  // read here is public: a world is worth looking at before you have an account, and
  // gating it would show an empty field to exactly the visitor deciding whether to
  // care. Writes need a session, are validated against the game's declared schema, and
  // run every text field past the same moderator written feedback uses.
  const manifestGamesRepoClient = await createGamesRepoClientFromEnv();
  const worldSchemas = createWorldSchemaSourceFromEnv(envPublishedSlugs, manifestGamesRepoClient);
  await registerWorldRoutes(app, {
    store,
    contentChecker,
    worlds: worldSchemas,
    ...options.worldRoutes,
  });

  // Ambient co-presence in those worlds (docs/persistent-world-plan.md P2.5). Reads are
  // public for the same reason the world's are; appearing needs a session. It takes no
  // `store` on purpose — presence is TTL-only and in memory, so there is nothing durable
  // to erase and `erase-player-signals.ts` is untouched by it. The schema source is
  // shared with the world routes: a roster only exists where a world declared one.
  await registerPresenceRoutes(app, {
    worlds: worldSchemas,
    ...options.presenceRoutes,
  });

  // Admission to authoritative zones (docs/persistent-world-plan.md P3). This service
  // mints tickets and says where to take them; the simulation itself runs in the
  // separate gamedev-world host (docs/p3-zone-host-infra.md), which never sees a
  // session. With ZONE_HOST_URL unset there is no host, so the route 404s and every
  // game plays on exactly as it did — the same posture push takes without its keys.
  await registerZoneRoutes(app, {
    zones: createZoneSchemaSourceFromEnv(envPublishedSlugs, manifestGamesRepoClient),
    ...options.zoneRoutes,
  });

  // Written player feedback (docs/improvement-loop-plan.md, signal source #1). Keyed
  // by slug and gated the same way votes are; unlike votes it requires a session to
  // even read the tradeoff (there is no public read here — feedback has no public
  // aggregate view yet, that's IL-2's scorecard). See player-feedback.ts for why it
  // needs a session and why, unlike creator feedback, it never touches GitHub.
  await registerPlayerFeedbackRoutes(app, {
    store,
    contentChecker,
    publishedSlugs: envPublishedSlugs,
    ...options.playerFeedbackRoutes,
  });

  // Operator reads over that telemetry. Separate allowlist from the beta one: being
  // let into the closed beta is not the same as being allowed to read every game's
  // numbers. Unset means the route admits nobody, which is the right default for a
  // surface whose whole purpose is seeing across other people's games.
  // The creation-breaker knobs come from the submission-route options so the operator
  // surface reports the same ceiling and the same propagation delay the gate actually
  // enforces, rather than a second copy of the defaults that could drift from it.
  await registerAdminRoutes(app, {
    store,
    adminUids,
    globalDailySubmissionCap: options.submissionRoutes?.globalDailySubmissionCap,
    creationLimitsTtlMs: options.submissionRoutes?.creationLimitsTtlMs,
    publicPlayFallbackSlugs: [...publicPlayFallbackSlugs],
    publicPlayTtlMs,
    hasPlatformBackend: submissionSeams.hasPlatformBackend,
    configuredVendors: submissionSeams.configuredVendors,
    defaultVendor: submissionSeams.defaultVendor,
    configuredSeedProviders: submissionSeams.configuredSeedProviders,
    defaultSeedProvider: submissionSeams.defaultSeedProvider,
  });

  // Review catalog matches /api/catalog; snapshot first in prod.
  const publishedRef = process.env.GAMES_REPO_REF?.trim() || 'main';
  const reviewCatalogClient = submissionSeams.githubClient ?? gamesRepoClient;
  const defaultReviewCatalog = async () => {
    try {
      const fromSnapshot = snapshotReader ? await snapshotReader.getCatalog() : null;
      if (fromSnapshot && fromSnapshot.length > 0) {
        return fromSnapshot.map((entry) => ({
          slug: entry.slug,
          title: entry.title,
          creatorHandle: entry.creatorHandle ?? null,
          genre: entry.genre,
          media: entry.media ?? null,
        }));
      }
    } catch {
      // Fall through to the repo / local client.
    }
    if (!reviewCatalogClient) return [];
    const entries = await reviewCatalogClient.getCatalog(publishedRef);
    return entries.filter(isPublishedEntry).map((entry) => ({
      slug: entry.slug,
      title: entry.title,
      creatorHandle: entry.creatorHandle ?? null,
      genre: entry.genre,
      media: entry.media ?? null,
    }));
  };
  await registerReviewRoutes(app, {
    store,
    reviewerUids,
    adminUids,
    listCatalog: defaultReviewCatalog,
    emitDeps: submissionSeams.buildNotifyDeps(),
    emitReviewSweep,
    ...options.reviewRoutes,
  });

  // The nightly Distill step (docs/improvement-loop-plan.md IL-2): rolls the telemetry
  // window plus vote/feedback counts into one scorecard per game. Authenticated by the
  // scheduler's OIDC token in the handler — the beta wall already exempts /api/internal/,
  // which is why the verifier and not the wall is what protects it.
  await registerScorecardRoutes(app, {
    store,
    internalAuthVerifier: createInternalAuthVerifierFromEnv(process.env, 'scorecardSweep'),
    // Vertex in production, nothing anywhere else — community owns that choice.
    themeExtractor: createDefaultThemeExtractor(),
    ...options.scorecardRoutes,
  });

  // The weekly digest (docs/improvement-loop-plan.md IL-2): tells creators what happened
  // with their games without their having to come and look. Reads the scorecards the sweep
  // above produced, so the two can never disagree about the numbers.
  await registerDigestRoutes(app, {
    store,
    internalAuthVerifier: createInternalAuthVerifierFromEnv(process.env, 'digestSweep'),
    ...options.digestRoutes,
  });

  // The analyst run (docs/improvement-loop-plan.md IL-3): persists what the router says
  // about the scorecards above, reconciling against the open set so a problem that lasts
  // a month is one card rather than thirty. Files nothing and notifies nobody — approval
  // is a separate human step.
  await registerSuggestionSweepRoutes(app, {
    store,
    internalAuthVerifier: createInternalAuthVerifierFromEnv(process.env, 'suggestionSweep'),
    // IL-4: the sweep can start work itself, but only for games whose creator opted in.
    // Same dispatch path as an approval, so autonomous and human-approved work cannot
    // reach an agent by different routes.
    startImprovementRound: submissionSeams.startImprovementRound,
    buildBrief: buildImprovementBrief,
    ...options.suggestionSweepRoutes,
  });

  await registerDispatchReaperRoutes(app, {
    store,
    redispatchQueuedJob: submissionSeams.redispatchQueuedJob,
    internalAuthVerifier: createInternalAuthVerifierFromEnv(process.env, 'dispatchReaper'),
    ...options.dispatchReaperRoutes,
  });

  // The service calling itself so round-0 seeding runs inside a request (seed-dispatch.ts).
  await registerSeedDispatchRoute(app, {
    dispatchQueuedJob: submissionSeams.dispatchQueuedJob,
    internalAuthVerifier: createInternalAuthVerifierFromEnv(process.env, 'seedDispatch'),
    ...options.seedDispatchRoutes,
  });

  // The break-and-nudge loop's own clock (game-health.ts). A published game serves from a
  // frozen bundle, so a moving engine never breaks what players load — what it breaks is
  // the game's ability to be rebuilt, and only a re-run of the gate can tell us that
  // happened. This is what makes the loop autonomous: the console's Re-gate button is a
  // human noticing, and nobody was going to notice every time GameKit moved.
  await registerHealthSweepRoutes(app, {
    store,
    gamesStore,
    gateTrigger,
    // The same client the submission routes resolved: one place holds the games-repo
    // credential, and "what is today's engine commit" is a games-repo read like any other.
    githubClient: submissionSeams.githubClient ?? undefined,
    internalAuthVerifier: createInternalAuthVerifierFromEnv(process.env, 'healthSweep'),
    // Matches run-gate.ts's `--health`, which checks against the branch rather than the
    // version's pin. Two different answers to "what is today's engine" would make the
    // sweep start runs it then judges stale the moment they finish.
    engineRef: process.env.GAMES_ENGINE_REF?.trim() || undefined,
    batch: parseBatchSize(process.env.HEALTH_SWEEP_BATCH),
    ...options.healthSweepRoutes,
  });

  // Where a human decides (docs/improvement-loop-plan.md IL-3 creator surface). Files
  // through the same games-repo client the submission routes resolved, so approving a
  // suggestion and requesting an improvement cannot disagree about where issues go.
  await registerSuggestionInboxRoutes(app, {
    store,
    startImprovementRound: submissionSeams.startImprovementRound,
    ...options.suggestionInboxRoutes,
  });

  // Issuing personal access tokens (docs/agent-access-tokens.md) — the credential that
  // lets a coding agent in a cloud VM authenticate as a real account without a browser,
  // a Google identity, or any bypass route. Same operator allowlist as the views above,
  // and session-only, so a token can never mint another.
  await registerAccessTokenRoutes(app, { store, adminUids, now: options.accessTokenRoutes?.now });
  registerProxyDiagnosticsRoutes(app);

  // The build queue, answered from the store alone. Until jobs carried their own state
  // there was nothing to answer it with: deriving every in-flight submission's status on
  // demand is the fan-out that has rate-limited the site before.
  await registerJobAdminRoutes(app, {
    store,
    adminUids,
    // The same store the delivery path writes to, so publishing and delivery can never
    // end up pointed at different buckets. Publishing re-reads the gate verdict off the
    // manifest rather than trusting the job's derived state.
    gamesStore,
    // Tell followers a game they follow moved. Reuses the submission routes' own
    // notification deps, so email and the unsubscribe token behave identically here.
    notifyFollowers: async (event) => {
      await createFollowerFanout({
        store,
        emitDeps: submissionSeams.buildNotifyDeps(),
        log: { error: (context, message) => app.log.error(context, message) },
      })(event);
    },
  });

  // Creator control panel (docs/improvement-loop-plan.md IL-2 creator surface). Own
  // shelf + per-game health for games this uid owns — not the operator catalog view.
  // Secret resolution must stay byte-for-byte with registerSubmissionRoutes, or studio
  // deep-link tokens will fail verification on the status/improve routes.
  const nodeEnv = process.env.NODE_ENV;
  const githubToken = options.submissionRoutes?.githubToken ?? process.env.GITHUB_TOKEN;
  const localGames =
    nodeEnv !== 'production' && nodeEnv !== 'test' && !githubToken && !options.submissionRoutes?.githubClient
      ? await resolveLocalGamesDir()
      : null;
  const submissionTokenSecret =
    options.submissionRoutes?.submissionTokenSecret ??
    process.env.SUBMISSION_TOKEN_SECRET ??
    (localGames ? 'local-development-submission-secret' : undefined);
  await registerCreatorStudioRoutes(app, {
    store,
    gamesStore,
    mintStatusToken: submissionTokenSecret ? (jobId) => mintToken(jobId, submissionTokenSecret) : undefined,
    objectStore,
    // N1: the two cross-bucket reads the build rail needs, wired here rather
    // than imported from creation/.
    isPresenceEventText: isMcpPresenceEventText,
    toRecentBuilds,
  });
  await registerCreatorVersionRoutes(app, { store, gamesStore });
  await registerCreatorPatRoutes(app, { store });

  // The Code surface (creator-code-editing-execution-plan.md): owner reads and
  // owner-authored staging writes over the same games store and staging buffer the
  // agent channel uses. `invalidateStatusCache` / `scheduleStagedPreview` are the two
  // seams `registerSubmissionRoutes` exposes so an owner write busts the same cache and
  // arms the same staged-preview assembly an agent write does (CE-12).
  // N1: the kit reader and the delivery service are agent-surface's and delivery's
  // own machinery. Built here, at the composition root, and handed to the routes.
  const creatorKitFileStore = objectStore ? createKitFileStore(objectStore) : null;
  const creatorSourceDelivery = gamesStore
    ? createSourceDeliveryService({
        store,
        gamesStore,
        kitFileStore: creatorKitFileStore,
        onSourcesDelivered: gateTrigger,
        onEvent: (jobId) => submissionSeams.scheduleStagedPreview?.(jobId),
        log: app.log,
        parseSpecTitle,
        runTypecheckPreflight,
        sharedSourcesFromKitTree,
        typecheckPreflightMaxRefusals: TYPECHECK_PREFLIGHT_MAX_REFUSALS,
      })
    : null;
  await registerCreatorCodeRoutes(app, {
    store,
    gamesStore,
    objectStore,
    invalidateStatusCache: submissionSeams.invalidateStatusCache,
    scheduleStagedPreview: submissionSeams.scheduleStagedPreview ?? undefined,
    onSourcesDelivered: gateTrigger,
    githubClient: submissionSeams.githubClient ?? undefined,
    log: app.log,
    // TA-01: built unconditionally (the Vertex client is lazy); TAB_COMPLETE gates it.
    tabCompleter: options.tabCompleter ?? new VertexTabCompleter(),
    tabCompleteGate: createTabCompleteGate({ store, logWarn: (payload, msg) => app.log.warn(payload, msg) }),
    mintStatusToken: submissionTokenSecret ? (jobId) => mintToken(jobId, submissionTokenSecret) : undefined,
    ...options.creatorCodeRoutes,
    kitFileStore: options.creatorCodeRoutes?.kitFileStore ?? creatorKitFileStore,
    sourceDelivery: options.creatorCodeRoutes?.sourceDelivery ?? creatorSourceDelivery,
  });

  // The Creator Studio content editor (EditorKit): drafts in Firestore, publish
  // as a content-only candidate through the same gate trigger deliveries use.
  // The editing lanes' shared daily spend breaker. One gate instance across the
  // Studio and remix routes, so "how much did editing cost today" is one number.
  const editingGate = createEditingGate({ store, logWarn: (payload, msg) => app.log.warn(payload, msg) });

  await registerEditorRoutes(app, {
    store,
    gamesStore,
    contentChecker,
    editingGate,
    // The natural-language tuning lane. Constructed unconditionally (building one
    // touches no GCP — the Vertex client is lazy) and gated by EDITOR_ASSIST
    // inside the route, so the flag is the only switch.
    assistant: options.editorAssistant ?? new VertexEditorAssistant(),
    onSourcesDelivered: gateTrigger,
  });

  /**
   * Remix — the player-facing half of live editing. Signed-in for now (model
   * spend), ephemeral by default, with two durable exits that never publish:
   * share (param links) and save-as-yours (private Studio draft). Gated by
   * EDITOR_ASSIST / CODE_LANE for the edit lanes; save spends a creation slot.
   */
  const creationGate = createCreationGate({
    store,
    logWarn: (payload, msg) => app.log.warn(payload, msg),
  });
  await registerRemixRoutes(app, {
    store,
    gamesStore,
    // N1: community's own domain call, wired here rather than imported by creation/.
    openProposal,
    editingGate,
    creationGate,
    submissionTokenSecret,
    githubClient: submissionSeams.githubClient ?? undefined,
    publishedRef: process.env.GAMES_PUBLISHED_REF ?? 'main',
    assistant: options.editorAssistant ?? new VertexEditorAssistant(),
    codeLane: new VertexCodeLane(),
    contentChecker,
    // Same resolver MCP proposal tools and the review diff use — catalog remix propose
    // reads one game's archive at the live snapshot commit through this seam.
    resolveProposalBase: resolveBaseForProposal,
    // Same gate the delivery path uses: a proposal is checked by exactly the machinery a
    // creator's own upload is, or the reviewer would be judging something unverified.
    onSourcesDelivered: gateTrigger,
    notifyProposal: (event) =>
      emitProposalNotification({ store, logError: (err, message) => app.log.error({ err }, message) }, event),
  });

  /**
   * Proposals — the contribute-back exit. A change to a game somebody else owns,
   * carried as a candidate version the proposer cannot publish.
   *
   * `adoptIntoJob` is the accept step's only side effect on the job world: it creates a
   * job owned by the *target's* owner that already carries the gate-green version, so the
   * owner publishes it through the ordinary route. Deliberately no dispatch — the change
   * is already built, and handing it to an agent would rebuild what a human just approved.
   */
  await registerProposalRoutes(app, {
    store,
    gamesStore,
    contentChecker,
    adminUids,
    // Both lanes, so the diff and an agent's proposal round ask one question.
    // A base we cannot read is not a diff we can compute. The review card degrades to
    // "play it and read the description", which is still a decision a human can make.
    resolveBase: resolveBaseForProposal,
    notify: (event) =>
      emitProposalNotification({ store, logError: (err, message) => app.log.error({ err }, message) }, event),
    snapshotPointer: snapshotReader ? () => snapshotReader.getPointer() : undefined,
    applyToRepo: async (proposal) => {
      if (!gamesStore) return null;
      const applied = await applyProposalToRepo(
        {
          store,
          gamesStore,
          gamesRepoClient,
          gamesRepo: gamesRepoName,
          baseRef: process.env.GAMES_PUBLISHED_REF ?? 'main',
          log: app.log,
        },
        proposal,
      );
      return applied.ok ? { number: applied.pr.number, url: applied.pr.url } : null;
    },
    adoptIntoJob: async ({ proposal, ownerUid }) => {
      const source = await store.getSubmissionBySlug(proposal.targetSlug);
      const at = new Date().toISOString();
      const jobId = await store.allocateJobId();
      // Owned by whoever holds the game, never by the proposer: this job is the owner's
      // to publish, and a job on their slug owned by somebody else is a transfer.
      await store.createSubmission(
        jobId,
        ownerUid ?? source?.ownerUid ?? BOT_UID_PREFIX + 'platform',
        source?.title ?? proposal.targetSlug,
      );
      if (source?.locale) await store.setSubmissionLocale(jobId, source.locale);
      await store.setSubmissionSlug(jobId, proposal.targetSlug);
      await store.recordJobTransition(jobId, { to: 'queued', at, by: 'creator', reason: 'proposal_accepted' });
      await store.recordJobTransition(jobId, { to: 'building', at, by: 'creator', reason: 'proposal_accepted' });
      await store.setSubmissionDeliveredVersion(jobId, proposal.version!);
      await store.recordJobTransition(jobId, { to: 'submitted', at, by: 'creator', reason: 'proposal_adopted' });
      // Straight to review: the gate already ran on this exact version, and re-running it
      // would ask the same question of the same bytes.
      await store.recordJobTransition(jobId, { to: 'ready_for_review', at, by: 'gate', reason: 'gate_green' });
      return { jobId };
    },
  });

  // Publish-gated public identity. Building needs none of this; catalog bylines and
  // `/:handle` need the claimed handle. gamesStore is the same instance the
  // delivery path writes to, so a profile page never lists a game from a different bucket.
  await registerCreatorProfileRoutes(app, {
    store,
    gamesStore,
    getRepoPublishedCatalogEntry: submissionSeams.getRepoPublishedCatalogEntry,
    // N1: catalog owns the SPEC.md parse; the profile page is handed it.
    catalogEntryFromSpec,
  });

  // The game page at `/:handle/:slug` — one aggregate read per game.
  await registerGamePageRoutes(app, {
    store,
    gamesStore,
    getRepoPublishedCatalogEntry: submissionSeams.getRepoPublishedCatalogEntry,
    githubClient: submissionSeams.githubClient ?? undefined,
    publishedRef: process.env.GAMES_PUBLISHED_REF ?? 'main',
    ...options.gamePageRoutes,
  });

  // Following a game: a subscription rather than a bookmark. The count is public,
  // the follower list is not, and the only message it sends is "new version".
  await registerGameFollowRoutes(app, { store, ...options.gameFollowRoutes });
  registerAccountDeletionRoutes(app, {
    store,
    adminUids,
    internalAuthVerifier:
      options.accountDeletionRoutes?.internalAuthVerifier ??
      createInternalAuthVerifierFromEnv(process.env, 'accountDeletionSweep'),
    now: options.accountDeletionRoutes?.now,
    graceMs: options.accountDeletionRoutes?.graceMs,
  });
  // An alert can pause a lane itself.
  await registerSpendBrakeRoutes(app, {
    store,
    internalAuthVerifier:
      options.spendBrakeRoutes?.internalAuthVerifier ?? createInternalAuthVerifierFromEnv(process.env, 'spendBrake'),
  });

  /**
   * `appleSignIn` tells the web app whether this server can actually verify an Apple
   * token. The button also needs a Services ID baked in at build time, so it renders only
   * when both halves agree — otherwise a web build carrying the ID would show a working
   * button in front of a server that answers 503, and the failure would land on the user
   * instead of on whoever forgot the env var.
   */
  app.get('/api/health', async () => ({
    status: 'ok',
    // Retained for shape stability after the mock generator was retired.
    provider: 'mock',
    privateBeta,
    appleSignIn: Boolean(options.appleAuthVerifier) || parseAppleClientIds(process.env.APPLE_CLIENT_IDS).length > 0,
    publicPlaySlugs: [...(await getPublicPlaySlugs())],
  }));

  app.get('/api/version', async () => ({ name: 'gamedev-pl', version: '0.0.0' }));
  // RFC 9728 protected-resource metadata for the MCP endpoint (BY-18a). Public,
  // cacheable, no auth — advertises where an authorization server will live.
  registerOAuthProtectedResourceRoutes(app);

  // Registry-shaped server.json for remote discovery (BY-18c). Public, cacheable;
  // auth facts stay in the PRM document above — this only links to it.
  registerMcpServerDiscoveryRoutes(app);
  // Domain proof for the ChatGPT/Codex plugin submission. 404s until the portal issues a
  // token and it is configured — see openai-apps-challenge.ts.
  registerOpenAiAppsChallengeRoute(app);

  const oauthSessionSecret = options.sessionSecret ?? process.env.SESSION_SECRET ?? 'dev-session-secret-change-me';
  const oauthSessionSecretPrev = options.sessionSecretPrev ?? process.env.SESSION_SECRET_PREV;
  registerOAuthAuthorizationServerRoutes(app, {
    store,
    sessionSecret: oauthSessionSecret,
    sessionSecretPrev: oauthSessionSecretPrev,
    now: options.submissionRoutes?.now,
  });
  // Browser sign-in for accounts that hold a personal access token instead of a Google
  // or Apple identity. Registered right after the AS because the only reason it exists
  // is to get such an account to the consent screen above.
  registerTokenLoginRoutes(app, { store, sessionSecret: oauthSessionSecret });

  // Creator-wide MCP opener (BY-27a). Needs the same HMAC secret as per-game keys.
  if (submissionTokenSecret) {
    registerCreatorAgentKeyRoutes(app, {
      store,
      submissionTokenSecret,
      now: options.submissionRoutes?.now,
    });
  }

  // Apex → www canonical-host redirect. Cloud Run domain mappings can't emit a
  // 301, and both www.gamedev.pl and gamedev.pl terminate at this same service,
  // so we canonicalize here. When CANONICAL_HOST=www.gamedev.pl, a request whose
  // Host header is the bare apex (gamedev.pl) 301s to https://www.gamedev.pl +
  // same path. Only the exact apex is redirected — the run.app URL, localhost,
  // and the canonical host itself are untouched, so health probes, smoke tests,
  // and dev keep working. Unset (dev/tests) → no-op.
  const canonicalHost = process.env.CANONICAL_HOST?.trim();
  const apexHost = canonicalHost?.startsWith('www.') ? canonicalHost.slice(4) : undefined;
  if (canonicalHost && apexHost) {
    app.addHook('onRequest', async (request, reply) => {
      if (request.headers.host === apexHost) {
        return reply.redirect(`https://${canonicalHost}${request.url}`, 301);
      }
    });
  }

  // In private-beta mode all API data reads require a session so the app is usable only
  // after sign-in. IMPORTANT: the wall must gate only /api/* paths — the static SPA shell
  // must load freely so the visitor can reach the sign-in button (chicken-and-egg otherwise).
  // /api/health, /api/auth/*, and /api/waitlist stay public within the API (probes, login
  // flow, and the waitlist — which by definition serves people who just failed sign-in).
  app.addHook('preHandler', async (request, reply) => {
    if (!privateBeta) return;
    // No entry here for the OAuth protected-resource document: it is served outside
    // `/api/`, so the next line already passes it through. An exemption that never fires
    // would imply this wall covers that route, and a bypass list has to be read as exact.
    if (!request.url.startsWith('/api/')) return; // static shell always passes through
    if (request.url === '/api/health' || request.url.startsWith('/api/auth')) return;
    if (request.url.startsWith('/api/waitlist')) return;
    // The unsubscribe link carries a signed token and is clicked from a mail client
    // that has no session — it must reach its handler through the wall.
    if (request.url.startsWith('/api/email/unsubscribe')) return;
    // Contact form: same reason as legal pages being reachable without a session.
    // The handler itself is IP-rate-limited and moderated; the wall must not 401 it.
    if (request.url.startsWith('/api/contact')) return;
    // Public creator profiles — same posture as contact/legal. Availability checks
    // stay authed (they are under /api/creators/:handle/availability and need a session).
    if (/^\/api\/creators\/[^/]+\/?(\?|$)/.test(request.url)) return;
    // Preview media and follow counts remain public; game pages stay behind beta access.
    if (/^\/api\/games\/[^/]+\/(follow|media)(\/[^?]*)?(\?|$)/.test(request.url)) return;
    // Internal endpoints (the Cloud Scheduler notification sweep) authenticate via
    // an OIDC token in the handler, not a session — the wall would 401 them first.
    if (request.url.startsWith('/api/internal/')) return;
    // The build channel: the coding agent runs inside GitHub's sandbox and has no
    // session and never will. It authenticates with a per-build token verified in
    // the handler, scoped to talking about the one build it was handed.
    if (request.url.startsWith('/api/agent/')) return;
    // Remote MCP (BY-05): same posture as the build channel — URL-only install,
    // no site session. Auth is the round key / sessionKey verified per tool call.
    if (request.url === '/api/mcp' || request.url.startsWith('/api/mcp?')) return;
    // The controller websocket is the one door anonymous guests may reach: a phone
    // that scanned a QR has no session and never will. It is useless without a
    // room token (verified in the first frame, not here), and the room it opens
    // was created by an allowlisted host. Everything else stays walled.
    if (request.url.startsWith('/api/mp/ws')) return;
    // Visit telemetry measures the arrival itself, which for most visitors during
    // closed beta happens *before* sign-in — walling it would silently zero out the
    // one funnel this stream exists to capture. It never reads request.user and
    // records no identifying data, so admitting it from the open internet is free.
    if (request.url.startsWith('/api/telemetry/visit')) return;
    if (isPublicPlayRequest(request, await getPublicPlaySlugs())) return;
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }
  });

  // In production (single Cloud Run service) the API also serves the built web app from the
  // same origin, so the browser makes only same-origin requests and no CORS is involved.
  // WEB_DIST_DIR points at apps/web/dist; unset in local dev, where Vite serves the app.
  const webDistDir = process.env.WEB_DIST_DIR?.trim();
  if (webDistDir && existsSync(webDistDir)) {
    await app.register(fastifyStatic, {
      root: webDistDir,
      wildcard: false,
      // Serve build-time .br/.gz siblings (apps/web/scripts/precompress.mjs) —
      // never compress per-request: Cloud Run bills CPU.
      preCompressed: true,
      setHeaders: (reply, filePath) => {
        // Vite content-hashes everything under /assets/, so those URLs are
        // immutable; index.html is the rollout pivot and must revalidate.
        // Long-lived caching here is also what lets the CDN in front of the
        // service (docs/closed-beta-launch-plan.md) actually cache anything.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          reply.header('cache-control', 'public, max-age=31536000, immutable');
        } else {
          reply.header('cache-control', 'no-cache');
        }
      },
    });
    // SPA shell: known deep links (`/play/<slug>`, …) keep HTTP 200 so refresh
    // works; everything else gets a *proper* HTTP 404 with the same `index.html`
    // so crawlers/tools see a real miss while the client can still render NotFound.
    // Missing extension-bearing files stay hard 404s (never the HTML shell).
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== 'GET' || request.url.startsWith('/api')) {
        return reply.status(404).send({ error: 'not found' });
      }
      if (looksLikeStaticAsset(request.url)) {
        return reply.status(404).send({ error: 'not found' });
      }
      const status = isKnownSpaShellPath(request.url) ? 200 : 404;
      return reply.status(status).type('text/html').sendFile('index.html');
    });
  }

  return app;
}
