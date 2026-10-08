import { createPerformanceTools } from './mcp-performance-tools.js';
import type { ReadGamePerformance } from '@gamedevpl/contract';
import { livePresencePulseJob, resolvePresenceClaims, touchStartedRoundPresence } from './mcp-presence-capability.js';
import { memberCapabilityCurrent } from '../platform/game-access-permissions.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AGENT_CHANNEL_ROUTES, deriveGateStatusString, type BuilderKind } from '@gamedevpl/contract';
import {
  toolOk,
  toolErr,
  toolRefusal,
  toolErrForReason,
  withErrorBranch,
  MCP_VISIBLE_TOOLS,
  channelControlFields,
  pendingMessagesFromChannel,
  CREATOR_TEXT_SAFETY,
  PLATFORM_CONNECTOR_ONLY_REASON,
  RETIRED_GAME_KEY_REASON,
  matchesPlatformConnectorSecret,
  type ChannelControlBody,
  type ToolResult,
  type ToolHandler,
  type ToolContext,
} from './mcp-tool-support.js';
import { createExampleTools } from './mcp-example-tools.js';
import { createKitTools } from './mcp-kit-tools.js';
import { createKitFileTools } from './mcp-kit-file-tools.js';
import { createInboxTools } from './mcp-inbox-tools.js';
import { createProposalRoundTools } from './mcp-proposal-round-tools.js';
import { createSeedTools } from './mcp-seed-tools.js';
import { createRoundCardTools } from './mcp-round-card-tools.js';
import { createShareDraftTools } from './mcp-share-draft-tools.js';
import { createGateMediaTools } from './mcp-gate-media-tools.js';
import { createConceptTools } from './mcp-concept-tools.js';
import { createProposalTools, type ProposalDomain } from './mcp-proposal-tools.js';
import { createSourceStageTools } from './mcp-source-stage-tools.js';
import { createSourceReadTools } from './mcp-source-read-tools.js';
import { createSourcePatchTools } from './mcp-source-patch-tools.js';
import { createSourceSubmitTools } from './mcp-source-submit-tools.js';
import { createGameCreateTools } from './mcp-game-create-tools.js';
import { createAccountGamesTools, type LoadOwnerGamesFn } from './mcp-account-games-tools.js';
import { createOwnershipTools } from './mcp-ownership-tools.js';
import { createRoundReopenTools } from './mcp-round-reopen-tools.js';
import { createSessionBasicsTools } from './mcp-session-basics-tools.js';
import {
  INBOX_POLICY,
  KIT_OUTDATED_MARK,
  MCP_GUIDE_VERSION,
  MCP_INSTRUCTIONS,
  nextSuggestedTool,
  RETIRED_KEY_ETIQUETTE,
  ROUND_SEQUENCE,
  ROUND_SEQUENCE_TEXT,
} from './mcp-round-guide.js';

export { MCP_VISIBLE_TOOLS };
import { looksLikeCreatorAgentKey } from './agent-creator-key.js';
import { resolveCreatorAgentKeyForStart } from './agent-creator-key-resolve.js';
import {
  looksLikeGameAgentKey,
  NO_OPEN_ROUND_REASON,
  PLATFORM_ROUND_REASON,
  SESSION_KEY_IS_NOT_AN_OPENER_REASON,
  SLUG_NOT_ON_ACCOUNT_REASON,
  PUBLISH_BLOCKED_REASON,
} from './agent-game-key.js';
import { findActiveRoundForSlug } from './agent-game-key-resolve.js';
import { canActOnSlug, writerUidForSlug } from '../platform/game-access-permissions.js';
import {
  JOINING_ROUND_PRESENCE,
  mcpPresenceKey,
  noteMcpPresencePulse,
  presencePreservesEnded,
  shouldEmitMcpPresencePulse,
  shouldPulseMcpPresence,
  type McpPresencePulse,
} from './mcp-presence.js';
import { resolveGameAccess, roundAuthorityCurrent } from '../platform/game-access-resolve.js';
import {
  classifyAgentTokenAccess,
  InvalidAgentTokenError,
  mintAgentToken,
  readBearerToken,
  STALE_AGENT_TOKEN_REASON,
  verifyAgentToken,
  verifyManagedMcpOpener,
  type AgentTokenAccess,
  type AgentTokenClaims,
} from '../platform/agent-token.js';
import { selfBuildDeliveryCap } from '../platform/self-build-delivery-cap.js';
import type { ManagedUnavailableReason } from './managed-availability.js';
import type { GamesStore } from '../delivery/games-store.js';
import { readGateVerdict } from './gate-verdict.js';
import type { GcsObjectStore } from '../delivery/gcs-sign.js';
import {
  assertMcpSessionKeyUnexpired,
  looksLikeMcpSessionId,
  looksLikeMcpSessionKey,
  mintMcpSessionKey,
  newMcpSessionId,
  verifyMcpSessionKey,
} from './mcp-session-key.js';
import {
  mcpSessionStartedFields,
  mcpToolRefusalFields,
  peekMcpSessionKeyForLog,
  toolErrorReason,
  toolErrorCode,
} from './mcp-debug-log.js';
import { mcpMissingCredentialHint, sendMcpOAuthChallenge, shouldIssueMcpOAuthChallenge } from './mcp-oauth-metadata.js';
import {
  MCP_UI_APP_ONLY_TOOLS,
  MCP_UI_TOOL_RESOURCES,
  clientDeclaresUi,
  markSessionIdUiCapable,
  mcpUiEnabled,
  mcpUiServerCapability,
  readUiResource,
  sessionIdIsUiCapable,
  uiResourceDescriptors,
} from './mcp-ui.js';
import {
  INBOX_PIGGYBACK_TOOLS,
  createMcpNudgeTracker,
  unreadFromPayload,
  type NudgeWarning,
} from './mcp-session-nudges.js';
import { looksLikeAsAccessToken, verifyMcpAsAccessToken as verifyAsAccessToken } from '../platform/oauth-scopes.js';
import type { SourceFile } from '../delivery/games-store.js';
import type { ProposalBase } from '../platform/store.js';
import { seedPayload } from './seed-status.js';
import { MCP_ENDPOINT_PATH } from './self-build-connect.js';
import { dispatchAttempt, type Store, type SubmissionRecord } from '../platform/store.js';
import type { ContentChecker } from '../platform/moderation.js';

// Round tools require session capabilities; account reads verify account credentials.

const PROTOCOL_VERSION = '2025-11-25';
const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2025-11-25', '2025-03-26', '2024-11-05']);
const FINISHED_REASON = STALE_AGENT_TOKEN_REASON;

const SESSION_HEADER = 'mcp-session-id';

export const MCP_UNADVERTISED_TOOLS: readonly string[] = Object.freeze([
  'open_proposal_round',
  'submit_proposal',
  'get_proposal_status',
  'list_examples',
  'get_example',
  'list_example_files',
  'read_example_file',
]);

/** Aggressive ceiling on unauthenticated / invalid `start` attempts per IP. */
const MAX_INVALID_STARTS_PER_WINDOW = 20;
const INVALID_START_WINDOW_MS = 60 * 60 * 1000;

/** Hard body ceiling for MCP POSTs (JSON-RPC framing; screenshots use signed PUT). */
const MAX_MCP_BODY_BYTES = 2 * 1024 * 1024;

const TRANSPORT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TRANSPORT_SESSIONS = 10_000;

export interface McpServerOptions {
  store?: Store;
  agentTokenSecret?: string;
  platformConnectorSecret?: string;
  now?: () => number;
  /**
   * Closed beta, so the endpoint can say so. The beta wall itself sits on sign-in, not
   * here — `/api/mcp` stays reachable through it deliberately — but a visitor who cannot
   * sign in still deserves to be told that, rather than being sent to hunt for a key that
   * cannot exist for them. Copy only; this gates no access.
   */
  privateBeta?: boolean;
  /**
   * MCP Apps (SEP-1865) views — off unless `MCP_UI` says otherwise. Phase 0 spike:
   * clients that do not declare the extension see today's contract unchanged either way.
   */
  uiEnabled?: boolean;
  gamesStore?: GamesStore;
  /**
   * A game's published sources plus the base to pin a proposal to. Injected so this
   * module needs no games-repo or snapshot dependency of its own; absent means proposal
   * rounds answer "not configured" rather than half-working.
   */
  resolveProposalBase?: (slug: string) => Promise<{ base: ProposalBase; files: SourceFile[] } | null>;
  /** Starts the gate on a delivered candidate — shared with the delivery path. */
  onSourcesDelivered?: (input: {
    jobId: number;
    slug: string;
    version: string;
    mode?: 'health' | 'preview' | 'proposal';
  }) => unknown;
  objectStore?: GcsObjectStore;
  /**
   * Origins allowed when the client sends an `Origin` header (DNS-rebinding
   * mitigation). Absent Origin is allowed — coding agents are not browsers.
   */
  allowedOrigins?: string[];
  // Green-gate share rule, injected so Studio and share_draft agree.
  refuseShare?: (record: SubmissionRecord) => Promise<{ error: string; message: string } | null>;
  startImprovementRound?: (input: {
    jobId: number;
    text: string;
    title: string;
    locale: string;
    log: { error: (context: object, message: string) => void };
    builder?: BuilderKind;
    openedBy?: 'creator' | 'agent';
    /** Opens the new job's thread with `text`, attributed to whoever wrote it. */
    requestedBy?: 'creator' | 'agent';
    /** When set, the new job is owned by this uid (slug-transfer safe). */
    ownerUid?: string;
  }) => Promise<{ route: 'job'; jobId: number } | { route: 'unavailable'; reason: ManagedUnavailableReason } | null>;
  /**
   * Reopens an unpublished draft after a closed round (gate-green ready_for_review, etc.).
   * Injected from submissions so MCP and Studio feedback share the same resume path.
   */
  continueDraftRound?: (input: {
    jobId: number;
    feedback: string;
    locale: string;
    log: { error: (context: object, message: string) => void };
    openedBy?: 'creator' | 'agent';
    ownerUid?: string;
  }) => Promise<{ ok: true; jobId: number; alreadyOpen: boolean } | { ok: false; reason: string }>;
  /**
   * Creates a game, running the identical sequence Studio's POST /api/submissions runs.
   * Injected rather than reimplemented so the two surfaces cannot drift on beta gating,
   * moderation, the creation circuit-breaker or quota.
   */
  createGame?: (input: {
    uid: string;
    ip: string;
    payload: unknown;
    acceptLanguage?: string;
    openedBy?: 'creator' | 'agent';
    log: { error: (context: object, message: string) => void; info?: (context: object, message: string) => void };
  }) => Promise<
    { ok: true; jobId: number; slug: string } | { ok: false; status: number; error: string; category?: string }
  >;
  contentChecker?: ContentChecker;
  dailyImprovementQuota?: number;
  dailyFeedbackQuota?: number;
  loadOwnerGames?: LoadOwnerGamesFn;
  readGamePerformance?: ReadGamePerformance;
  // N1: community's proposal state machine, wired at the composition root.
  proposals: ProposalDomain;
  // N1: delivery's deliverable-path vocabulary, applied without importing it.
  assertDeliverableSourcePath: (path: string) => string;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

interface AuthedJob {
  jobId: number;
  record: SubmissionRecord;
  access: AgentTokenAccess;
  identity: 'creator' | 'oauth' | 'round' | 'platform_connector';
  /** Round-scoped agent token for channel inject (same generation as the capability). */
  channelToken: string;
  claims: Pick<AgentTokenClaims, 'jobId' | 'roundGeneration' | 'exp'>;
  /** Session writer; job.ownerUid is historical authorship. */
  actorUid: string;
  actorRevision?: number;
}

function jsonRpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: '2.0' as const, id: id ?? null, result };
}

function jsonRpcError(id: string | number | null | undefined, code: number, message: string, data?: unknown) {
  return {
    jsonrpc: '2.0' as const,
    id: id ?? null,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}

function pruneHits(buckets: Map<string, number[]>, key: string, currentTime: number): number[] {
  const hits = (buckets.get(key) ?? []).filter((timestamp) => currentTime - timestamp < INVALID_START_WINDOW_MS);
  buckets.set(key, hits);
  return hits;
}

function isOverInvalidStartLimit(buckets: Map<string, number[]>, key: string, currentTime: number): boolean {
  return pruneHits(buckets, key, currentTime).length >= MAX_INVALID_STARTS_PER_WINDOW;
}

// The oldest hit in the window is the one that frees the next attempt.
function invalidStartRetryAfterSeconds(buckets: Map<string, number[]>, key: string, currentTime: number): number {
  const hits = pruneHits(buckets, key, currentTime);
  if (!hits.length) return 0;
  const oldest = Math.min(...hits);
  return Math.max(1, Math.ceil((INVALID_START_WINDOW_MS - (currentTime - oldest)) / 1000));
}

function noteInvalidStartHit(buckets: Map<string, number[]>, key: string, currentTime: number): void {
  const hits = pruneHits(buckets, key, currentTime);
  hits.push(currentTime);
  buckets.set(key, hits);
}

function headerValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0].trim();
  return null;
}

/** Gate statuses that mean "fix and deliver again" — not a finished round. */
function gateNeedsResubmit(status: unknown): boolean {
  return status === 'preview_failed' || status === 'red' || status === 'kit_outdated';
}

// Gives `start` the same reconnect-visibility show_round/get_gate_verdict already had.
async function gateFieldForStart(
  gamesStore: GamesStore | undefined,
  record: Pick<SubmissionRecord, 'slug' | 'previewVersion' | 'deliveredVersion'>,
): Promise<{ gate: { status: string; deliveryId: string } } | Record<string, never>> {
  const gate = await readGateVerdict(gamesStore, record).catch(() => null);
  if (!gate) return {};
  const status = deriveGateStatusString(gate);
  if (!gateNeedsResubmit(status)) return {};
  return { gate: { status, deliveryId: gate.version } };
}

// Discovering at submit_sources that you may preview but not seal spends a
// delivery on the answer. start says it while the plan is still being made.
async function publishRightForStart(
  store: Store | undefined,
  slug: string | null | undefined,
  actorUid: string | undefined,
): Promise<{ canPublish: boolean; publishBlockedReason?: string }> {
  // An unslugged round has nothing to publish yet, so no right to report on.
  if (!store || !slug || !actorUid) return { canPublish: true };
  const allowed = await canActOnSlug(store, slug, actorUid, 'publish').catch(() => true);
  if (allowed) return { canPublish: true };
  return { canPublish: false, publishBlockedReason: PUBLISH_BLOCKED_REASON };
}

function mustFixGateWarningForStatus(status: string, deliveryId?: string | null): NudgeWarning {
  const delivery = deliveryId ? ` (${deliveryId})` : '';
  if (status === 'kit_outdated') {
    return {
      code: 'must_fix_gate',
      message:
        `The gate refused the last delivery${delivery} because ${KIT_OUTDATED_MARK}. A fresh engineRef from get_kit plus ` +
        'submit_sources({ fromLatestDelivery: true, mode, kitEngineRef }) re-runs it; staging alone does not.',
    };
  }
  if (status === 'preview_failed') {
    return {
      code: 'must_fix_gate',
      message:
        `The preview check (typecheck, smoke, build) refused the last delivery${delivery}. It re-runs on the next ` +
        'submit_sources({ fromStaged: true, mode: "preview", kitEngineRef }) with this key; staging alone does ' +
        'not re-run the gate or refresh the creator card.',
    };
  }
  return {
    code: 'must_fix_gate',
    message:
      `The publish gate refused the last delivery${delivery}; the gate report says why. It re-runs on the next ` +
      'submit_sources({ fromStaged: true, mode: "publish", kitEngineRef }) with this key; staging alone does not.',
  };
}

// Shared `start` success shape — a trailing block repeats sessionKey for last-item-only MCP clients.
function startToolResult(structured: { sessionKey: string } & Record<string, unknown>): ToolResult {
  const base = toolOk(structured);
  return {
    ...base,
    content: [
      ...base.content,
      { type: 'text', text: ROUND_SEQUENCE_TEXT },
      { type: 'text', text: `sessionKey: ${structured.sessionKey}` },
    ],
  };
}

export async function registerMcpServerRoutes(app: FastifyInstance, options: McpServerOptions): Promise<void> {
  const store = options.store;
  const agentTokenSecret = options.agentTokenSecret ?? process.env.SUBMISSION_TOKEN_SECRET;
  const platformConnectorSecret = options.platformConnectorSecret;
  const now = options.now ?? Date.now;
  const allowedOrigins = options.allowedOrigins ?? parseAllowedOrigins();
  const assertDeliverableSourcePath = options.assertDeliverableSourcePath;
  const startImprovementRound = options.startImprovementRound;
  const continueDraftRound = options.continueDraftRound;
  const createGame = options.createGame;
  const contentChecker = options.contentChecker;
  const gamesStoreForProposals = options.gamesStore;
  const resolveProposalBaseFor = options.resolveProposalBase;
  const dispatchProposalGate = options.onSourcesDelivered;
  const dailyImprovementQuota = options.dailyImprovementQuota ?? Number(process.env.DAILY_IMPROVEMENT_QUOTA ?? '2');
  const dailyFeedbackQuota = options.dailyFeedbackQuota ?? 20;
  const privateBeta = options.privateBeta ?? (process.env.PRIVATE_BETA ?? '').toLowerCase() === 'true';
  const missingCredentialHint = mcpMissingCredentialHint(privateBeta);
  const uiEnabled = options.uiEnabled ?? mcpUiEnabled();

  /** Transport sessions only — never consulted for authorization. */
  const transportSessions = new Map<string, { createdAt: number }>();
  /**
   * Correlators explicitly terminated via DELETE on this instance. Prevents the
   * multi-instance adopt path from resurrecting a session the client just closed.
   * Best-effort across instances (in-memory); same TTL as live correlators.
   */
  const terminatedTransportSessions = new Map<string, number>();
  const invalidStartsByIp = new Map<string, number[]>();
  /** Last synthetic Studio presence pulse per job — coarse MCP activity, not 1:1 tools. */
  const presencePulseByJob = new Map<number, McpPresencePulse>();
  const nudgeTracker = createMcpNudgeTracker();
  // Jobs that read get_kit since their last delivery.
  const refreshedKits = new Set<number>();
  // Note ids each job's read_inbox already returned.
  const readNoteIds = new Map<number, Set<string>>();

  function pruneTransportSessions(currentTime: number): void {
    for (const [id, meta] of transportSessions) {
      if (currentTime - meta.createdAt > TRANSPORT_SESSION_TTL_MS) {
        transportSessions.delete(id);
      }
    }
    for (const [id, terminatedAt] of terminatedTransportSessions) {
      if (currentTime - terminatedAt > TRANSPORT_SESSION_TTL_MS) {
        terminatedTransportSessions.delete(id);
      }
    }
    if (transportSessions.size <= MAX_TRANSPORT_SESSIONS) return;
    const oldest = [...transportSessions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    const overflow = transportSessions.size - MAX_TRANSPORT_SESSIONS;
    for (let i = 0; i < overflow; i += 1) {
      transportSessions.delete(oldest[i]![0]);
    }
  }

  /** Record/refresh a transport correlator. */
  function noteTransportSession(sessionId: string): void {
    transportSessions.set(sessionId, { createdAt: now() });
  }

  /**
   * Emit view metadata only for a flag-enabled server and a client that negotiated it.
   * The answer is read out of the correlator's signed marker, so every instance agrees
   * — including one that never saw the `initialize` that minted it.
   */
  function sessionWantsUi(sessionId: string | null): boolean {
    return uiEnabled && sessionIdIsUiCapable(sessionId, agentTokenSecret);
  }

  function pruneInvalidStartBuckets(currentTime: number): void {
    for (const [ip, hits] of invalidStartsByIp) {
      const kept = hits.filter((timestamp) => currentTime - timestamp < INVALID_START_WINDOW_MS);
      if (kept.length === 0) invalidStartsByIp.delete(ip);
      else invalidStartsByIp.set(ip, kept);
    }
  }

  function originAllowed(request: FastifyRequest): boolean {
    const origin = headerValue(request.headers.origin);
    if (!origin) return true;
    if (allowedOrigins.length === 0) return true;
    return allowedOrigins.includes(origin);
  }

  async function injectChannel(
    request: FastifyRequest,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    channelToken: string,
    body?: Record<string, unknown> | unknown[],
  ): Promise<{ statusCode: number; json: () => unknown }> {
    // Propagate the outer caller IP so channel rate limiters do not collapse every
    // MCP client onto 127.0.0.1 (light-my-request's default).
    const response = await app.inject({
      method,
      url: path,
      remoteAddress: request.clientIp,
      headers: {
        authorization: `Bearer ${channelToken}`,
        'content-type': 'application/json',
      },
      ...(body !== undefined ? { payload: body } : {}),
    });
    return response;
  }

  async function resolveAuth(
    ctx: ToolContext,
    args: Record<string, unknown>,
    options: { allowTerminalReceipt?: boolean } = {},
  ): Promise<AuthedJob | ToolResult> {
    if (!store || !agentTokenSecret) {
      return toolErr('the MCP build endpoint is not configured');
    }

    const sessionKeyArg = typeof args.sessionKey === 'string' ? args.sessionKey.trim() : '';
    const bearer = ctx.bearerToken;

    let claims: AgentTokenClaims;
    let channelToken: string;

    // Paste-once MCP config leaves Authorization: Bearer <opener or OAuth access> on
    // every request (ChatGPT Apps, Claude connectors, Studio "connect" snippets).
    // Those credentials never authorize writes — prefer sessionKey when present.
    // A round-scoped Bearer is different: it is itself a write credential, and must
    // keep working even if the client also echoes a stale sessionKey from an earlier
    // transport session (reconnect with retained tool args).
    const bearerIsOpener = Boolean(bearer) && looksLikeCreatorAgentKey(bearer!);
    const bearerIsRetiredGameKey = Boolean(bearer) && looksLikeGameAgentKey(bearer!);
    const bearerIsOAuth = Boolean(bearer) && looksLikeAsAccessToken(bearer!);
    let bearerIsManagedOpener = false;
    if (bearer && !bearerIsOpener && !bearerIsRetiredGameKey && !bearerIsOAuth) {
      try {
        verifyManagedMcpOpener(bearer, agentTokenSecret);
        bearerIsManagedOpener = true;
      } catch (error) {
        if (!(error instanceof InvalidAgentTokenError)) throw error;
      }
    }
    const bearerIsPlatformConnector = matchesPlatformConnectorSecret(bearer, platformConnectorSecret);
    const preferSessionKey =
      Boolean(sessionKeyArg) &&
      (!bearer ||
        bearerIsOAuth ||
        bearerIsOpener ||
        bearerIsRetiredGameKey ||
        bearerIsPlatformConnector ||
        bearerIsManagedOpener);
    let identity!: AuthedJob['identity'];
    let sessionActorUid: string | undefined;

    if (preferSessionKey) {
      if (looksLikeGameAgentKey(sessionKeyArg)) {
        return toolErr(RETIRED_GAME_KEY_REASON);
      }
      if (looksLikeCreatorAgentKey(sessionKeyArg)) {
        return toolErr(
          'this creator key only opens a session via start() — pass the sessionKey start returned for later tools',
        );
      }
      let sessionClaims;
      try {
        sessionClaims = verifyMcpSessionKey(sessionKeyArg, agentTokenSecret);
        assertMcpSessionKeyUnexpired(sessionClaims, now());
      } catch (error) {
        if (error instanceof InvalidAgentTokenError) {
          // Expired keys carry STALE_AGENT_TOKEN_REASON (correct: round is done).
          // Forge/malformed throws InvalidAgentTokenError with the generic default —
          // do not rewrite that as "finished" or agents will chase the wrong fix.
          return toolErr(
            error.message === STALE_AGENT_TOKEN_REASON
              ? STALE_AGENT_TOKEN_REASON
              : 'invalid sessionKey — call start() again',
          );
        }
        throw error;
      }
      // Mcp-Session-Id is a correlator, not a capability. The sessionId is already
      // inside the signed sessionKey, so requiring the header to match added no theft
      // resistance and broke ChatGPT Apps on multi-instance Cloud Run (initialize on A,
      // start on B remints, client keeps sending A's id). Log drift; do not refuse.
      if (ctx.sessionId && ctx.sessionId !== sessionClaims.sessionId) {
        ctx.request.log.info(
          {
            event: 'mcp_session_id_drift',
            presented: ctx.sessionId.slice(0, 16),
            bound: sessionClaims.sessionId.slice(0, 16),
            jobId: sessionClaims.jobId,
          },
          'mcp sessionKey accepted despite Mcp-Session-Id drift',
        );
      }
      claims = {
        jobId: sessionClaims.jobId,
        roundGeneration: sessionClaims.roundGeneration,
        exp: sessionClaims.exp,
        actorUid: sessionClaims.actorUid,
        actorRevision: sessionClaims.actorRevision,
      };
      identity = bearerIsPlatformConnector ? 'platform_connector' : 'round';
      sessionActorUid = sessionClaims.actorUid;
      channelToken = '';
    } else if (bearerIsOAuth) {
      return toolErr(
        'OAuth access proves your identity only — call start() with your game slug (Authorization: Bearer <oauth access>) to get a session key',
      );
    } else if (bearerIsRetiredGameKey) {
      return toolErr(RETIRED_GAME_KEY_REASON);
    } else if (bearerIsOpener) {
      return toolErr(
        'this creator key only opens a session via start() — pass the sessionKey start returned for later tools',
      );
    } else if (bearerIsManagedOpener) {
      return toolErr(
        'this session opener only opens a session via start() — pass the sessionKey start returned for later tools',
      );
    } else if (bearerIsPlatformConnector) {
      return toolErr(PLATFORM_CONNECTOR_ONLY_REASON);
    } else if (bearer) {
      try {
        claims = verifyAgentToken(bearer, agentTokenSecret);
      } catch (error) {
        if (error instanceof InvalidAgentTokenError) {
          return toolErr(error.message || 'invalid build key');
        }
        throw error;
      }
      channelToken = bearer;
      identity = 'round';
    } else {
      // Possession of Mcp-Session-Id alone authorizes nothing.
      return toolErr(missingCredentialHint);
    }

    const record = await store.getSubmission(claims.jobId);
    if (!record) {
      return toolErr('unknown build');
    }
    // Fences a round whose game changed hands, however many rounds it has.
    if (record.slug && !roundAuthorityCurrent(record, await resolveGameAccess(store, record.slug), claims)) {
      return toolErr(FINISHED_REASON);
    }

    let access: AgentTokenAccess;
    try {
      access = classifyAgentTokenAccess(claims, record, now());
    } catch (error) {
      if (error instanceof InvalidAgentTokenError) {
        return toolErr(error.message || FINISHED_REASON);
      }
      throw error;
    }

    if (access === 'terminal_receipt' && !options.allowTerminalReceipt) {
      return toolErr(FINISHED_REASON);
    }

    const actorUid = sessionActorUid ?? claims.actorUid ?? record.ownerUid;
    if (record.slug && !(await canActOnSlug(store, record.slug, actorUid, 'build'))) {
      return toolErr('this session can no longer write this game');
    }
    if (
      record.slug &&
      !memberCapabilityCurrent(
        await resolveGameAccess(store, record.slug),
        actorUid,
        claims.actorRevision ?? (sessionActorUid ? undefined : record.accessEpoch),
      )
    ) {
      return toolErr('this session can no longer write this game');
    }
    if (!channelToken) {
      channelToken = mintAgentToken(claims.jobId, agentTokenSecret, {
        roundGeneration: claims.roundGeneration ?? record.roundGeneration ?? 1,
        now: now(),
        ttlDays: 1,
        actorUid,
        actorRevision: claims.actorRevision,
      });
    }

    return {
      jobId: claims.jobId,
      record,
      access,
      identity,
      channelToken,
      actorUid,
      actorRevision: claims.actorRevision,
      claims: {
        jobId: claims.jobId,
        roundGeneration: claims.roundGeneration,
        exp: claims.exp,
      },
    };
  }

  async function writePiggyback(
    request: FastifyRequest,
    channelToken: string,
  ): Promise<{
    stop: boolean;
    reason?: string;
    pendingMessages: unknown[];
    warnings?: Array<{ code: string; message: string }>;
  }> {
    const inbox = await injectChannel(request, 'GET', AGENT_CHANNEL_ROUTES.INBOX, channelToken);
    if (inbox.statusCode !== 200) {
      return { stop: false, pendingMessages: [] };
    }
    const body = inbox.json() as ChannelControlBody & {
      pending?: Array<{ id: string; text: string; createdAt: string }>;
    };
    return {
      ...channelControlFields(body),
      pendingMessages: pendingMessagesFromChannel(body),
    };
  }

  function resolveNudgeJobId(
    args: Record<string, unknown>,
    ctx: ToolContext,
    payload: Record<string, unknown>,
  ): number | null {
    if (typeof payload.jobId === 'number' && Number.isFinite(payload.jobId)) {
      return payload.jobId;
    }
    const sessionKeyArg = typeof args.sessionKey === 'string' ? args.sessionKey.trim() : '';
    const peeked = peekMcpSessionKeyForLog(sessionKeyArg, agentTokenSecret);
    if (peeked) return peeked.jobId;
    if (ctx.bearerToken && agentTokenSecret) {
      try {
        return verifyAgentToken(ctx.bearerToken, agentTokenSecret).jobId;
      } catch {
        // Not a round token — ignore.
      }
    }
    return null;
  }

  /** Kit browse tools that should refresh seedStatus from the store when the payload omits it. */
  const SEED_STATUS_LOOKUP_TOOLS = new Set([
    'get_kit',
    'list_kit_files',
    'search_kit_files',
    'read_kit_file',
    'read_kit_files',
    'read_kit_file_fragment',
    'knowledge_query',
  ]);

  /**
   * Merge soft warnings (and inbox piggyback on hot reads) into a successful tool result.
   * Never flips isError — ChatGPT already mishandles hard errors in the transcript.
   */
  async function applySessionNudges(
    toolName: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
    result: ToolResult,
  ): Promise<ToolResult> {
    if (result.isError) return result;
    // Soft warnings steer the agent. A view polling status is not the agent: counting
    // its calls would manufacture progress_stale, and it would never read the warning.
    if (MCP_UI_APP_ONLY_TOOLS.has(toolName)) return result;
    if (!result.structuredContent || typeof result.structuredContent !== 'object') return result;
    if (Array.isArray(result.structuredContent)) return result;

    let data: Record<string, unknown> = { ...(result.structuredContent as Record<string, unknown>) };
    const jobId = resolveNudgeJobId(args, ctx, data);
    if (jobId === null) return result;

    const nowMs = now();
    nudgeTracker.ensure(jobId, nowMs);

    let piggybacked = false;
    if (INBOX_PIGGYBACK_TOOLS.has(toolName) && !Array.isArray(data.pendingMessages)) {
      const auth = await resolveAuth(ctx, args);
      if ('channelToken' in auth) {
        const piggy = await writePiggyback(ctx.request, auth.channelToken);
        const priorWarnings = Array.isArray(data.warnings)
          ? (data.warnings as NudgeWarning[]).filter(
              (w) => w && typeof w === 'object' && typeof w.code === 'string' && typeof w.message === 'string',
            )
          : [];
        const piggyWarnings = Array.isArray(piggy.warnings)
          ? piggy.warnings.filter(
              (w) => w && typeof w === 'object' && typeof w.code === 'string' && typeof w.message === 'string',
            )
          : [];
        data = {
          ...data,
          pendingMessages: piggy.pendingMessages,
          stop: piggy.stop,
          ...(piggy.reason ? { reason: piggy.reason } : {}),
          // must_fix_gate / must_deliver ride the inbox piggyback on kit/browse reads —
          // without this, recovery paths discarded the new warning and re-emitted call_end
          // instead (review, #627).
          ...(piggyWarnings.length > 0 ? { warnings: [...priorWarnings, ...piggyWarnings] } : {}),
        };
        piggybacked = true;
      }
    }

    const seen = readNoteIds.get(jobId) ?? new Set<string>();
    if (toolName === 'read_inbox' && Array.isArray(data.messages)) {
      for (const note of data.messages as Array<{ id?: unknown }>) seen.add(String(note?.id));
      readNoteIds.set(jobId, seen);
    }
    const unread = unreadFromPayload(data, seen);
    if (unread !== null) {
      nudgeTracker.notePendingCount(jobId, unread.count, nowMs, unread.images);
    }

    // Only brief/seed payloads carry seed lifecycle status. Gate and other tools also
    // use a `status` field (e.g. pending/green) — never treat those as seedStatus.
    const seedStatusRaw =
      typeof data.seedStatus === 'string'
        ? data.seedStatus
        : toolName === 'get_seed' && typeof data.status === 'string'
          ? data.status
          : undefined;
    if (seedStatusRaw === 'pending' || seedStatusRaw === 'available' || seedStatusRaw === 'unavailable') {
      nudgeTracker.noteSeedStatus(jobId, seedStatusRaw, nowMs);
    } else if (data.seedAvailable === true) {
      nudgeTracker.noteSeedStatus(jobId, 'available', nowMs);
    } else if (store && (toolName === 'get_brief' || SEED_STATUS_LOOKUP_TOOLS.has(toolName))) {
      // Only re-read while unknown/pending — available/unavailable are terminal for the
      // round, and kit browse would otherwise pay a Firestore read per tool call.
      const known = nudgeTracker.peek(jobId)?.seedStatus;
      if (known === null || known === 'pending') {
        const record = await store.getSubmission(jobId);
        if (record) {
          nudgeTracker.noteSeedStatus(jobId, seedPayload(record).seedStatus, nowMs);
        }
      }
    }

    if (
      typeof data.dispatchAttempt === 'number' &&
      Number.isFinite(data.dispatchAttempt) &&
      (toolName === 'start' || toolName === 'get_brief')
    ) {
      nudgeTracker.noteDispatchAttempt(jobId, data.dispatchAttempt, nowMs);
    }
    nudgeTracker.noteToolSuccess(jobId, toolName, nowMs);
    if (toolName === 'submit_sources' && data.ok === true) {
      nudgeTracker.noteSubmitSuccess(jobId, nowMs);
    }
    // Do not clear awaitingEnd on stage/progress/screenshot. A normal post-submit
    // progress note must keep call_end armed; suppress call_end only while
    // must_fix_gate is present on this reply (review, #627).
    if (toolName === 'show_round') nudgeTracker.noteCardOpened(jobId, nowMs);

    // show_round nests the verdict under `gate`; get_gate_verdict puts status/deliveryId
    // on the root. Surface must_fix_gate either way — even when the agent never hits a
    // write (Claude opened a card and staged nothing yet, or only polled the verdict).
    const gateObj =
      data.gate && typeof data.gate === 'object' && !Array.isArray(data.gate)
        ? (data.gate as { status?: unknown; deliveryId?: unknown })
        : null;
    const gateStatus =
      gateObj && typeof gateObj.status === 'string'
        ? gateObj.status
        : toolName === 'get_gate_verdict' && typeof data.status === 'string'
          ? data.status
          : null;
    const gateDelivery =
      gateObj && typeof gateObj.deliveryId === 'string'
        ? gateObj.deliveryId
        : typeof data.deliveryId === 'string'
          ? data.deliveryId
          : null;
    const prior: NudgeWarning[] = Array.isArray(data.warnings)
      ? (data.warnings as NudgeWarning[]).filter(
          (w) => w && typeof w === 'object' && typeof w.code === 'string' && typeof w.message === 'string',
        )
      : [];
    const hasMustFix = prior.some((w) => w.code === 'must_fix_gate');
    if (
      !hasMustFix &&
      gateStatus &&
      gateNeedsResubmit(gateStatus) &&
      (toolName === 'start' ||
        toolName === 'show_round' ||
        toolName === 'get_gate_verdict' ||
        toolName === 'report_progress')
    ) {
      prior.push(mustFixGateWarningForStatus(gateStatus, gateDelivery));
    }

    const nudgeWarnings: NudgeWarning[] = nudgeTracker.warningsFor(jobId, toolName, nowMs, {
      // Only nudge toward a card in a client that can render one.
      uiCapable: sessionWantsUi((ctx.request.headers['mcp-session-id'] as string | undefined) ?? null),
    });
    // When a refused gate still needs a fix, call_end is the wrong next step — drop it
    // so must_fix_gate is the loud instruction.
    const filteredNudges =
      prior.some((w) => w.code === 'must_fix_gate') || nudgeWarnings.some((w) => w.code === 'must_fix_gate')
        ? nudgeWarnings.filter((w) => w.code !== 'call_end')
        : nudgeWarnings;
    const warnings = [...prior, ...filteredNudges];
    // Any answered get_kit reflects the current pin, on whichever instance served it.
    if (toolName === 'get_kit') refreshedKits.add(jobId);
    if (toolName === 'submit_sources' && data.ok === true) refreshedKits.delete(jobId);
    const next = nextSuggestedTool({
      tool: toolName,
      stop: data.stop,
      reason: data.reason,
      warnings,
      kitRefreshed: refreshedKits.has(jobId),
    });
    if (warnings.length === 0 && !piggybacked && !next) {
      return result;
    }
    if (warnings.length > 0) data = { ...data, warnings };
    if (next) data = { ...data, nextSuggestedTool: next };
    // Keep non-text content (e.g. get_gate_media's inline opening screenshot). Rebuilding
    // via toolOk() would drop those blocks whenever a warning or piggyback lands.
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(data) },
        ...result.content.filter((block) => block.type !== 'text'),
      ],
      structuredContent: data,
    };
  }

  // MCP defaults an un-annotated tool to readOnlyHint:false, destructiveHint:true.
  const WRITES = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  } as const;
  /** Additive, and repeatable with the same effect — re-binding, re-opening. */
  const WRITES_ONCE = { ...WRITES, idempotentHint: true } as const;

  const tools: Record<
    string,
    {
      description: string;
      inputSchema: Record<string, unknown>;
      outputSchema: Record<string, unknown>;
      annotations?: Record<string, unknown>;
      handler: ToolHandler;
    }
  > = {
    start: {
      annotations: { title: 'Start or rejoin a build round', ...WRITES_ONCE },
      outputSchema: {
        type: 'object',
        properties: {
          sessionKey: {
            type: 'string',
            description:
              'Hold this for the whole round and pass it on every later tool call. Do not re-run start to refresh it.',
          },
          sessionId: { type: 'string' },
          jobId: { type: 'number' },
          slug: { type: ['string', 'null'] },
          title: { type: 'string' },
          state: { type: 'string' },
          round: { type: 'number' },
          locales: { type: 'array', items: { type: 'string' } },
          deliveriesRemaining: { type: ['number', 'null'] },
          expiresAt: { type: 'number', description: 'Unix seconds.' },
          sequence: { type: 'array', items: { type: 'string' }, description: 'The usual order of a round.' },
          workflow: { type: 'array', items: { type: 'string' }, description: 'Deprecated alias of sequence.' },
          nextSuggestedTool: { type: 'string' },
          guideVersion: { type: 'string' },
          inboxPolicy: { type: 'string' },
          whenRefused: { type: 'string' },
          canPublish: {
            type: 'boolean',
            description: 'False when this round may deliver previews but not seal. See publishBlockedReason.',
          },
          publishBlockedReason: { type: 'string' },
          seedAvailable: { type: 'boolean' },
          seedStatus: { type: 'string', enum: ['pending', 'available', 'unavailable'] },
          seedNotice: { type: ['string', 'null'] },
          dispatchAttempt: {
            type: 'number',
            description:
              'Increments per dispatch; above 1 means get_transcript holds earlier attempts. Not the round number.',
          },
          gate: {
            type: 'object',
            description: 'Set when a prior delivery still needs a gate fix.',
            properties: { status: { type: 'string' }, deliveryId: { type: 'string' } },
          },
        },
        required: ['sessionKey', 'jobId', 'sequence', 'seedAvailable', 'seedStatus', 'canPublish'],
      },
      description:
        'Bind this MCP client to a round with Bearer (creator key or OAuth) plus slug, or a legacy round key. ' +
        'One start per round: sessionKey stays valid until expiresAt, and a new start is only needed after an unauthenticated refusal. ' +
        'A round usually runs start → show_round → get_brief → get_sources → get_kit / get_kit_api → build (report_progress; stage or patch) → ' +
        'submit_sources (mode=preview while iterating) → end; the gate verdict lands in Studio 2–5 minutes later. ' +
        'Returns sessionKey (carried by every later call), sequence (that order, step by step), nextSuggestedTool, seedAvailable/seedStatus/seedNotice, inbox policy and refusal guidance. ' +
        'canPublish false means this round may deliver mode=preview but not seal — publishBlockedReason says who can. ' +
        'Creator keys are openers only. OAuth access is identity only. Does not treat Mcp-Session-Id as authority. ' +
        CREATOR_TEXT_SAFETY,
      inputSchema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description:
              'Legacy round key from an in-flight handoff. ' +
              'Optional when using Authorization Bearer (creator key or OAuth) + slug.',
          },
          slug: {
            type: 'string',
            description: 'Game slug for your open self-build round. Required with creator-key or OAuth Bearer.',
          },
        },
        required: [],
      },
      handler: async (args, ctx) => {
        if (!store || !agentTokenSecret) {
          return toolErr('the MCP build endpoint is not configured');
        }

        if (isOverInvalidStartLimit(invalidStartsByIp, ctx.request.clientIp, now())) {
          return toolRefusal(
            'too many invalid start attempts — ask the creator for the current prompt in their Studio thread',
            'rate_limited',
            { retryAfterSeconds: invalidStartRetryAfterSeconds(invalidStartsByIp, ctx.request.clientIp, now()) },
          );
        }

        const key = typeof args.key === 'string' ? args.key.trim() : '';
        const slugArg = typeof args.slug === 'string' ? args.slug.trim() : '';
        const bearer = ctx.bearerToken;

        if (!key && matchesPlatformConnectorSecret(bearer, platformConnectorSecret)) {
          noteInvalidStart(ctx.request);
          return toolErr(PLATFORM_CONNECTOR_ONLY_REASON);
        }

        const bindActiveRound = async (active: SubmissionRecord, actorUid: string): Promise<ToolResult> => {
          pruneTransportSessions(now());
          pruneInvalidStartBuckets(now());
          // Prefer the client's correlator when well-formed — even if this instance
          // never saw initialize (Cloud Run multi-instance). Reminting here used to
          // embed a new id in the sessionKey while the client kept sending the old one.
          const sessionId = ctx.sessionId && looksLikeMcpSessionId(ctx.sessionId) ? ctx.sessionId : newMcpSessionId();
          noteTransportSession(sessionId);

          const jobId = active.jobId;
          const roundGeneration = active.roundGeneration ?? 1;
          const sessionKey = mintMcpSessionKey(agentTokenSecret, {
            sessionId,
            jobId,
            roundGeneration,
            now: now(),
            actorUid,
            actorRevision: active.slug ? (await resolveGameAccess(store, active.slug)).accessRevision : undefined,
          });
          const sessionClaims = verifyMcpSessionKey(sessionKey, agentTokenSecret);

          const cap = active.builder === 'self' ? selfBuildDeliveryCap() : null;
          const used = active.roundDeliveryCount ?? 0;

          const seed = seedPayload(active);
          const gateField = await gateFieldForStart(options.gamesStore, active);
          const publishRight = await publishRightForStart(store, active.slug, actorUid);
          const structured = {
            sessionKey,
            sessionId,
            jobId,
            slug: active.slug ?? null,
            title: active.title,
            state: active.state ?? 'queued',
            round: roundGeneration,
            locales: active.locale ? [active.locale, 'en'] : ['en'],
            deliveriesRemaining: cap === null ? null : Math.max(0, cap - used),
            expiresAt: sessionClaims.exp,
            sequence: ROUND_SEQUENCE,
            workflow: ROUND_SEQUENCE,
            nextSuggestedTool: 'get_brief',
            guideVersion: MCP_GUIDE_VERSION,
            inboxPolicy: INBOX_POLICY,
            whenRefused: RETIRED_KEY_ETIQUETTE,
            dispatchAttempt: await dispatchAttempt(store!, active),
            ...seed,
            ...gateField,
            ...publishRight,
          };
          return startToolResult(structured);
        };

        if (!key && bearer && looksLikeCreatorAgentKey(bearer)) {
          if (!slugArg) {
            return toolErr('slug is required when using a creator key — pass the game slug for your open build round');
          }
          const resolved = await resolveCreatorAgentKeyForStart(store, bearer, agentTokenSecret, slugArg, now());
          if (!resolved.ok) {
            noteInvalidStart(ctx.request);
            return toolErrForReason(resolved.reason);
          }
          return await bindActiveRound(resolved.record, resolved.claims.creatorUid);
        }

        if (!key && bearer && looksLikeAsAccessToken(bearer)) {
          const asAccess = await verifyAsAccessToken(store, bearer, now());
          if (!asAccess) {
            noteInvalidStart(ctx.request);
            return toolErr('invalid OAuth access — sign in again from your coding agent');
          }
          if (!slugArg) {
            return toolErr('slug is required when using OAuth — pass the game slug for your open build round');
          }
          const actorUid = await writerUidForSlug(store, slugArg, asAccess.ownerUid);
          if (!actorUid) {
            noteInvalidStart(ctx.request);
            return toolRefusal(SLUG_NOT_ON_ACCOUNT_REASON, 'opener_required');
          }
          const active = await findActiveRoundForSlug(store, slugArg, actorUid);
          if (!active) {
            noteInvalidStart(ctx.request);
            return toolRefusal(NO_OPEN_ROUND_REASON, 'opener_required');
          }
          const builder = active.builder ?? 'platform';
          if (builder !== 'self') {
            noteInvalidStart(ctx.request);
            return toolErr(PLATFORM_ROUND_REASON);
          }

          return await bindActiveRound(active, actorUid);
        }

        if (!key && bearer) {
          let claims: AgentTokenClaims | null = null;
          try {
            claims = verifyManagedMcpOpener(bearer, agentTokenSecret);
          } catch (error) {
            if (!(error instanceof InvalidAgentTokenError)) throw error;
          }
          if (claims) {
            const active = await store.getSubmission(claims.jobId);
            if (!active) {
              noteInvalidStart(ctx.request);
              return toolErr('unknown build — ask the creator for the current prompt in their Studio thread');
            }
            if (active.slug && !roundAuthorityCurrent(active, await resolveGameAccess(store, active.slug))) {
              noteInvalidStart(ctx.request);
              return toolErr(FINISHED_REASON);
            }
            try {
              if (classifyAgentTokenAccess(claims, active, now()) !== 'active') {
                noteInvalidStart(ctx.request);
                return toolErr(FINISHED_REASON);
              }
            } catch (error) {
              noteInvalidStart(ctx.request);
              if (error instanceof InvalidAgentTokenError) return toolErr(error.message || FINISHED_REASON);
              throw error;
            }
            if ((active.builder ?? 'platform') !== 'platform') {
              noteInvalidStart(ctx.request);
              return toolErr('this round capability belongs to a self-build round');
            }
            if (!slugArg || slugArg !== active.slug) {
              noteInvalidStart(ctx.request);
              return toolErr('slug is required and must match this platform round');
            }
            return await bindActiveRound(active, active.ownerUid);
          }
        }

        if (key && looksLikeAsAccessToken(key)) {
          noteInvalidStart(ctx.request);
          return toolErr('OAuth access must be sent as Authorization Bearer, not as the key argument');
        }

        if (key && looksLikeCreatorAgentKey(key)) {
          noteInvalidStart(ctx.request);
          return toolErr('creator key must be sent as Authorization Bearer, not as the key argument');
        }

        // A sessionKey in either opener slot is a specific mistake with a specific fix,
        // and the generic refusals below both misdescribe it: "key is required" reads as
        // "you sent nothing" when something was sent, and the legacy path would call it
        // an invalid build key. Name what was supplied instead.
        if (looksLikeMcpSessionKey(key || bearer || '')) {
          noteInvalidStart(ctx.request);
          return toolRefusal(SESSION_KEY_IS_NOT_AN_OPENER_REASON, 'opener_required');
        }

        // Every other tool answers a Bearer game key with "only opens a session via
        // start()". Falling through to "key is required" here made those two refusals
        // a loop with no exit.
        if (!key && bearer && looksLikeGameAgentKey(bearer)) {
          noteInvalidStart(ctx.request);
          return toolErr(RETIRED_GAME_KEY_REASON);
        }

        if (!key) {
          noteInvalidStart(ctx.request);
          return toolErr('key is required — use Authorization Bearer (creator key or OAuth) + slug');
        }

        let record: SubmissionRecord;
        let jobId: number;
        let roundGeneration: number;
        let claims: AgentTokenClaims;

        if (looksLikeGameAgentKey(key)) {
          noteInvalidStart(ctx.request);
          return toolErr(RETIRED_GAME_KEY_REASON);
        } else {
          // Legacy round-scoped key — still accepted for in-flight rounds.
          try {
            claims = verifyAgentToken(key, agentTokenSecret);
          } catch {
            noteInvalidStart(ctx.request);
            return toolErr('invalid key — ask the creator for the current prompt in their Studio thread');
          }

          const found = await store.getSubmission(claims.jobId);
          if (!found) {
            noteInvalidStart(ctx.request);
            return toolErr('unknown build — ask the creator for the current prompt in their Studio thread');
          }

          if (found.slug && !roundAuthorityCurrent(found, await resolveGameAccess(store, found.slug), claims)) {
            noteInvalidStart(ctx.request);
            return toolErr(FINISHED_REASON);
          }

          let access: AgentTokenAccess;
          try {
            access = classifyAgentTokenAccess(claims, found, now());
          } catch (error) {
            noteInvalidStart(ctx.request);
            if (error instanceof InvalidAgentTokenError) {
              return toolErr(error.message || FINISHED_REASON);
            }
            throw error;
          }
          if (access !== 'active') {
            noteInvalidStart(ctx.request);
            return toolErr(FINISHED_REASON);
          }
          record = found;
          jobId = claims.jobId;
          roundGeneration = claims.roundGeneration ?? record.roundGeneration ?? 1;
        }

        // Prefer the client's correlator when well-formed — even across instances.
        pruneTransportSessions(now());
        pruneInvalidStartBuckets(now());
        const sessionId = ctx.sessionId && looksLikeMcpSessionId(ctx.sessionId) ? ctx.sessionId : newMcpSessionId();
        noteTransportSession(sessionId);

        const legacyActorUid = claims.actorUid ?? record.ownerUid;
        const sessionKey = mintMcpSessionKey(agentTokenSecret, {
          sessionId,
          jobId,
          roundGeneration,
          now: now(),
          actorUid: legacyActorUid,
          actorRevision: claims.actorRevision ?? (claims.actorUid ? undefined : record.accessEpoch),
        });
        const sessionClaims = verifyMcpSessionKey(sessionKey, agentTokenSecret);

        const cap = record.builder === 'self' ? selfBuildDeliveryCap() : null;
        const used = record.roundDeliveryCount ?? 0;

        const seed = seedPayload(record);
        const gateField = await gateFieldForStart(options.gamesStore, record);
        const publishRight = await publishRightForStart(store, record.slug, legacyActorUid);
        const structured = {
          sessionKey,
          sessionId,
          jobId,
          slug: record.slug ?? null,
          title: record.title,
          state: record.state ?? 'queued',
          round: roundGeneration,
          locales: record.locale ? [record.locale, 'en'] : ['en'],
          deliveriesRemaining: cap === null ? null : Math.max(0, cap - used),
          expiresAt: sessionClaims.exp,
          sequence: ROUND_SEQUENCE,
          workflow: ROUND_SEQUENCE,
          nextSuggestedTool: 'get_brief',
          guideVersion: MCP_GUIDE_VERSION,
          inboxPolicy: INBOX_POLICY,
          whenRefused: RETIRED_KEY_ETIQUETTE,
          dispatchAttempt: await dispatchAttempt(store!, record),
          ...seed,
          ...gateField,
          ...publishRight,
        };
        return startToolResult(structured);
      },
    },

    ...createGameCreateTools({ store, agentTokenSecret, platformConnectorSecret, now, createGame }),
    ...createAccountGamesTools({
      store,
      agentTokenSecret,
      platformConnectorSecret,
      now,
      loadOwnerGames: options.loadOwnerGames,
    }),
    ...createPerformanceTools({ store, agentTokenSecret, readGamePerformance: options.readGamePerformance, now }),
    ...createOwnershipTools({ store, platformConnectorSecret, now }),

    ...createProposalTools({
      store,
      agentTokenSecret,
      platformConnectorSecret,
      now,
      missingCredentialHint,
      gamesStore: gamesStoreForProposals,
      resolveProposalBase: resolveProposalBaseFor,
      contentChecker,
      onSourcesDelivered: dispatchProposalGate,
      proposals: options.proposals,
    }),
    ...createRoundReopenTools({
      store,
      agentTokenSecret,
      platformConnectorSecret,
      startImprovementRound,
      continueDraftRound,
      contentChecker,
      dailyImprovementQuota,
      dailyFeedbackQuota,
      now,
    }),

    ...createSessionBasicsTools({ resolveAuth, injectChannel }),

    ...createKitTools({ resolveAuth, injectChannel }),
    ...createKitFileTools({ resolveAuth, injectChannel }),
    ...createSeedTools({ resolveAuth, injectChannel }),

    ...createSourceReadTools({ resolveAuth, injectChannel, agentTokenSecret, now }),
    ...createSourceStageTools({ resolveAuth, injectChannel, agentTokenSecret, now, assertDeliverableSourcePath }),
    ...createExampleTools({ resolveAuth, injectChannel }),

    ...createSourcePatchTools({ resolveAuth, injectChannel }),
    ...createSourceSubmitTools({ resolveAuth, injectChannel, store, gamesStore: options.gamesStore }),

    ...createRoundCardTools({ resolveAuth, injectChannel, store, now }),
    ...createShareDraftTools({ resolveAuth, store, refuseShare: options.refuseShare, now }),
    ...createGateMediaTools({ resolveAuth, injectChannel }),
    ...createConceptTools({ resolveAuth, injectChannel }),

    ...createInboxTools({ resolveAuth, injectChannel, writePiggyback }),
    ...createProposalRoundTools({ resolveAuth, store, gamesStore: options.gamesStore, proposals: options.proposals }),
  };

  function noteInvalidStart(request: FastifyRequest): void {
    noteInvalidStartHit(invalidStartsByIp, request.clientIp, now());
  }

  async function handleJsonRpc(request: FastifyRequest, reply: FastifyReply, message: JsonRpcRequest) {
    const sessionHeader = headerValue(request.headers[SESSION_HEADER]);
    const bearerToken = readBearerToken(request.headers.authorization);

    // Notifications / responses: 202 with no body.
    const isNotification = message.id === undefined && typeof message.method === 'string';
    const isClientResponse =
      message.id !== undefined && message.method === undefined && ('result' in message || 'error' in message);

    if (isClientResponse) {
      return reply.status(202).send();
    }

    if (!message.method) {
      return reply.status(400).send(jsonRpcError(message.id, -32600, 'invalid request: method required'));
    }

    if (message.method === 'notifications/initialized' || message.method.startsWith('notifications/')) {
      return reply.status(202).send();
    }

    if (message.method === 'initialize') {
      const params = (message.params ?? {}) as { protocolVersion?: string; clientInfo?: unknown };
      const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL_VERSION;
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : PROTOCOL_VERSION;

      // MCP Apps: remember what this client can render, and answer in kind. A client
      // that does not declare the extension gets exactly the capabilities it got before
      // views existed — no `resources`, no `extensions`.
      const uiCapable = uiEnabled && clientDeclaresUi(params);

      const sessionId =
        uiCapable && agentTokenSecret ? markSessionIdUiCapable(newMcpSessionId(), agentTokenSecret) : newMcpSessionId();
      noteTransportSession(sessionId);
      reply.header('Mcp-Session-Id', sessionId);
      reply.header('MCP-Session-Id', sessionId);

      return reply.send(
        jsonRpcResult(message.id, {
          protocolVersion,
          capabilities: {
            tools: { listChanged: false },
            ...(uiCapable
              ? {
                  resources: { subscribe: false, listChanged: false },
                  extensions: mcpUiServerCapability(),
                }
              : {}),
          },
          serverInfo: {
            name: 'gamedevpl',
            version: '1.0.0',
          },
          instructions: MCP_INSTRUCTIONS,
        }),
      );
    }

    // Non-initialize requests: adopt a well-formed correlator we have not seen on this
    // instance. Cloud Run is multi-instance and ChatGPT does not pin to one revision —
    // a 404 here made every post-initialize tool call a coin flip. Inventing an id
    // grants nothing: sessionKey / Bearer still authorize every tool. Exception:
    // IDs this instance explicitly terminated via DELETE stay dead (tombstone).
    if (sessionHeader && !transportSessions.has(sessionHeader)) {
      pruneTransportSessions(now());
      if (terminatedTransportSessions.has(sessionHeader)) {
        request.log.warn(
          {
            event: 'mcp_terminated_session',
            transportSessionId: sessionHeader.slice(0, 16),
            userAgent: headerValue(request.headers['user-agent'])?.slice(0, 120) ?? undefined,
          },
          'mcp terminated session refused',
        );
        return reply.status(404).send({ error: 'unknown MCP session' });
      }
      if (!looksLikeMcpSessionId(sessionHeader)) {
        request.log.warn(
          {
            event: 'mcp_unknown_session',
            transportSessionId: sessionHeader.slice(0, 32),
            userAgent: headerValue(request.headers['user-agent'])?.slice(0, 120) ?? undefined,
          },
          'mcp unknown session',
        );
        return reply.status(404).send({ error: 'unknown MCP session' });
      }
      noteTransportSession(sessionHeader);
      request.log.info(
        {
          event: 'mcp_session_adopted',
          transportSessionId: sessionHeader.slice(0, 16),
          userAgent: headerValue(request.headers['user-agent'])?.slice(0, 120) ?? undefined,
        },
        'mcp session correlator adopted on this instance',
      );
    }

    const protocolVersion = headerValue(request.headers['mcp-protocol-version']);
    if (protocolVersion && !SUPPORTED_PROTOCOL_VERSIONS.has(protocolVersion)) {
      return reply.status(400).send({ error: 'unsupported MCP-Protocol-Version' });
    }

    const ctx: ToolContext = {
      request,
      sessionId: sessionHeader,
      bearerToken,
    };

    if (message.method === 'ping') {
      return reply.send(jsonRpcResult(message.id, {}));
    }

    if (message.method === 'tools/list') {
      // `_meta.ui` is added only for a client that negotiated the extension, so this
      // list stays byte-identical for every client that shipped before views existed.
      const withUi = sessionWantsUi(sessionHeader);
      return reply.send(
        jsonRpcResult(message.id, {
          tools: Object.entries(tools)
            .filter(([name]) => MCP_VISIBLE_TOOLS.has(name))
            // An app-only tool exists for the view. A client with no views would offer it
            // to its model, which is exactly what visibility:["app"] forbids.
            .filter(([name]) => withUi || !MCP_UI_APP_ONLY_TOOLS.has(name))
            .map(([name, tool]) => {
              const appOnly = withUi && MCP_UI_APP_ONLY_TOOLS.has(name);
              const uiResourceUri = withUi ? MCP_UI_TOOL_RESOURCES[name] : undefined;
              const uiMeta = appOnly
                ? { visibility: ['app'] }
                : uiResourceUri
                  ? // visibility defaults to ["model", "app"], so a launcher says nothing.
                    { resourceUri: uiResourceUri }
                  : null;
              // ChatGPT rendered the card but could not call the app-only tool from it.
              // Its own compatibility keys say the same things as `_meta.ui`, so declare
              // both rather than guess which one a host actually reads.
              const openAiMeta = appOnly
                ? { 'openai/widgetAccessible': true }
                : uiResourceUri
                  ? { 'openai/outputTemplate': uiResourceUri }
                  : null;
              return {
                name,
                description: tool.description,
                inputSchema: tool.inputSchema,
                // Declared once here, so a tool cannot forget that it can refuse.
                outputSchema: withErrorBranch(tool.outputSchema),
                ...(tool.annotations ? { annotations: tool.annotations } : {}),
                ...(uiMeta ? { _meta: { ui: uiMeta, ...openAiMeta } } : {}),
              };
            }),
        }),
      );
    }

    // MCP Apps resources, on exactly the same gate as `_meta.ui`: the flag AND a client
    // that negotiated the extension. A client that did not gets `method not found`, the
    // same answer it got before views existed — no probe reveals a surface it did not
    // ask for. Caveat worth carrying into Phase 1: capability lives on the transport
    // correlator, so a client whose session is adopted by another instance mid-round
    // reads as not capable and would be refused here. Single-instance today
    // (`--max-instances 1`), and a spike runs against one process, but a durable view
    // surface cannot key off the correlator alone.
    const wantsUiResources = sessionWantsUi(sessionHeader);

    if (wantsUiResources && message.method === 'resources/list') {
      return reply.send(jsonRpcResult(message.id, { resources: uiResourceDescriptors() }));
    }

    // Every view is a fixed `ui://` document; nothing here is parameterised by URI.
    if (wantsUiResources && message.method === 'resources/templates/list') {
      return reply.send(jsonRpcResult(message.id, { resourceTemplates: [] }));
    }

    if (wantsUiResources && message.method === 'resources/read') {
      const params = (message.params ?? {}) as { uri?: unknown };
      const uri = typeof params.uri === 'string' ? params.uri : '';
      const resource = readUiResource(uri);
      if (!resource) {
        return reply.send(jsonRpcError(message.id, -32602, `unknown resource: ${uri || '(missing uri)'}`));
      }
      return reply.send(jsonRpcResult(message.id, { contents: [resource] }));
    }

    if (message.method === 'tools/call') {
      const params = (message.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
      const name = typeof params.name === 'string' ? params.name : '';
      const tool = tools[name];
      if (!tool) {
        return reply.send(jsonRpcError(message.id, -32601, `unknown tool: ${name}`));
      }
      // visibility:["app"] is a contract, so enforce it rather than relying on the tool
      // being absent from tools/list: a client that guesses the name would otherwise
      // reach a tool its model was never meant to see. This refuses in exactly the
      // situations views are already unavailable, so it cannot break a working view.
      if (MCP_UI_APP_ONLY_TOOLS.has(name) && !sessionWantsUi(sessionHeader)) {
        return reply.send(jsonRpcError(message.id, -32601, `unknown tool: ${name}`));
      }
      const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
      const sessionKeyArg = typeof args.sessionKey === 'string' ? args.sessionKey.trim() : '';
      const userAgent = headerValue(request.headers['user-agent']);
      try {
        const rawResult = await tool.handler(args, ctx);
        const result = await applySessionNudges(name, args, ctx, rawResult);
        // Echo session id on tool responses when we have one (transport correlator).
        if (sessionHeader) {
          reply.header('Mcp-Session-Id', sessionHeader);
        } else if (name === 'start' && result.structuredContent && typeof result.structuredContent === 'object') {
          const sid = (result.structuredContent as { sessionId?: string }).sessionId;
          if (sid) reply.header('Mcp-Session-Id', sid);
        }

        // Connectors often omit isError payloads from the chat transcript. These lines
        // are the durable signal in Cloud Logging — never include sessionKey / bearer.
        const reason = toolErrorReason(result);
        if (reason) {
          request.log.warn(
            mcpToolRefusalFields({
              tool: name,
              reason,
              code: toolErrorCode(result),
              bearer: bearerToken,
              sessionKey: sessionKeyArg,
              transportSessionId: sessionHeader,
              agentTokenSecret,
              userAgent,
            }),
            'mcp tool refused',
          );
        } else if (name === 'start' && result.structuredContent && typeof result.structuredContent === 'object') {
          const started = result.structuredContent as {
            jobId?: unknown;
            slug?: unknown;
            sessionId?: unknown;
            round?: unknown;
          };
          if (typeof started.jobId === 'number' && typeof started.sessionId === 'string') {
            request.log.info(
              {
                ...mcpSessionStartedFields({
                  jobId: started.jobId,
                  slug: typeof started.slug === 'string' ? started.slug : null,
                  sessionId: started.sessionId,
                  round: typeof started.round === 'number' ? started.round : 0,
                  userAgent,
                }),
                guideVersion: MCP_GUIDE_VERSION,
              },
              'mcp session started',
            );
          }
          // Pulse joining_round on start (jobId from result; clears agentEndedAt on resume).
          if (store && typeof started.jobId === 'number') {
            const jobId = started.jobId;
            const at = now();
            const presenceKey = JOINING_ROUND_PRESENCE.key;
            try {
              const record = await store.getSubmission(jobId);
              const needsSignal = !record?.lastAgentSignalAt || Boolean(record.agentEndedAt);
              if (
                needsSignal ||
                shouldEmitMcpPresencePulse(presencePulseByJob.get(jobId), at, undefined, presenceKey)
              ) {
                noteMcpPresencePulse(presencePulseByJob, jobId, at, presenceKey);
                await touchStartedRoundPresence(store, jobId, at, presenceKey, started, record);
              }
            } catch (pulseError) {
              request.log.warn({ err: pulseError, jobId, tool: name }, 'mcp start presence pulse failed');
            }
          }
        } else if (store && agentTokenSecret && shouldPulseMcpPresence(name)) {
          // Heartbeat + short-lived thought key — never a durable chat row. Kit-browse
          // loops used to spam "Czytanie plików Creator Kit…" between real report_progress.
          const claims = resolvePresenceClaims(sessionKeyArg, bearerToken, agentTokenSecret);
          const presenceKey = mcpPresenceKey(name);
          if (presenceKey) {
            const at = now();
            const jobId = await livePresencePulseJob(claims, store, presencePulseByJob, at, presenceKey);
            if (jobId !== null) {
              noteMcpPresencePulse(presencePulseByJob, jobId, at, presenceKey);
              try {
                await store.touchLastAgentSignalAt(
                  jobId,
                  new Date(at).toISOString(),
                  { key: presenceKey },
                  { preserveEnded: presencePreservesEnded(name), roundGeneration: claims?.roundGeneration ?? 1 },
                );
              } catch (pulseError) {
                request.log.warn({ err: pulseError, jobId, tool: name }, 'mcp presence pulse failed');
              }
            }
          }
        }

        return reply.send(jsonRpcResult(message.id, result));
      } catch (error) {
        app.log.error({ err: error, tool: name }, 'MCP tool handler failed');
        return reply.send(
          jsonRpcResult(message.id, toolErr(error instanceof Error ? error.message : 'internal error')),
        );
      }
    }

    if (isNotification) {
      return reply.status(202).send();
    }

    return reply.send(jsonRpcError(message.id, -32601, `method not found: ${message.method}`));
  }

  const mcpRouteConfig = {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    bodyLimit: MAX_MCP_BODY_BYTES,
  };

  app.post(MCP_ENDPOINT_PATH, mcpRouteConfig, async (request, reply) => {
    if (!originAllowed(request)) {
      return reply.status(403).send(jsonRpcError(null, -32000, 'forbidden origin'));
    }
    if (!store || !agentTokenSecret) {
      return reply.status(503).send({ error: 'the MCP build endpoint is not configured' });
    }

    const body = request.body;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send(jsonRpcError(null, -32600, 'invalid JSON-RPC body'));
    }

    const message = body as JsonRpcRequest;
    if (shouldIssueMcpOAuthChallenge(request, message)) {
      const tool =
        message.method === 'tools/call' && message.params && typeof message.params === 'object'
          ? String((message.params as { name?: unknown }).name ?? '')
          : '';
      request.log.warn(
        {
          event: 'mcp_oauth_challenge',
          tool: tool || undefined,
          method: message.method,
          userAgent: headerValue(request.headers['user-agent'])?.slice(0, 120) ?? undefined,
        },
        'mcp oauth challenge',
      );
      return sendMcpOAuthChallenge(reply, privateBeta);
    }

    // Single message only (streamable HTTP 2025-11-25 dropped batching).
    return handleJsonRpc(request, reply, message);
  });

  app.get(MCP_ENDPOINT_PATH, { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!originAllowed(request)) {
      return reply.status(403).send({ error: 'forbidden origin' });
    }
    if (!readBearerToken(request.headers.authorization)) {
      return sendMcpOAuthChallenge(reply, privateBeta);
    }
    // No server-initiated SSE in v1 — clients drive via POST tools/call.
    return reply.status(405).send({ error: 'SSE listen not offered; use POST for JSON-RPC' });
  });

  app.delete(
    MCP_ENDPOINT_PATH,
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!originAllowed(request)) {
        return reply.status(403).send({ error: 'forbidden origin' });
      }
      const sessionHeader = headerValue(request.headers[SESSION_HEADER]);
      if (!sessionHeader) {
        return reply.status(400).send({ error: 'Mcp-Session-Id required to terminate a session' });
      }
      transportSessions.delete(sessionHeader);
      // Tombstone so a concurrent/retry POST with the same id is not re-adopted.
      pruneTransportSessions(now());
      terminatedTransportSessions.set(sessionHeader, now());
      return reply.status(204).send();
    },
  );
}

function parseAllowedOrigins(): string[] {
  const webOrigin = process.env.WEB_ORIGIN?.trim();
  const appBase = process.env.APP_BASE_URL?.trim();
  const origins = new Set<string>();
  if (webOrigin) {
    for (const entry of webOrigin.split(',')) {
      const trimmed = entry.trim();
      if (trimmed) origins.add(trimmed);
    }
  }
  if (appBase) origins.add(appBase.replace(/\/+$/, ''));
  return [...origins];
}
