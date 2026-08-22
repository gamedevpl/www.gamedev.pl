import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import {
  AGENT_BUILD_RULES_DIGEST,
  briefLocales,
  buildConstraints,
  DEFAULT_BUILD_ORIENTATION,
} from './agent-build-brief.js';
import { getAgentBuildExample, listAgentBuildExamples } from './agent-build-examples.js';
import { ExampleFilesError, createExampleFileStore, listExampleFiles, readExampleFile } from './example-files.js';
import {
  assertAgentTokenActive,
  classifyAgentTokenAccess,
  InvalidAgentTokenError,
  readBearerToken,
  STALE_AGENT_TOKEN_REASON,
  verifyAgentToken,
  type AgentTokenAccess,
} from './agent-token.js';
import {
  assertUploadTokenUnexpired,
  DEFAULT_UPLOAD_URL_TTL_SECONDS,
  mintUploadToken,
  uploadCurlCommand,
  verifyUploadToken,
  type UploadKind,
  type UploadTokenClaims,
} from './agent-upload-token.js';
import { MAX_BUILD_PREVIEW_BYTES } from './build-preview-limits.js';
import { loadBuildTranscript } from './build-transcript.js';
import { canonicalAppBaseUrl } from './canonical-app-url.js';
import { deriveGateStatusString, readGateVerdict } from './gate-verdict.js';
import { DEFAULT_SIGNED_URL_TTL_SECONDS, type GcsObjectStore } from './gcs-sign.js';
import { DEFAULT_MCP_DIGEST_MAX_BYTES, compactKitDigestForApi } from './kit-digest.js';
import {
  forbiddenIndexHtmlWriteReason,
  InvalidUploadError,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  type DeliveryMode,
  type GamesStore,
} from './games-store.js';
import { parseGameMedia } from './github-client.js';
import { canTransition, resolveJobState, type JobState } from './job-state.js';
import { gateCrashStall } from './gate-crash.js';
import {
  KitFilesError,
  createKitFileStore,
  listKitFiles,
  readKitFile,
  readKitFileFragment,
  readKitFiles,
  searchKitFiles,
} from './kit-files.js';
import { logKnowledgeQuery } from './knowledge-metrics.js';
import type { KnowledgeMode, KnowledgeQueryResult, KnowledgeScope, QueryKnowledgeFn } from './knowledge-search.js';
import {
  KIT_ENTRY,
  KitRegistryError,
  exampleUnpackCommand,
  kitUnpackCommand,
  parseKitRegistry,
  parseKitSidecar,
} from './kit-registry.js';
import { seedPayload } from './seed-status.js';
import { largeSourceFileHint } from './module-size.js';
import { gameManifestHint } from './game-manifest-hint.js';
import { resolveRoundBaseVersion } from './round-base-version.js';
import { computeStageAdvisories } from './stage-hints.js';
import { applyExactReplace, applySourcePatch, SourcePatchError } from './source-patch.js';
import { overlayGameSources } from './staged-preview.js';
import { SourceDeliveryValidationError, type SourceDeliveryService } from './source-delivery.js';
import {
  dispatchAttempt,
  type BuilderHandoff,
  type CreatorMessage,
  type Store,
  type SubmissionRecord,
} from './store.js';
import { BUILD_EVENT_KINDS, BUILD_STEPS, sanitizeCreatorText, type BuildEvent } from './submission-status.js';
import { normalizeAtIntake, type IntakeText } from './localize-intake.js';
import { createTranslatorFromEnv, type Translator } from './translate.js';

// The build channel (docs/agent-live-channel-plan.md). Direct route for progress, staging, and status.
// Invariant: agent input is untrusted, prompt-influenced text — sanitized, escaped on render, never model instructions.

const MAX_EVENT_TEXT = 300;

const BuildEventInputSchema = z.object({
  kind: z.enum(BUILD_EVENT_KINDS).default('step'),
  step: z.enum(BUILD_STEPS).optional(),
  text: z
    .string()
    .trim()
    .min(1, 'text is required')
    .max(MAX_EVENT_TEXT * 4, 'text is too long'),
  textLocalized: z
    .string()
    .trim()
    .max(MAX_EVENT_TEXT * 4)
    .optional(),
  locale: z
    .string()
    .trim()
    .max(10)
    .regex(/^[a-z]{2}(-[A-Za-z0-9]{2,8})?$/, 'invalid locale')
    .optional(),
  progress: z
    .object({
      done: z.number().int().min(0).max(999),
      total: z.number().int().min(1).max(999),
    })
    .optional(),
});

const AckRequestSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(64)).max(50),
});

// Empty body is ordinary: a steer is optional.
const RegenerateSeedRequestSchema = z.object({
  steer: z.string().trim().min(1).max(600, 'steer is too long').optional(),
});

const REGENERATE_SEED_REFUSALS: Record<string, string> = {
  not_configured: 'this deployment does not generate seeds',
  not_found: 'no round to regenerate a seed for',
  seed_not_readable:
    'this round was handed its seed as a workspace rather than reading it, so replacing the stored copy would not reach the agent',
  already_delivered: 'this round already delivered — build on what you delivered rather than restarting from a draft',
  cap_reached: 'this job has used its seed regenerations; continue from the draft you have or scaffold from the kit',
  seeding_off: 'seeding is off right now; continue from the kit, or try again once it is back on',
};

// Empty body stays valid — every existing client sends one.
const EndRequestSchema = z.object({
  summary: z
    .string()
    .trim()
    .max(MAX_EVENT_TEXT * 4, 'summary is too long')
    .optional(),
  summaryLocalized: z
    .string()
    .trim()
    .max(MAX_EVENT_TEXT * 4)
    .optional(),
  locale: z
    .string()
    .trim()
    .max(10)
    .regex(/^[a-z]{2}(-[A-Za-z0-9]{2,8})?$/, 'invalid locale')
    .optional(),
  ackInboxIds: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
});

const MAX_SHOT_LABEL = 120;
/**
 * Decoded PNG ceiling. Shots are stored as canonical base64 in a single Firestore
 * document (1 MiB hard limit); leave headroom for id/labels/timestamps. The MCP
 * brief's "≤2 MB" needs object storage before it can be honest — do not raise this
 * number alone or uploads pass validation and 500 at `.set()`.
 */
const maxShotBytes = 700 * 1024;
/**
 * Ceilings on frames carried inline by the gate-media read.
 *
 * Not a bandwidth limit — a context limit. Every inlined frame is base64 in a tool
 * reply that some model has to hold, so `frames=all` on an eight-frame capture would
 * cost more than it informs. Two frames answer nearly every question an agent has
 * about how its game looks; the rest stay one signed URL away for clients that can
 * follow one.
 */
const MAX_INLINE_FRAMES = 3;
const MAX_INLINE_FRAME_BYTES = 1_400 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const ShotUploadUrlInputSchema = z.object({
  label: z
    .string()
    .trim()
    .max(MAX_SHOT_LABEL * 4)
    .optional(),
  caption: z
    .string()
    .trim()
    .max(MAX_SHOT_LABEL * 4)
    .optional(),
});

const RETIRED_BASE64_SHOT_REASON = `base64 screenshot upload is retired — POST ${AGENT_CHANNEL_ROUTES.SHOT_UPLOAD_URL}, then curl --upload-file <png> "$url"`;

const MAX_PREVIEW_LABEL = 120;
/**
 * A delivery: the game's own source files, and nothing else.
 *
 * Deliberately text rather than an archive. An archive would need unpacking before its
 * paths could be judged, and unpacking untrusted input to decide whether it is allowed is
 * exactly the order of operations that produces zip-slip bugs. A flat list of
 * (path, content) is checked before a single byte is stored.
 */
const BuildSourcesInputSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must be lowercase letters, digits and dashes')
      .max(64),
    files: z
      .array(
        z.object({
          path: z.string().trim().min(1).max(120),
          content: z.string().max(1_000_000),
        }),
      )
      // Keep in lockstep with games-store MAX_UPLOAD_FILES (MCP advertise the same).
      .max(MAX_UPLOAD_FILES, 'too many files')
      .optional(),
    /**
     * Assemble the job's staged buffer (built via PUT …/sources/stage) instead of
     * requiring the full tree in this request — for MCP clients that cannot emit a
     * huge files[] payload cleanly.
     */
    fromStaged: z.boolean().optional(),
    /**
     * Re-deliver the job's latest candidate (previewVersion, then deliveredVersion)
     * from the games store without the agent re-uploading every path. Built for
     * `kit_outdated`: get_kit → submit_sources({ fromLatestDelivery:true, mode, kitEngineRef })
     * with optional files[] overlays for paths that actually changed. Mutually exclusive
     * with fromStaged. When mode is omitted with fromLatestDelivery, the previous
     * candidate's deliveryMode is reused (preview stays preview).
     */
    fromLatestDelivery: z.boolean().optional(),
    /**
     * Creator Kit engineRef the sources were built against. Required for self-build
     * deliveries (BY-06); the gate compares it to `kits/current.json`'s N/N−1 window.
     */
    kitEngineRef: z
      .string()
      .trim()
      .min(7, 'kitEngineRef must be a kit engine commit')
      .max(64)
      .regex(/^[0-9a-f]+$/i, 'kitEngineRef must be a hex commit sha')
      .optional(),
    /**
     * Preview: typecheck→smoke→build, TRACE/PLAYTEST optional, Studio-playable only.
     * Publish: full gate; TRACE/PLAYTEST required. Default when omitted is publish,
     * except with fromLatestDelivery — then the previous candidate's lane is reused.
     */
    mode: z.enum(['preview', 'publish']).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.fromStaged && value.fromLatestDelivery) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fromStaged and fromLatestDelivery cannot both be true — pick one',
        path: ['fromLatestDelivery'],
      });
    }
    const inline = value.files?.length ?? 0;
    if (!value.fromStaged && !value.fromLatestDelivery && inline === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'files is required (or set fromStaged=true after staging, or fromLatestDelivery=true to reuse the last candidate)',
        path: ['files'],
      });
    }
  });

const StageSourceInputSchema = z.object({
  path: z.string().trim().min(1).max(120),
  content: z.string().max(1_000_000),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must be lowercase letters, digits and dashes')
    .max(64)
    .optional(),
});

const DeleteSourceInputSchema = z.object({
  path: z.string().trim().min(1).max(120),
});

const ExactPatchPairSchema = z.object({
  old: z.string().max(200_000),
  new: z.string().max(200_000),
});

const FileExactPatchSchema = z
  .object({
    path: z.string().trim().min(1).max(120),
    old: z.string().max(200_000).optional(),
    new: z.string().max(200_000).optional(),
    patches: z.array(ExactPatchPairSchema).min(1).max(50).optional(),
  })
  .superRefine((value, ctx) => {
    const hasOld = value.old !== undefined;
    const hasNew = value.new !== undefined;
    const hasPatches = value.patches !== undefined && value.patches.length > 0;
    if (hasOld !== hasNew) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'old and new must be passed together for exact replace',
      });
      return;
    }
    if ([hasOld && hasNew, hasPatches].filter(Boolean).length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'each files[] entry needs old+new or patches[]',
      });
    }
  });

const StageSourcePatchInputSchema = z
  .object({
    path: z.string().trim().min(1).max(120).optional(),
    patch: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1, 'patch must not be empty').max(400_000))
      .optional(),
    old: z.string().max(200_000).optional(),
    new: z.string().max(200_000).optional(),
    patches: z.array(ExactPatchPairSchema).min(1).max(50).optional(),
    files: z.array(FileExactPatchSchema).min(1).max(100).optional(),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must be lowercase letters, digits and dashes')
      .max(64)
      .optional(),
  })
  .superRefine((value, ctx) => {
    const hasFiles = value.files !== undefined && value.files.length > 0;
    const hasPatch = value.patch !== undefined;
    const hasOld = value.old !== undefined;
    const hasNew = value.new !== undefined;
    const hasPatches = value.patches !== undefined && value.patches.length > 0;
    if (hasFiles && (hasPatch || hasOld || hasNew || hasPatches || value.path !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pass files[] alone, or a single-file path with old+new / patches[] / patch',
      });
      return;
    }
    if (hasFiles) {
      const paths = value.files!.map((file) => file.path);
      if (new Set(paths).size !== paths.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'files[] paths must be unique' });
      }
      return;
    }
    if (!value.path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'path is required unless files[] is passed',
      });
      return;
    }
    const modes = [hasPatch, hasOld || hasNew, hasPatches].filter(Boolean).length;
    if (modes > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'pass either old+new (single exact replace), patches[] (multiple exact replaces), or patch (unified diff)',
      });
      return;
    }
    if (hasOld !== hasNew) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'old and new must be passed together for exact replace',
      });
      return;
    }
    if (modes === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pass old+new (exact replace, preferred), patches[] (multi-replace), files[], or patch (unified diff)',
      });
    }
  });

type PatchFileSpec = {
  path: string;
  old?: string;
  new?: string;
  patches?: Array<{ old: string; new: string }>;
  patch?: string;
};

type PatchBaseFrom = 'staged' | 'delivery' | 'seed';

type PatchFailure = {
  path: string;
  index: number;
  error: string;
};

function patchEditCount(file: PatchFileSpec): number {
  return file.patches?.length ?? 1;
}

function applyPatchFileBestEffort(
  content: string,
  file: PatchFileSpec,
): { content: string; replacements: number; applied: number[]; failed: PatchFailure[] } {
  const edits: Array<{ old?: string; new?: string; patch?: string }> =
    file.patches !== undefined
      ? file.patches
      : file.old !== undefined && file.new !== undefined
        ? [{ old: file.old, new: file.new }]
        : [{ patch: file.patch }];

  let current = content;
  let replacements = 0;
  const applied: number[] = [];
  const failed: PatchFailure[] = [];
  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i]!;
    try {
      const result =
        edit.patch !== undefined
          ? applySourcePatch({ content: current, path: file.path, patch: edit.patch })
          : applyExactReplace({ content: current, path: file.path, old: edit.old!, new: edit.new! });
      current = result.content;
      replacements += result.replacements;
      applied.push(i);
    } catch (error) {
      if (error instanceof SourcePatchError) {
        failed.push({ path: file.path, index: i, error: error.message });
        continue;
      }
      throw error;
    }
  }
  return { content: current, replacements, applied, failed };
}

async function resolvePatchBase(input: {
  gamesStore: GamesStore;
  version: string | null;
  record: SubmissionRecord;
  slug: string;
  issueNumber: number;
  roundGeneration: number;
  path: string;
}): Promise<{ content: string; baseFrom: PatchBaseFrom } | null> {
  const stagedContent = await input.gamesStore.getStagedSourceFile({
    slug: input.slug,
    issueNumber: input.issueNumber,
    roundGeneration: input.roundGeneration,
    path: input.path,
  });
  if (stagedContent !== null) return { content: stagedContent, baseFrom: 'staged' };

  if (input.version) {
    const delivered = await input.gamesStore.getSourceFile(input.slug, input.version, input.path);
    if (delivered !== null) return { content: delivered, baseFrom: 'delivery' };
  }

  const seedFile = input.record.seed?.files.find((file) => file.path === input.path);
  if (seedFile) return { content: seedFile.content, baseFrom: 'seed' };
  return null;
}

const BuildPreviewInputSchema = z.object({
  html: z
    .string()
    .trim()
    .min(1, 'html is required')
    .max(Math.ceil((MAX_BUILD_PREVIEW_BYTES * 4) / 3) + 1024, 'preview is too large')
    .regex(/^[A-Za-z0-9+/\s]*={0,2}$/, 'html must be base64'),
  slug: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'invalid slug')
    .optional(),
  label: z
    .string()
    .trim()
    .max(MAX_PREVIEW_LABEL * 4)
    .optional(),
  labelLocalized: z
    .string()
    .trim()
    .max(MAX_PREVIEW_LABEL * 4)
    .optional(),
  locale: z
    .string()
    .trim()
    .max(10)
    .regex(/^[a-z]{2}(-[A-Za-z0-9]{2,8})?$/, 'invalid locale')
    .optional(),
});

export interface AgentChannelOptions {
  store?: Store;
  /** Signing key for build tokens; the same secret that mints submission tokens. */
  agentTokenSecret?: string;
  now?: () => number;
  /**
   * Called when a build records an event, so a cached status response can be dropped
   * and the creator's next poll shows the update rather than a stale snapshot.
   */
  onEvent?: (issueNumber: number) => void;
  onBuilderHandoffAcknowledged?: (input: {
    issueNumber: number;
    acknowledgedAt: string;
    log: FastifyRequest['log'];
  }) => Promise<{ started: boolean; reason?: string }>;
  /**
   * Localizes a progress report that arrived without one. Runs here, on the write, and
   * never on the status read — a translation on the read path costs one model call per
   * poll per viewer, which is exactly how 2026-08-04 happened. Defaults to
   * createTranslatorFromEnv(); tests inject NoopTranslator.
   */
  translator?: Translator;
  /** Hard ceiling on stored events per build — bounds a looping agent's cost. */
  maxEventsPerBuild?: number;
  /** Events one build may record per hour. */
  maxEventsPerWindow?: number;
  /** Hard ceiling on stored screenshots per build. */
  maxShotsPerBuild?: number;
  /** Screenshots one build may push per hour. */
  maxShotsPerWindow?: number;
  /** How many playable previews are kept; older ones are pruned on write. */
  keepPreviews?: number;
  /** Playable previews one build may push per hour. */
  maxPreviewsPerWindow?: number;
  /**
   * Where a delivered game is stored. Absent in local development and in tests that do
   * not exercise delivery, in which case the submit verb reports itself unavailable
   * rather than pretending to have accepted work.
   */
  gamesStore?: GamesStore;
  /**
   * Read + V4-sign against the games-store bucket (`kits/`, `examples/`). Absent when
   * the bucket is not configured; kit/example downloads then answer 503 rather than
   * inventing an engineRef or a URL.
   */
  objectStore?: GcsObjectStore;
  // Discovery Engine seam; absent means knowledge_query answers 503.
  knowledgeSearch?: QueryKnowledgeFn;
  // Per-round soft cap on knowledge_query mode='answer' calls.
  maxKnowledgeAnswersPerWindow?: number;
  // Per-round soft cap on knowledge_query mode='chunks' calls.
  maxKnowledgeChunksPerWindow?: number;
  /** Deliveries one build may make per hour. */
  maxSubmitsPerWindow?: number;
  /** Shared source-delivery core used by HTTP/MCP and managed harvest. */
  sourceDelivery?: SourceDeliveryService;
  /** Called when a candidate version lands, so the job can move on to the gate. */
  /**
   * Starts whatever verifies a delivery. May answer with what the run cost — the gate
   * trigger reports Cloud Build's own build id, which is booked below so a line on the
   * bill can be traced back to the game that caused it.
   */
  /**
   * Called after a file lands in the staging buffer.
   *
   * Staging is the only moment we learn that a game exists in a form nobody has looked
   * at: an MCP agent uploads its tree a path at a time and the creator sees none of it
   * until a delivery clears the gate minutes later. The publisher behind this assembles
   * whatever is in the buffer and shows it — see `staged-preview.ts`. Deliberately
   * fire-and-forget: the agent is owed its staging receipt whatever the preview does.
   */
  onSourcesStaged?: (input: { issueNumber: number; slug: string; roundGeneration: number }) => void;
  // Queues a replacement draft. Absent when nothing seeds.
  onRegenerateSeed?: (input: { issueNumber: number; steer?: string; log: FastifyRequest['log'] }) => Promise<
    | { ok: true; status: 'pending'; regenerationsRemaining: number }
    | {
        ok: false;
        reason:
          'not_configured' | 'not_found' | 'seed_not_readable' | 'already_delivered' | 'cap_reached' | 'seeding_off';
      }
  >;
  onSourcesDelivered?: (input: {
    issueNumber: number;
    slug: string;
    version: string;
    /**
     * `preview` runs `check:game --preview`. `health` is the operator re-gate.
     * Omitted means the acceptance (publish) gate.
     */
    // `proposal` is the lane where a behavioural-golden change is a finding rather than
    // a refusal — see GateTriggerInput.mode. Kept in step with gate-trigger's union.
    mode?: 'health' | 'preview' | 'proposal';
  }) => Promise<{ buildId?: string; accepted?: boolean } | void> | void;
}

type RejectionReason =
  | 'stopped'
  | 'rate_limited'
  | 'too_many_events'
  | 'too_many_shots'
  /** Self-round sources-delivery budget exhausted; machine-readable for agents. */
  | 'delivery_cap';

const KNOWLEDGE_SCOPES = new Set(['kit', 'editor', 'examples', 'docs']);

// Fail-open: a soft cap degrades to a warning, not an error.
function knowledgeCapWarning(mode: KnowledgeMode, cap: number): KnowledgeQueryResult {
  return {
    mode,
    fallback: false,
    chunks: [],
    repoPaths: [],
    guidance: 'Verify exact API signatures via get_kit_api / read_kit_file rather than prose.',
    truncated: false,
    cached: false,
    warnings: [
      {
        code: 'rate_limited',
        message: `Per-round knowledge_query ${mode} cap reached (${cap}/hour) — try a narrower query or wait.`,
      },
    ],
  };
}

/** Sliding-window limiter keyed by build. The token is the identity, not the IP. */
function isRateLimited(buckets: Map<number, number[]>, key: number, currentTime: number, max: number): boolean {
  const windowMs = 60 * 60 * 1000;
  const hits = (buckets.get(key) ?? []).filter((timestamp) => currentTime - timestamp < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return true;
  }
  hits.push(currentTime);
  buckets.set(key, hits);
  return false;
}

export async function registerAgentChannelRoutes(
  app: FastifyInstance,
  options: AgentChannelOptions = {},
): Promise<void> {
  const store = options.store;
  const agentTokenSecret = options.agentTokenSecret ?? process.env.SUBMISSION_TOKEN_SECRET;
  const now = options.now ?? Date.now;
  const translator = options.translator ?? createTranslatorFromEnv();
  const maxEventsPerBuild = options.maxEventsPerBuild ?? 500;
  const maxEventsPerWindow = options.maxEventsPerWindow ?? 240;
  const maxInboxChecksPerWindow = 600;
  // Screenshots are far heavier than sentences, so they get their own, tighter caps.
  const maxShotsPerBuild = options.maxShotsPerBuild ?? 24;
  const maxShotsPerWindow = options.maxShotsPerWindow ?? 40;
  // Answer costs far more than chunks, hence separate per-mode caps.
  const maxKnowledgeAnswersPerWindow = options.maxKnowledgeAnswersPerWindow ?? 15;
  const maxKnowledgeChunksPerWindow = options.maxKnowledgeChunksPerWindow ?? 30;
  const knowledgeSearch = options.knowledgeSearch;

  // Raw PUT parsers for curl --upload-file (octet-stream / PNG / text).
  const parseRawBuffer = (
    _request: FastifyRequest,
    body: Buffer | string | ArrayBuffer,
    done: (error: Error | null, result?: Buffer) => void,
  ): void => {
    if (Buffer.isBuffer(body)) {
      done(null, body);
      return;
    }
    if (typeof body === 'string') {
      done(null, Buffer.from(body));
      return;
    }
    done(null, Buffer.from(body));
  };
  // Named types only — a '' parser would buffer every untyped request app-wide.
  for (const type of ['application/octet-stream', 'image/png', 'text/plain', 'text/plain; charset=utf-8'] as const) {
    try {
      app.addContentTypeParser(type, { parseAs: 'buffer' }, parseRawBuffer);
    } catch {
      // Duplicate parser from a prior register on this app.
    }
  }
  // A watcher pushes whatever currently builds, so previews arrive on a cadence rather
  // than on the agent's judgement. Only the newest few are worth keeping — each one
  // obsoletes the last — but the hourly allowance is generous, because a build that
  // recompiles every thirty seconds for half an hour is working exactly as intended.
  const keepPreviews = options.keepPreviews ?? 4;
  const maxPreviewsPerWindow = options.maxPreviewsPerWindow ?? 90;
  const eventsByBuild = new Map<number, number[]>();
  const inboxChecksByBuild = new Map<number, number[]>();
  const shotsByBuild = new Map<number, number[]>();
  const previewsByBuild = new Map<number, number[]>();
  const knowledgeAnswersByBuild = new Map<number, number[]>();
  const knowledgeChunksByBuild = new Map<number, number[]>();
  const kitFileStore = options.objectStore ? createKitFileStore(options.objectStore) : null;
  const exampleFileStore = options.objectStore ? createExampleFileStore(options.objectStore) : null;

  function optionalFiniteQuery(raw: string | undefined): number | undefined {
    if (raw === undefined) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }

  function sendExampleFilesError(reply: FastifyReply, error: unknown): FastifyReply | null {
    if (error instanceof ExampleFilesError) {
      const status =
        error.code === 'example_store_unavailable'
          ? 503
          : error.code === 'example_unavailable' || error.code === 'example_file_missing'
            ? 404
            : 400;
      return reply.status(status).send({ error: error.code, message: error.message });
    }
    return null;
  }

  function sendKitFilesError(reply: FastifyReply, error: unknown): FastifyReply | null {
    if (error instanceof KitFilesError) {
      const status =
        error.code === 'kit_store_unavailable'
          ? 503
          : error.code === 'kit_registry_missing' ||
              error.code === 'kit_registry_invalid' ||
              error.code === 'kit_artifact_missing' ||
              error.code === 'kit_file_missing'
            ? 404
            : error.code === 'kit_revision_unsupported'
              ? 409
              : 400;
      return reply.status(status).send({ error: error.code, message: error.message });
    }
    if (error instanceof KitRegistryError) {
      return reply.status(404).send({ error: error.code, message: error.message });
    }
    return null;
  }

  /**
   * Resolves the build a request is about. The token is the whole credential: it
   * carries the issue number, so there is nothing to address in the URL and nothing
   * a caller can point at a build they were not handed.
   *
   * When `allowTerminalReceipt` is set, a capability whose generation is exactly one
   * behind current is accepted as {@link AgentTokenAccess} `terminal_receipt` — used
   * only by the gate-verdict read so an agent can observe the green that closed its
   * round. Every other route keeps the strict active-only check.
   */
  async function resolveBuild(
    request: FastifyRequest,
    reply: FastifyReply,
    options: { allowTerminalReceipt?: boolean } = {},
  ): Promise<{ issueNumber: number; record: SubmissionRecord; access: AgentTokenAccess } | null> {
    if (!store || !agentTokenSecret) {
      reply.status(503).send({ error: 'the build channel is not configured' });
      return null;
    }

    const token = readBearerToken(request.headers.authorization);
    if (!token) {
      reply.status(401).send({ error: 'missing build token' });
      return null;
    }

    let claims;
    try {
      claims = verifyAgentToken(token, agentTokenSecret);
    } catch (error) {
      if (error instanceof InvalidAgentTokenError) {
        reply.status(401).send({ error: error.message || 'invalid build token' });
        return null;
      }
      throw error;
    }

    const issueNumber = claims.jobId;
    const record = await store.getSubmission(issueNumber);
    if (!record) {
      reply.status(404).send({ error: 'unknown build' });
      return null;
    }

    try {
      if (options.allowTerminalReceipt) {
        const access = classifyAgentTokenAccess(claims, record, now());
        return { issueNumber, record, access };
      }
      assertAgentTokenActive(claims, record, now());
      return { issueNumber, record, access: 'active' };
    } catch (error) {
      if (!(error instanceof InvalidAgentTokenError)) throw error;
      // Stale/expired tokens are a strict 401 in every case — including terminal jobs.
      // `publishedAt` (and other stop reasons) are permanent; letting a signature-valid
      // but generation-stale or expired key through would grant indefinite read of
      // sources/inbox plus unguarded inbox/ack writes. The 401 body already is the
      // stop signal ("this build is finished — get a fresh prompt…"). Terminal-receipt
      // reads for a closed round's own gate verdict use allowTerminalReceipt above.
      reply.status(401).send({ error: error.message || 'invalid build token' });
      return null;
    }
  }

  // Auth via ?token= upload capability (no Authorization header).
  async function resolveUploadBuild(
    request: FastifyRequest,
    reply: FastifyReply,
    expectedKind: UploadKind,
  ): Promise<{ issueNumber: number; record: SubmissionRecord; upload: UploadTokenClaims } | null> {
    if (!store || !agentTokenSecret) {
      reply.status(503).send({ error: 'the build channel is not configured' });
      return null;
    }

    const raw =
      typeof (request.query as { token?: unknown })?.token === 'string'
        ? (request.query as { token: string }).token.trim()
        : '';
    if (!raw) {
      reply.status(401).send({ error: 'missing upload token' });
      return null;
    }

    let upload: UploadTokenClaims;
    try {
      upload = verifyUploadToken(raw, agentTokenSecret);
      assertUploadTokenUnexpired(upload, now());
    } catch (error) {
      if (error instanceof InvalidAgentTokenError) {
        reply.status(401).send({ error: error.message || 'invalid upload token' });
        return null;
      }
      throw error;
    }

    if (upload.kind !== expectedKind) {
      reply.status(403).send({ error: `this upload URL is for ${upload.kind}, not ${expectedKind}` });
      return null;
    }

    const issueNumber = upload.jobId;
    const record = await store.getSubmission(issueNumber);
    if (!record) {
      reply.status(404).send({ error: 'unknown build' });
      return null;
    }

    try {
      assertAgentTokenActive(
        { jobId: upload.jobId, roundGeneration: upload.roundGeneration, exp: upload.exp },
        record,
        now(),
      );
    } catch (error) {
      if (error instanceof InvalidAgentTokenError) {
        reply.status(401).send({ error: error.message || 'invalid upload token' });
        return null;
      }
      throw error;
    }

    return { issueNumber, record, upload };
  }

  function stopReason(record: SubmissionRecord): 'abandoned' | 'published' | 'canceled' | 'builder_handoff' | null {
    if (record.abandonedAt) return 'abandoned';
    if (record.publishedAt) return 'published';
    // The operator's cancel. This check is what makes cancellation *mean* something on
    // the Copilot backend: its tasks API has no cancel endpoint, so the whole mechanism
    // is the job being terminal here — a live session reads `control.stop` on its next
    // report and winds down, and anything it sends anyway is rejected below. Before this
    // line, `copilot-backend.cancel` described that behaviour without anything
    // implementing it.
    if (resolveJobState(record) === 'canceled') return 'canceled';
    if (record.builderHandoff && record.builderHandoff.awaitsAgentAck !== false) return 'builder_handoff';
    return null;
  }

  /**
   * First channel activity on a waiting job is the moment it becomes `building`.
   *
   * For self rounds this is the entire state advance — there is no external task to
   * observe. Harmless for platform rounds that are already `building` via the
   * reconciler: `canTransition` refuses a no-op.
   *
   * Returns the effective state after the call. Callers that continue the walk
   * (notably sources → `submitted`) must use this rather than the request-local
   * `record.state`, which is stale the moment we write — a delivery that raced
   * background dispatch while still `queued` used to skip `submitted`, leave the
   * job in `building`, and let the reconciler close the round a generation early.
   */
  async function markBuildingFromChannel(issueNumber: number, record: SubmissionRecord): Promise<JobState> {
    const current = (record.state ?? 'queued') as JobState;
    if (!store) return current;
    if (!canTransition(current, 'building')) {
      // Common case: already `building` (every progress call after the first). The
      // request-local snapshot from resolveBuild is fresh enough — avoid an extra
      // store read on the hot path. Callers that need a post-write snapshot (sources)
      // re-read explicitly.
      return current;
    }
    await store.recordJobTransition(issueNumber, {
      to: 'building',
      at: new Date().toISOString(),
      by: 'agent',
      reason: 'channel_signal',
    });
    return 'building';
  }

  /**
   * Our own verdict on what this build delivered, as the agent needs to hear it.
   *
   * The gate is the step an agent cannot see. It runs after the upload, in our
   * container, against our engine — so a session that delivers and exits learns nothing,
   * and the next round starts from a report nobody read. Carrying the verdict on the
   * channel closes that: `npm run submit` waits on it, and an agent still polling its
   * inbox finds it without being told to look.
   *
   * Read only once something has been delivered. Before that there is nothing to have a
   * verdict about, and this is on the path of an inbox poll that runs at up to 600/hour
   * per build — a store read bought with nothing is a store read not worth making.
   *
   * Best effort: a store that will not answer must not take down the channel an agent
   * uses to report progress and read its creator's messages. Absent reads as "no verdict
   * yet", which is what the agent would have seen a moment earlier anyway.
   */
  async function gateVerdict(record: SubmissionRecord) {
    return readGateVerdict(options.gamesStore, record, (error) =>
      app.log.warn(
        { err: error, issueNumber: record.issueNumber, slug: record.slug },
        'could not read the gate verdict',
      ),
    );
  }

  /**
   * The body every channel call returns: what the creator has asked for, and whether
   * there is any point continuing. `stop` is the one that pays for itself — today an
   * agent keeps building for minutes after a creator hits "stop", because nothing
   * tells it otherwise.
   */
  async function channelState(issueNumber: number, record: SubmissionRecord) {
    const pending: CreatorMessage[] = await store!.listPendingCreatorMessages(issueNumber);
    const reason = stopReason(record);
    const gate = await gateVerdict(record);
    return {
      pending: pending.map((message) => ({ id: message.id, text: message.text, createdAt: message.createdAt })),
      ...(gate ? { gate } : {}),
      control: {
        stop: reason !== null,
        ...(reason ? { reason } : {}),
        ...(record.builderHandoff && record.builderHandoff.awaitsAgentAck !== false
          ? {
              builderHandoff: {
                target: record.builderHandoff.to,
                requestedAt: record.builderHandoff.requestedAt,
                ...(record.builderHandoff.acknowledgedAt
                  ? { acknowledgedAt: record.builderHandoff.acknowledgedAt }
                  : {}),
              } satisfies {
                target: BuilderHandoff['to'];
                requestedAt: string;
                acknowledgedAt?: string;
              },
            }
          : {}),
        // The creator's language, so the agent can write its next update in it.
        locale: record.locale ?? 'en',
        // Whether the one step that makes any of this real has happened yet.
        //
        // Said on every call rather than once in the brief, because the brief is read
        // at the start of a session and the omission happens at the end of it. A live
        // session has been observed doing the whole job, pushing its branch, and
        // stopping — the instruction was there, thousands of tokens ago, and losing to
        // a tool that felt like finishing. This rides along with something the agent
        // is already doing, and it is derived from what we actually stored rather than
        // from anything the session believes about itself.
        delivered: Boolean(record.deliveredVersion || record.previewVersion),
        // Delivering is not finishing. The gate runs *after* the upload, against our
        // engine, and it is the thing that decides whether any of this can be published
        // — so an agent that delivers and stops has handed over a game nobody can ship
        // and will never know why. This is the same trick as `mustDeliver` above: say it
        // on every call, derived from what we stored, rather than once in a brief read
        // thousands of tokens ago.
        ...(gate && !gate.green && gate.status !== 'preview_passed'
          ? {
              mustFixGate:
                gate.status === 'kit_outdated'
                  ? `The gate refused your delivery (${gate.version}) because the Creator Kit is ` +
                    'outdated (`kit_outdated`). Re-run get_kit for a fresh engineRef, then ' +
                    'submit_sources({ fromLatestDelivery: true, mode, kitEngineRef }) — do NOT ' +
                    're-stage or re-upload the whole tree through the model (burns tokens). Only ' +
                    'pass files[] for paths you actually changed for the new kit.'
                  : gate.status === 'preview_failed'
                    ? `The preview check refused your delivery (${gate.version}). Fix typecheck/smoke/build, ` +
                      'then submit_sources again with mode=preview. TRACE.json is not required until mode=publish.'
                    : `The gate ran against your delivery and refused it (${gate.version}). You are not ` +
                      'done: nothing can be published until it passes. Read `gate.report` below — it ends ' +
                      'with the check that stopped the chain — fix the cause in your game, and deliver ' +
                      'again with submit_sources mode=publish (or `npm run submit -- <slug>` in a shell ' +
                      'sandbox). Re-delivering without a fix just stores another version that fails the same way.',
            }
          : {}),
        ...(record.deliveredVersion || record.previewVersion
          ? {}
          : {
              mustDeliver:
                'Nothing has been delivered for this build yet. Pushing a branch is not delivering — ' +
                'call submit_sources with mode=preview at least once (mode=publish to seal, or ' +
                '`npm run submit -- <slug>` in a shell sandbox) before you finish, or this session produces nothing.',
            }),
      },
    };
  }

  /**
   * The fallback for agents that ignore `report_progress`'s textLocalized/locale pair.
   * See localize-intake.ts for why this runs on the write and never on the read, and why
   * it runs for English-reading creators too.
   *
   * Cost is bounded by content: one short sentence, capped at maxEventsPerBuild per
   * build, rather than by how many people are watching.
   */
  async function localizeForCreator(text: string): Promise<IntakeText> {
    return normalizeAtIntake(translator, text, { kind: 'log', maxLength: MAX_EVENT_TEXT });
  }

  // Shared by report_progress and end so the two cannot diverge.
  async function composeCreatorEvent(input: {
    kind: BuildEvent['kind'];
    step?: BuildEvent['step'];
    text: string;
    textLocalized?: string;
    locale?: string;
    progress?: { done: number; total: number };
  }): Promise<Omit<BuildEvent, 'id' | 'createdAt'> | null> {
    const text = sanitizeCreatorText(input.text, { singleLine: true }).slice(0, MAX_EVENT_TEXT);
    if (!text) return null;
    const localized = input.textLocalized
      ? sanitizeCreatorText(input.textLocalized, { singleLine: true }).slice(0, MAX_EVENT_TEXT)
      : '';
    // A localized sentence without a language tag cannot be matched to a reader, so
    // it is dropped rather than shown to someone who may not read it.
    const hasLocalized = Boolean(localized && input.locale);
    // An agent that sends the pair has answered both halves itself and is taken at its
    // word — that is the zero-cost path report_progress asks for. Everything else goes
    // through normalization, which decides what English is rather than assuming `text`
    // already was: agents write in whatever language the conversation is happening in.
    const intake: IntakeText = hasLocalized
      ? { text, textLocalized: localized, locale: input.locale as string }
      : await localizeForCreator(text);
    const progress = input.progress
      ? { done: Math.min(input.progress.done, input.progress.total), total: input.progress.total }
      : undefined;

    return {
      kind: input.kind,
      ...(input.step ? { step: input.step } : {}),
      text: intake.text,
      ...(intake.textLocalized && intake.locale ? { textLocalized: intake.textLocalized, locale: intake.locale } : {}),
      ...(progress ? { progress } : {}),
    };
  }

  // IP ceilings sit above the per-build limiters inside each handler. Agents
  // share a Cloud Run egress IP, so these are generous; the build-keyed checks
  // remain the real abuse control.
  app.post(
    AGENT_CHANNEL_ROUTES.PROGRESS,
    { config: { rateLimit: { max: 300, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;

      const parsed = BuildEventInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      // A rejected report still answers with the creator's messages. Handing back an
      // error and dropping their change request would be the worst of both.
      const reject = async (reason: RejectionReason) =>
        reply.send({ accepted: false, rejected: reason, ...(await channelState(issueNumber, record)) });

      if (stopReason(record)) {
        return reject('stopped');
      }
      if (isRateLimited(eventsByBuild, issueNumber, now(), maxEventsPerWindow)) {
        return reject('rate_limited');
      }
      if ((await store!.countBuildEvents(issueNumber)) >= maxEventsPerBuild) {
        return reject('too_many_events');
      }

      const event = await composeCreatorEvent(parsed.data);
      if (!event) {
        return reply.status(400).send({ error: 'text is required' });
      }

      const stored = await store!.appendBuildEvent(issueNumber, event);
      const stateAfterSignal = await markBuildingFromChannel(issueNumber, record);
      options.onEvent?.(issueNumber);

      return reply.send({
        accepted: true,
        event: stored,
        ...(await channelState(issueNumber, { ...record, state: stateAfterSignal })),
      });
    },
  );

  // Retired: base64 PNG in JSON burned model output tokens and was unsafe at real sizes.
  app.post(
    AGENT_CHANNEL_ROUTES.SHOT,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (_request, reply) => {
      return reply.status(410).send({ error: RETIRED_BASE64_SHOT_REASON });
    },
  );

  // Mint a short-lived signed PUT URL; agent curls the PNG (no base64 in tool args).
  app.post(
    AGENT_CHANNEL_ROUTES.SHOT_UPLOAD_URL,
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;
      if (!agentTokenSecret) {
        return reply.status(503).send({ error: 'the build channel is not configured' });
      }

      const parsed = ShotUploadUrlInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      if (stopReason(record)) {
        return reply.send({
          accepted: false,
          rejected: 'stopped',
          ...(await channelState(issueNumber, record)),
        });
      }

      const labelRaw = parsed.data.label ?? parsed.data.caption;
      const label = labelRaw ? sanitizeCreatorText(labelRaw, { singleLine: true }).slice(0, MAX_SHOT_LABEL) : '';
      const generation = record.roundGeneration ?? 1;
      const ttlSeconds = DEFAULT_UPLOAD_URL_TTL_SECONDS;
      // One clock read: advertised expiresAt must match the signed exp.
      const issuedAt = now();
      const token = mintUploadToken(agentTokenSecret, {
        jobId: issueNumber,
        roundGeneration: generation,
        kind: 'screenshot',
        ...(label ? { label } : {}),
        now: issuedAt,
        ttlSeconds,
      });
      const expiresAt = new Date(issuedAt + ttlSeconds * 1000).toISOString();
      const url = `${canonicalAppBaseUrl()}${AGENT_CHANNEL_ROUTES.SHOT_UPLOAD}?token=${encodeURIComponent(token)}`;
      return reply.send({
        accepted: true,
        url,
        expiresAt,
        expiresInSeconds: ttlSeconds,
        upload: uploadCurlCommand(url, 'shot.png', 'image/png'),
        maxBytes: maxShotBytes,
        ...(await channelState(issueNumber, record)),
      });
    },
  );

  // Raw PNG PUT for screenshot_upload_url (no base64).
  app.put(
    AGENT_CHANNEL_ROUTES.SHOT_UPLOAD,
    {
      bodyLimit: maxShotBytes + 1024,
      config: { rateLimit: { max: 120, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      const resolved = await resolveUploadBuild(request, reply, 'screenshot');
      if (!resolved) return reply;
      const { issueNumber, record, upload } = resolved;

      const reject = async (reason: RejectionReason) =>
        reply.send({ accepted: false, rejected: reason, ...(await channelState(issueNumber, record)) });

      if (stopReason(record)) {
        return reject('stopped');
      }
      if (isRateLimited(shotsByBuild, issueNumber, now(), maxShotsPerWindow)) {
        return reject('rate_limited');
      }
      if ((await store!.countBuildShots(issueNumber)) >= maxShotsPerBuild) {
        return reject('too_many_shots');
      }

      const body = request.body;
      const bytes = Buffer.isBuffer(body)
        ? body
        : typeof body === 'string'
          ? Buffer.from(body)
          : body instanceof Uint8Array
            ? Buffer.from(body)
            : null;
      if (!bytes || bytes.length === 0) {
        return reply.status(400).send({ error: 'png body is required' });
      }
      if (bytes.length > maxShotBytes) {
        return reply.status(413).send({ error: 'screenshot is too large' });
      }
      if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        return reply.status(400).send({ error: 'not a PNG' });
      }

      const label = upload.label
        ? sanitizeCreatorText(upload.label, { singleLine: true }).slice(0, MAX_SHOT_LABEL)
        : '';

      const stored = await store!.appendBuildShot(issueNumber, {
        data: bytes.toString('base64'),
        ...(label ? { label } : {}),
      });
      options.onEvent?.(issueNumber);

      return reply.send({
        accepted: true,
        shot: { id: stored.id, createdAt: stored.createdAt, ...(label ? { label } : {}) },
        ...(await channelState(issueNumber, (await store!.getSubmission(issueNumber)) ?? record)),
      });
    },
  );

  /**
   * A playable build of the game, pushed before any commit.
   *
   * The measured problem: `npm run create` leaves a playable starter on disk about a
   * minute into a build, and the agent does not attempt its first build until minute
   * eight or eleven. For those ten minutes something runnable exists and nobody looks at
   * it, while the creator watches a status page. This is the route that closes that gap,
   * and it is meant to be driven by a watcher rather than by the agent's judgement —
   * whatever currently compiles, as often as it changes.
   *
   * What arrives is a self-contained offline HTML document, the same shape the site
   * already serves for a published game. Two things are checked rather than trusted: the
   * decoded size, and that the bytes actually open as an HTML document. Everything else
   * about it is unreviewed agent output, so the route that serves it back sandboxes it.
   */
  app.post(
    AGENT_CHANNEL_ROUTES.PREVIEW,
    { config: { rateLimit: { max: 200, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;

      const parsed = BuildPreviewInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      const reject = async (reason: RejectionReason) =>
        reply.send({ accepted: false, rejected: reason, ...(await channelState(issueNumber, record)) });

      if (stopReason(record)) {
        return reject('stopped');
      }
      if (isRateLimited(previewsByBuild, issueNumber, now(), maxPreviewsPerWindow)) {
        return reject('rate_limited');
      }

      const bytes = Buffer.from(parsed.data.html, 'base64');
      if (bytes.length > MAX_BUILD_PREVIEW_BYTES) {
        return reply.status(413).send({ error: 'preview is too large' });
      }
      // The equivalent of the PNG signature check on shots. It proves nothing about what
      // the document does — only that serving it as text/html is not a category error.
      const head = bytes.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
      if (!head.startsWith('<!doctype html') && !head.startsWith('<html')) {
        return reply.status(400).send({ error: 'not an HTML document' });
      }

      const label = parsed.data.label
        ? sanitizeCreatorText(parsed.data.label, { singleLine: true }).slice(0, MAX_PREVIEW_LABEL)
        : '';
      const labelLocalized = parsed.data.labelLocalized
        ? sanitizeCreatorText(parsed.data.labelLocalized, { singleLine: true }).slice(0, MAX_PREVIEW_LABEL)
        : '';
      const hasLocalized = Boolean(labelLocalized && parsed.data.locale);

      const stored = await store!.appendBuildPreview(issueNumber, {
        data: bytes.toString('base64'),
        ...(parsed.data.slug ? { slug: parsed.data.slug } : {}),
        ...(label ? { label } : {}),
        ...(hasLocalized ? { labelLocalized, locale: parsed.data.locale } : {}),
      });
      // Pruning after the write, not before: a push that succeeds and then fails to tidy up
      // has still delivered the thing the creator is waiting for.
      await store!.pruneBuildPreviews(issueNumber, keepPreviews).catch(() => 0);
      options.onEvent?.(issueNumber);

      return reply.send({
        accepted: true,
        preview: { id: stored.id, createdAt: stored.createdAt, ...(stored.slug ? { slug: stored.slug } : {}) },
        ...(await channelState(issueNumber, record)),
      });
    },
  );

  /**
   * File-by-file staging before a delivery.
   *
   * MCP clients (Claude Chat especially) often fail mid-serialization when emitting a
   * huge `files[]` in one tool call. Staging lets them PUT one path at a time into a
   * job-scoped buffer, then finalize with `fromStaged=true` — the gate still sees one
   * assembled upload; only the wire shape changes.
   */
  app.put(
    AGENT_CHANNEL_ROUTES.SOURCES_STAGE,
    {
      config: { rateLimit: { max: 300, timeWindow: '1 hour' } },
      bodyLimit: 1_500_000,
    },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;

      if (!options.gamesStore) {
        return reply.status(503).send({ error: 'delivery is not configured on this deployment' });
      }
      if (stopReason(record)) {
        return reply.send({ accepted: false, rejected: 'stopped', ...(await channelState(issueNumber, record)) });
      }

      const parsed = StageSourceInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      const slug = record.slug ?? parsed.data.slug;
      if (!slug) {
        return reply.status(400).send({
          error: 'slug is required before staging — send the slug from get_brief / start',
        });
      }
      if (record.slug && parsed.data.slug && record.slug !== parsed.data.slug) {
        return reply.status(409).send({ error: `this build delivers to ${record.slug}, not ${parsed.data.slug}` });
      }
      if (!record.slug && store) {
        await store.setSubmissionSlug(issueNumber, slug);
      }

      const roundGeneration = store
        ? ((await store.ensureRoundGeneration(issueNumber)) ?? record.roundGeneration ?? 1)
        : (record.roundGeneration ?? 1);

      try {
        const staged = await options.gamesStore.putStagedSourceFile({
          slug,
          issueNumber,
          roundGeneration,
          path: parsed.data.path,
          content: parsed.data.content,
        });
        // Staging is channel activity — without this, a long stage_source_file loop
        // (Claude Chat's preferred path) looks quiet after 15m and Studio wrongly offers
        // a platform handoff while the agent is still uploading files. Also busts the
        // status cache so a prior submit auto-end does not keep stall=ended on screen.
        await markBuildingFromChannel(issueNumber, record);
        await store?.touchLastAgentSignalAt(issueNumber, undefined, { key: 'staging_sources' });
        options.onEvent?.(issueNumber);
        // After the buffer is durable, so the assembly it schedules reads this file too.
        options.onSourcesStaged?.({ issueNumber, slug, roundGeneration });
        const hint = largeSourceFileHint(staged.path, staged.bytes, parsed.data.content);
        const manifestHint = gameManifestHint(staged.path, parsed.data.content);
        const advisories = await computeStageAdvisories({
          kitFileStore,
          gamesStore: options.gamesStore,
          store: store!,
          record,
          slug,
          issueNumber,
          roundGeneration,
          engineRef: record.roundKitEngineRef,
          path: staged.path,
          content: parsed.data.content,
        });
        return reply.send({
          accepted: true,
          path: staged.path,
          bytes: staged.bytes,
          staged: {
            files: staged.files,
            totalBytes: staged.totalBytes,
            maxBytes: staged.maxBytes,
            maxFiles: staged.maxFiles,
            updatedAt: staged.updatedAt,
          },
          ...(manifestHint ? { manifestHint } : {}),
          ...(hint ? { hint } : {}),
          ...(advisories.typecheckHint ? { typecheckHint: advisories.typecheckHint } : {}),
          ...(advisories.audioHint ? { audioHint: advisories.audioHint } : {}),
          ...(await channelState(issueNumber, (await store!.getSubmission(issueNumber)) ?? record)),
        });
      } catch (error) {
        if (error instanceof InvalidUploadError) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  // Raw-body stage PUT for stage_upload_url (same validation as JSON stage).
  app.put(
    AGENT_CHANNEL_ROUTES.SOURCES_STAGE_UPLOAD,
    {
      config: { rateLimit: { max: 300, timeWindow: '1 hour' } },
      bodyLimit: 1_000_000 + 1024,
    },
    async (request, reply) => {
      const resolved = await resolveUploadBuild(request, reply, 'stage');
      if (!resolved) return reply;
      const { issueNumber, record, upload } = resolved;

      if (!options.gamesStore) {
        return reply.status(503).send({ error: 'delivery is not configured on this deployment' });
      }
      if (stopReason(record)) {
        return reply.send({ accepted: false, rejected: 'stopped', ...(await channelState(issueNumber, record)) });
      }

      const path = upload.path?.trim() ?? '';
      if (!path) {
        return reply.status(400).send({ error: 'path is required' });
      }

      const body = request.body;
      const bytes = Buffer.isBuffer(body)
        ? body
        : typeof body === 'string'
          ? Buffer.from(body)
          : body instanceof Uint8Array
            ? Buffer.from(body)
            : null;
      if (!bytes) {
        return reply.status(400).send({ error: 'file body is required' });
      }
      if (bytes.length > 1_000_000) {
        return reply
          .status(413)
          .send({ error: `file too large: ${path} is ${bytes.length} bytes (max 1000000 per file)` });
      }
      const content = bytes.toString('utf8');

      const slug = record.slug;
      if (!slug) {
        return reply.status(400).send({
          error: 'slug is required before staging — send the slug from get_brief / start',
        });
      }

      const roundGeneration = store
        ? ((await store.ensureRoundGeneration(issueNumber)) ?? record.roundGeneration ?? 1)
        : (record.roundGeneration ?? 1);

      try {
        const staged = await options.gamesStore.putStagedSourceFile({
          slug,
          issueNumber,
          roundGeneration,
          path,
          content,
        });
        await markBuildingFromChannel(issueNumber, record);
        await store?.touchLastAgentSignalAt(issueNumber, undefined, { key: 'staging_sources' });
        options.onEvent?.(issueNumber);
        options.onSourcesStaged?.({ issueNumber, slug, roundGeneration });
        const hint = largeSourceFileHint(staged.path, staged.bytes, content);
        const manifestHint = gameManifestHint(staged.path, content);
        const advisories = await computeStageAdvisories({
          kitFileStore,
          gamesStore: options.gamesStore,
          store: store!,
          record,
          slug,
          issueNumber,
          roundGeneration,
          engineRef: record.roundKitEngineRef,
          path: staged.path,
          content,
        });
        return reply.send({
          accepted: true,
          path: staged.path,
          bytes: staged.bytes,
          staged: {
            files: staged.files,
            totalBytes: staged.totalBytes,
            maxBytes: staged.maxBytes,
            maxFiles: staged.maxFiles,
            updatedAt: staged.updatedAt,
          },
          ...(manifestHint ? { manifestHint } : {}),
          ...(hint ? { hint } : {}),
          ...(advisories.typecheckHint ? { typecheckHint: advisories.typecheckHint } : {}),
          ...(advisories.audioHint ? { audioHint: advisories.audioHint } : {}),
          ...(await channelState(issueNumber, (await store!.getSubmission(issueNumber)) ?? record)),
        });
      } catch (error) {
        if (error instanceof InvalidUploadError) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  // Patch into staging. Base is staged → delivery → seed. Keep every edit that applies; report failed[] for the rest.
  app.post(
    AGENT_CHANNEL_ROUTES.SOURCES_STAGE_PATCH,
    {
      config: { rateLimit: { max: 300, timeWindow: '1 hour' } },
      bodyLimit: 500_000,
    },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;

      if (!options.gamesStore) {
        return reply.status(503).send({ error: 'delivery is not configured on this deployment' });
      }
      if (stopReason(record)) {
        return reply.send({ accepted: false, rejected: 'stopped', ...(await channelState(issueNumber, record)) });
      }

      const parsed = StageSourcePatchInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      const slug = record.slug ?? parsed.data.slug;
      if (!slug) {
        return reply.status(400).send({
          error: 'slug is required before patching — send the slug from get_brief / start',
        });
      }
      if (record.slug && parsed.data.slug && record.slug !== parsed.data.slug) {
        return reply.status(409).send({ error: `this build delivers to ${record.slug}, not ${parsed.data.slug}` });
      }
      if (!record.slug && store) {
        await store.setSubmissionSlug(issueNumber, slug);
      }

      const roundGeneration = store
        ? ((await store.ensureRoundGeneration(issueNumber)) ?? record.roundGeneration ?? 1)
        : (record.roundGeneration ?? 1);

      const specs: PatchFileSpec[] = parsed.data.files
        ? parsed.data.files
        : [
            {
              path: parsed.data.path!,
              old: parsed.data.old,
              new: parsed.data.new,
              patches: parsed.data.patches,
              patch: parsed.data.patch,
            },
          ];

      try {
        const version = await resolveRoundBaseVersion(store!, record, slug);
        const prepared: Array<{
          path: string;
          content: string;
          replacements: number;
          applied: number[];
          baseFrom: PatchBaseFrom;
        }> = [];
        const failed: PatchFailure[] = [];
        for (const spec of specs) {
          const base = await resolvePatchBase({
            gamesStore: options.gamesStore,
            version,
            record,
            slug,
            issueNumber,
            roundGeneration,
            path: spec.path,
          });
          if (!base) {
            const error =
              `cannot patch ${spec.path}: no base content in staging, the latest delivery, or the seed — ` +
              'stage_source_file the full file first (or get_sources / get_seed), then patch';
            for (let i = 0; i < patchEditCount(spec); i++) {
              failed.push({ path: spec.path, index: i, error });
            }
            continue;
          }
          const patched = applyPatchFileBestEffort(base.content, spec);
          failed.push(...patched.failed);
          if (patched.applied.length === 0) continue;
          prepared.push({
            path: spec.path,
            content: patched.content,
            replacements: patched.replacements,
            applied: patched.applied,
            baseFrom: base.baseFrom,
          });
        }

        let staged;
        const files: Array<{ path: string; bytes: number; replacements: number; baseFrom: PatchBaseFrom }> = [];
        for (const item of prepared) {
          try {
            staged = await options.gamesStore.putStagedSourceFile({
              slug,
              issueNumber,
              roundGeneration,
              path: item.path,
              content: item.content,
            });
            files.push({
              path: staged.path,
              bytes: staged.bytes,
              replacements: item.replacements,
              baseFrom: item.baseFrom,
            });
          } catch (error) {
            if (error instanceof InvalidUploadError) {
              for (const index of item.applied) {
                failed.push({ path: item.path, index, error: error.message });
              }
              continue;
            }
            throw error;
          }
        }

        if (files.length === 0) {
          return reply.status(400).send({
            error: failed[0]?.error ?? 'no edits applied',
            accepted: false,
            replacements: 0,
            failed,
          });
        }
        await markBuildingFromChannel(issueNumber, record);
        await store?.touchLastAgentSignalAt(issueNumber, undefined, { key: 'staging_sources' });
        options.onEvent?.(issueNumber);
        options.onSourcesStaged?.({ issueNumber, slug, roundGeneration });

        let hint: string | null = null;
        let manifestHint: string | null = null;
        for (const item of prepared) {
          hint ??= largeSourceFileHint(item.path, Buffer.byteLength(item.content, 'utf8'), item.content);
          manifestHint ??= gameManifestHint(item.path, item.content);
        }
        const tsFile = [...prepared].reverse().find((item) => item.path.endsWith('.ts') || item.path.endsWith('.tsx'));
        const gameJson = prepared.find((item) => item.path === 'GAME.json');
        const typecheckHint = tsFile
          ? (
              await computeStageAdvisories({
                kitFileStore,
                gamesStore: options.gamesStore,
                store: store!,
                record,
                slug,
                issueNumber,
                roundGeneration,
                engineRef: record.roundKitEngineRef,
                path: tsFile.path,
                content: tsFile.content,
              })
            ).typecheckHint
          : undefined;
        const audioHint = gameJson
          ? (
              await computeStageAdvisories({
                kitFileStore,
                gamesStore: options.gamesStore,
                store: store!,
                record,
                slug,
                issueNumber,
                roundGeneration,
                engineRef: record.roundKitEngineRef,
                path: gameJson.path,
                content: gameJson.content,
              })
            ).audioHint
          : undefined;

        const first = files[0]!;
        return reply.send({
          accepted: true,
          path: first.path,
          bytes: first.bytes,
          replacements: files.reduce((sum, file) => sum + file.replacements, 0),
          baseFrom: first.baseFrom,
          files,
          ...(failed.length > 0 ? { incomplete: true, failed } : {}),
          staged: {
            files: staged!.files,
            totalBytes: staged!.totalBytes,
            maxBytes: staged!.maxBytes,
            maxFiles: staged!.maxFiles,
            updatedAt: staged!.updatedAt,
          },
          ...(manifestHint ? { manifestHint } : {}),
          ...(hint ? { hint } : {}),
          ...(typecheckHint ? { typecheckHint } : {}),
          ...(audioHint ? { audioHint } : {}),
          ...(await channelState(issueNumber, (await store!.getSubmission(issueNumber)) ?? record)),
        });
      } catch (error) {
        if (error instanceof SourcePatchError || error instanceof InvalidUploadError) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  app.get(
    AGENT_CHANNEL_ROUTES.SOURCES_STAGE,
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;

      if (!options.gamesStore) {
        return reply.status(503).send({ error: 'delivery is not configured on this deployment' });
      }
      if (!record.slug) {
        return reply.send({
          files: [],
          totalBytes: 0,
          maxBytes: MAX_UPLOAD_BYTES,
          maxFiles: MAX_UPLOAD_FILES,
          updatedAt: null,
        });
      }

      const roundGeneration = store
        ? ((await store.ensureRoundGeneration(issueNumber)) ?? record.roundGeneration ?? 1)
        : (record.roundGeneration ?? 1);
      const staged = await options.gamesStore.listStagedSources({
        slug: record.slug,
        issueNumber,
        roundGeneration,
      });
      return reply.send(staged);
    },
  );

  // POST rather than DELETE: MCP inject + many clients are unreliable with DELETE bodies,
  // and selective clear needs a paths[] payload.
  app.post(
    AGENT_CHANNEL_ROUTES.SOURCES_STAGE_CLEAR,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;

      if (!options.gamesStore) {
        return reply.status(503).send({ error: 'delivery is not configured on this deployment' });
      }
      if (!record.slug) {
        return reply.send({ accepted: true, cleared: 0 });
      }

      const body = (request.body ?? {}) as { paths?: unknown };
      const paths = Array.isArray(body.paths)
        ? body.paths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
        : undefined;

      const roundGeneration = store
        ? ((await store.ensureRoundGeneration(issueNumber)) ?? record.roundGeneration ?? 1)
        : (record.roundGeneration ?? 1);

      try {
        const { cleared } = await options.gamesStore.clearStagedSources({
          slug: record.slug,
          issueNumber,
          roundGeneration,
          ...(paths?.length ? { paths } : {}),
        });
        return reply.send({ accepted: true, cleared });
      } catch (error) {
        if (error instanceof InvalidUploadError) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  /**
   * Stages a tombstone for one path — the explicit alternative to overwriting a file
   * with empty content, which delivers a live empty file rather than removing it.
   * `submit_sources({ fromStaged: true })` drops the path from the delivered set
   * instead of carrying forward whatever the last delivery had there.
   */
  app.post(
    AGENT_CHANNEL_ROUTES.SOURCES_STAGE_DELETE,
    { config: { rateLimit: { max: 300, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;

      if (!options.gamesStore) {
        return reply.status(503).send({ error: 'delivery is not configured on this deployment' });
      }
      if (stopReason(record)) {
        return reply.send({ accepted: false, rejected: 'stopped', ...(await channelState(issueNumber, record)) });
      }
      if (!record.slug) {
        return reply
          .status(400)
          .send({ error: 'slug is required before staging — send the slug from get_brief / start' });
      }

      const parsed = DeleteSourceInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      const roundGeneration = store
        ? ((await store.ensureRoundGeneration(issueNumber)) ?? record.roundGeneration ?? 1)
        : (record.roundGeneration ?? 1);

      try {
        const staged = await options.gamesStore.deleteStagedSourceFile({
          slug: record.slug,
          issueNumber,
          roundGeneration,
          path: parsed.data.path,
        });
        await markBuildingFromChannel(issueNumber, record);
        await store?.touchLastAgentSignalAt(issueNumber, undefined, { key: 'staging_sources' });
        options.onEvent?.(issueNumber);
        options.onSourcesStaged?.({ issueNumber, slug: record.slug, roundGeneration });
        return reply.send({
          accepted: true,
          path: staged.path,
          staged: {
            files: staged.files,
            totalBytes: staged.totalBytes,
            maxBytes: staged.maxBytes,
            maxFiles: staged.maxFiles,
            updatedAt: staged.updatedAt,
          },
          ...(await channelState(issueNumber, (await store!.getSubmission(issueNumber)) ?? record)),
        });
      } catch (error) {
        if (error instanceof InvalidUploadError) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  /**
   * Deliver the game.
   *
   * This is what replaces "open a pull request and wait for a human to merge it". The
   * agent uploads its own sources; we store them as an immutable candidate version and
   * run our own gate against them. Two properties are worth being explicit about:
   *
   * - The slug is bound to the **job**, and the job is bound to the token. The token
   *   itself carries only the job id, so the first delivery does name its own slug —
   *   but that slug is persisted onto the job, and every later delivery on the same
   *   token is checked against it. An agent therefore cannot deliver into a game it was
   *   not dispatched for, and cannot change its mind about which game it is building.
   * - Nothing here trusts the upload. Paths are validated against the delivery contract
   *   before a byte is written, and the bundle and media that eventually ship are built
   *   by our gate from these sources rather than accepted from the agent.
   */
  app.post(
    AGENT_CHANNEL_ROUTES.SOURCES,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;

      if (!options.gamesStore) {
        return reply.status(503).send({ error: 'delivery is not configured on this deployment' });
      }

      const parsed = BuildSourcesInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      // Own files[] only, before fromStaged/fromLatestDelivery overlay in a carried-forward one.
      for (const file of parsed.data.files ?? []) {
        const indexHtmlReason = forbiddenIndexHtmlWriteReason(file.path, file.content);
        if (indexHtmlReason) return reply.status(400).send({ error: indexHtmlReason });
      }

      if (record.slug && record.slug !== parsed.data.slug) {
        return reply.status(409).send({ error: `this build delivers to ${record.slug}, not ${parsed.data.slug}` });
      }
      const slug = record.slug ?? parsed.data.slug;

      try {
        // Explicit mode wins. Omitting mode defaults to publish — except
        // fromLatestDelivery, which reuses the previous candidate's lane so a
        // kit_outdated preview recovery does not suddenly demand TRACE/PLAYTEST.
        let mode: DeliveryMode | undefined =
          parsed.data.mode === 'preview' || parsed.data.mode === 'publish' ? parsed.data.mode : undefined;
        const roundGeneration = store
          ? ((await store.ensureRoundGeneration(issueNumber)) ?? record.roundGeneration ?? 1)
          : (record.roundGeneration ?? 1);

        let files = parsed.data.files ?? [];
        if (parsed.data.fromLatestDelivery) {
          const version = record.previewVersion ?? record.deliveredVersion;
          if (!version) {
            return reply.status(400).send({
              error: 'fromLatestDelivery=true but this job has no candidate yet — deliver files[] or fromStaged first',
            });
          }
          const manifest = await options.gamesStore.getManifest(slug, version);
          if (!manifest) {
            return reply.status(502).send({ error: 'the latest delivery could not be read back' });
          }
          if (!mode) {
            mode = manifest.deliveryMode === 'preview' ? 'preview' : 'publish';
          }
          const loaded = await Promise.all(
            manifest.sourceFiles.map(async (path) => ({
              path,
              content: await options.gamesStore!.getSourceFile(slug, version, path),
            })),
          );
          const missing = loaded.filter((file) => file.content === null).map((file) => file.path);
          if (missing.length > 0) {
            request.log.error({ slug, version, missing }, 'latest delivery missing files its manifest lists');
            return reply.status(502).send({ error: 'the latest delivery could not be read back' });
          }
          // Inline files win on path collision so kit_outdated / small fixes overlay without
          // re-uploading the whole tree through the model.
          const byPath = new Map<string, string>();
          for (const file of loaded) byPath.set(file.path, file.content as string);
          for (const file of files) byPath.set(file.path, file.content);
          files = [...byPath.entries()].map(([path, content]) => ({ path, content }));
        } else if (parsed.data.fromStaged) {
          const staged = await options.gamesStore.getStagedSourceFiles({
            slug,
            issueNumber,
            roundGeneration,
          });
          if (staged.length === 0 && files.length === 0) {
            return reply.status(400).send({
              error:
                'fromStaged=true but the staging buffer is empty — call stage_source_file / patch_source_file ' +
                'for each changed path first, or pass files[] inline',
            });
          }
          // Overlay matches the live staged preview: staged (plus inline) over the latest
          // delivery over the seed. A one-file patch_source_file (or a partial stage) can
          // therefore submit a complete tree without re-uploading unchanged paths.
          let delivered: Array<{ path: string; content: string }> = [];
          const version = await resolveRoundBaseVersion(store!, record, slug);
          if (version) {
            const manifest = await options.gamesStore.getManifest(slug, version);
            if (!manifest) {
              return reply.status(502).send({ error: 'the latest delivery could not be read back' });
            }
            const loaded = await Promise.all(
              manifest.sourceFiles.map(async (path) => ({
                path,
                content: await options.gamesStore!.getSourceFile(slug, version!, path),
              })),
            );
            // Fail closed like fromLatestDelivery — a hole in the base would let a one-file
            // patch assemble a tree missing paths the manifest still claims exist.
            const missing = loaded.filter((file) => file.content === null).map((file) => file.path);
            if (missing.length > 0) {
              request.log.error({ slug, version, missing }, 'latest delivery missing files its manifest lists');
              return reply.status(502).send({ error: 'the latest delivery could not be read back' });
            }
            delivered = loaded.map((file) => ({ path: file.path, content: file.content as string }));
          }
          const overlay = overlayGameSources({
            staged: [...staged, ...files],
            ...(delivered.length ? { delivered } : {}),
            ...(record.seed?.files ? { seed: record.seed.files } : {}),
          });
          files = Object.entries(overlay).map(([path, content]) => ({ path, content }));
        }
        mode ??= 'publish';

        if (!options.sourceDelivery) {
          return reply.status(503).send({ error: 'delivery is not configured on this deployment' });
        }
        const delivery = await options.sourceDelivery.deliver({
          issueNumber,
          slug,
          files,
          mode,
          bindSlug: true,
          ...(parsed.data.kitEngineRef ? { kitEngineRef: parsed.data.kitEngineRef } : {}),
          ...(record.dispatch?.backend || record.builder
            ? { backend: record.dispatch?.backend ?? record.builder }
            : {}),
        });
        if (!delivery.accepted) {
          return reply.send({
            accepted: false,
            rejected: delivery.rejected,
            ...(delivery.rejected === 'delivery_cap'
              ? {
                  reason: 'self_build_delivery_cap',
                  deliveryCap: delivery.deliveryCap,
                  deliveriesUsed: delivery.deliveriesUsed,
                }
              : {}),
            ...(await channelState(issueNumber, (await store!.getSubmission(issueNumber)) ?? record)),
          });
        }
        const { version, buildId, gateStarted } = delivery;
        // Staging is spent once the candidate is written — clear so the next iterate
        // starts clean and a half-edited buffer cannot leak into a later round.
        if (parsed.data.fromStaged) {
          await options.gamesStore.clearStagedSources({ slug, issueNumber, roundGeneration }).catch(() => {});
        }

        const fresh = store ? ((await store.getSubmission(issueNumber)) ?? record) : record;
        return reply.send({
          accepted: true,
          mode,
          delivery: { slug, version },
          // True when Cloud Build accepted the create (build id and/or accepted:true).
          // False only when the trigger was missing or failed — not when the id was
          // unparseable from an otherwise successful create.
          gateStarted,
          ...(buildId ? { buildId } : {}),
          ...(await channelState(issueNumber, fresh)),
        });
      } catch (error) {
        if (error instanceof SourceDeliveryValidationError) {
          return reply.status(400).send({ error: error.message, reason: error.reason });
        }
        // A rejected upload is the agent's to fix, so the reason goes back in full. This
        // is the one place a 400 body is worth writing carefully: the alternative is an
        // agent burning a session guessing which file was refused.
        if (error instanceof InvalidUploadError) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  /**
   * Hands a build back the sources it should continue from.
   *
   * The channel was upload-only, and that quietly made the agent's *branch* the real
   * home of a game: a follow-up session could only continue the work if it happened to
   * land on the same branch, and when it did not — which is what happens whenever the
   * branch is unknown at resume time — the creator's game started again from nothing.
   * The store already holds every delivered version, immutably; this is the read that
   * makes it the source of truth rather than a copy nobody can get back.
   *
   * Prefer the job's own latest candidate — previewVersion first (mode=preview may be
   * the only upload so far, or a fix after a red publish), then deliveredVersion. A new
   * sibling round inherits the newest eligible sibling delivery before the live
   * publication. Without that, `npm run restore` reports nothing to restore and the
   * agent rebuilds a stranger's game instead of revising what the creator played.
   *
   * Scoped to the job's own game by the same token that authorizes its delivery, so a
   * build can restore what it (or its published predecessor) delivered and nothing else.
   */
  app.get(
    AGENT_CHANNEL_ROUTES.SOURCES,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { record } = resolved;

      if (!options.gamesStore) {
        return reply.status(503).send({ error: 'delivery is not configured on this deployment' });
      }

      const slug = record.slug;
      const version = slug ? await resolveRoundBaseVersion(store!, record, slug) : null;

      // Round 0 arrives here, not through a verb of its own: one read for every round.
      if (slug && !version && (record.seed?.files.length ?? 0) > 0) {
        const seed = record.seed!;
        return reply.send({
          delivery: null,
          origin: 'seed',
          files: seed.files.map((file) => ({ path: file.path, content: file.content })),
          references: seed.references,
          notes: seed.notes ?? null,
          ...seedPayload(record),
        });
      }

      // Nothing drafted and nothing delivered; seedStatus says whether to wait.
      if (!slug || !version) {
        return reply.send({ delivery: null, origin: null, files: [], ...seedPayload(record) });
      }

      const manifest = await options.gamesStore.getManifest(slug, version);
      if (!manifest) {
        request.log.error(
          { slug, version },
          'delivered version has no manifest — the store lost a version a job still points at',
        );
        return reply.status(502).send({ error: 'the delivered version could not be read back' });
      }

      const files = await Promise.all(
        manifest.sourceFiles.map(async (path) => ({
          path,
          content: await options.gamesStore!.getSourceFile(slug, version, path),
        })),
      );
      // A manifest listing a file the bucket does not have is a broken version, not a
      // partial one. Handing back a game with holes would have the agent "restore" a
      // deletion it never made.
      const missing = files.filter((file) => file.content === null).map((file) => file.path);
      if (missing.length > 0) {
        request.log.error({ slug, version, missing }, 'delivered version is missing files its manifest lists');
        return reply.status(502).send({ error: 'the delivered version could not be read back' });
      }

      return reply.send({
        delivery: { slug, version },
        origin: 'delivery',
        files,
      });
    },
  );

  // Collect without reporting. Deliberately does NOT mark messages delivered — an
  // agent that reads a request and then crashes must not lose it. Acking is explicit.
  app.get(
    AGENT_CHANNEL_ROUTES.INBOX,
    { config: { rateLimit: { max: 600, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;

      if (isRateLimited(inboxChecksByBuild, issueNumber, now(), maxInboxChecksPerWindow)) {
        return reply.status(429).send({ error: 'too many inbox checks' });
      }

      return reply.send(await channelState(issueNumber, record));
    },
  );

  // The creator conversation, windowed — inbox serves the unacked tail, this the record.
  app.get(
    AGENT_CHANNEL_ROUTES.TRANSCRIPT,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;

      const query = request.query as { cursor?: string; limit?: string };
      const transcript = await loadBuildTranscript(store!, record, {
        ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
        ...(optionalFiniteQuery(query.limit) !== undefined ? { limit: optionalFiniteQuery(query.limit) } : {}),
      });
      return reply.send({ ...transcript, ...(await channelState(issueNumber, record)) });
    },
  );

  app.post(
    AGENT_CHANNEL_ROUTES.INBOX_ACK,
    { config: { rateLimit: { max: 600, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;

      const parsed = AckRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      await store!.markCreatorMessagesDelivered(issueNumber, parsed.data.ids);
      options.onEvent?.(issueNumber);
      return reply.send({ ok: true, ...(await channelState(issueNumber, record)) });
    },
  );

  /**
   * Agent declares it is finished iterating this round (MCP `end`).
   *
   * Does not close the job or bump generation — that is the creator's handoff / gate
   * green. Sets `agentEndedAt` so Studio surfaces stall `ended` and unlocks
   * self→platform without waiting for the quiet window.
   */
  // summary carries the closing word; prose outside tool calls reaches nobody.
  app.post(
    AGENT_CHANNEL_ROUTES.END,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;

      const parsed = EndRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      // A summary that cannot be stored must not fail the end.
      const recordSummary = async () => {
        if (!parsed.data.summary) return false;
        if ((await store!.countBuildEvents(issueNumber)) >= maxEventsPerBuild) return false;
        const event = await composeCreatorEvent({
          kind: 'done',
          text: parsed.data.summary,
          ...(parsed.data.summaryLocalized ? { textLocalized: parsed.data.summaryLocalized } : {}),
          ...(parsed.data.locale ? { locale: parsed.data.locale } : {}),
        });
        if (!event) return false;
        await store!.appendBuildEvent(issueNumber, event);
        return true;
      };

      if (
        record.builderHandoff &&
        record.builderHandoff.awaitsAgentAck !== false &&
        options.onBuilderHandoffAcknowledged
      ) {
        const outcome = await options.onBuilderHandoffAcknowledged({
          issueNumber,
          acknowledgedAt: new Date(now()).toISOString(),
          log: request.log,
        });
        const fresh = (await store!.getSubmission(issueNumber)) ?? record;
        if (!outcome.started) {
          options.onEvent?.(issueNumber);
          return reply.send({
            accepted: false,
            rejected: outcome.reason ?? 'handoff_not_started',
            ...(await channelState(issueNumber, fresh)),
          });
        }
        if (parsed.data.ackInboxIds && parsed.data.ackInboxIds.length > 0) {
          await store!.markCreatorMessagesDelivered(issueNumber, parsed.data.ackInboxIds);
        }
        const summarized = await recordSummary();
        const state = await channelState(issueNumber, fresh);
        return reply.send({
          accepted: true,
          ended: true,
          handoffAcknowledged: true,
          ...(summarized ? { summaryShown: true } : {}),
          ...state,
          control: { ...state.control, stop: true, reason: 'builder_handoff_acknowledged' },
        });
      }

      if (stopReason(record)) {
        return reply.send({ accepted: false, rejected: 'stopped', ...(await channelState(issueNumber, record)) });
      }

      if (parsed.data.ackInboxIds && parsed.data.ackInboxIds.length > 0) {
        await store!.markCreatorMessagesDelivered(issueNumber, parsed.data.ackInboxIds);
      }

      // Submit-ended still records; a prior or legacy end does not.
      const summarized = record.agentEndedAt && record.agentEndedBy !== 'submit' ? false : await recordSummary();
      await store!.markAgentEnded(issueNumber);
      options.onEvent?.(issueNumber);
      const fresh = (await store!.getSubmission(issueNumber)) ?? record;
      return reply.send({
        accepted: true,
        ended: true,
        ...(summarized ? { summaryShown: true } : {}),
        ...(await channelState(issueNumber, fresh)),
      });
    },
  );

  /**
   * Everything an agent needs to start a round without reading a GitHub issue.
   *
   * Spec/qa live on the job document (written at submission). Rules and the byte
   * ceiling are static / contract-derived — never invented per job.
   */
  app.get(
    AGENT_CHANNEL_ROUTES.BRIEF,
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;

      const pending = await store!.listPendingCreatorMessages(issueNumber);
      const seed = seedPayload(record);
      const referenceShots = (await store!.listBuildShots(issueNumber)).filter(
        (shot) => shot.label === 'creator-reference',
      );
      return reply.send({
        title: record.title,
        slug: record.slug ?? null,
        spec: record.spec ?? '',
        qa: record.qa ?? [],
        rules: AGENT_BUILD_RULES_DIGEST,
        constraints: buildConstraints(DEFAULT_BUILD_ORIENTATION),
        locales: briefLocales(record.locale),
        ...seed,
        // > 1 means get_transcript may know more than this brief's spec.
        dispatchAttempt: await dispatchAttempt(store!, record),
        pendingMessages: pending.map((message) => ({
          id: message.id,
          text: message.text,
          createdAt: message.createdAt,
        })),
        // Ids only — fetch pixels via get_reference_images / GET .../reference-images.
        referenceImages: referenceShots.map((shot) => ({ id: shot.id, createdAt: shot.createdAt })),
      });
    },
  );

  // Creator-attached reference images, with bytes — mirrors /build/media.
  app.get(
    AGENT_CHANNEL_ROUTES.REFERENCE_IMAGES,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber } = resolved;

      const summaries = (await store!.listBuildShots(issueNumber)).filter((shot) => shot.label === 'creator-reference');
      const images = await Promise.all(
        summaries.map(async (summary) => {
          const shot = await store!.getBuildShot(issueNumber, summary.id);
          if (!shot) return null;
          return { id: shot.id, createdAt: shot.createdAt, png: shot.data };
        }),
      );
      return reply.send({ images: images.filter((image): image is NonNullable<typeof image> => image !== null) });
    },
  );

  /**
   * Round-0 seed draft stored on the job (self builds and platform seeds that persisted).
   * 404-shaped `{ available: false }` when none and not pending — not an auth failure.
   * Pending seeds return 200 so MCP clients recheck instead of scaffolding.
   */
  app.get(
    AGENT_CHANNEL_ROUTES.SEED,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { record } = resolved;
      const seed = seedPayload(record);

      if (record.seed) {
        return reply.send({
          available: true,
          status: seed.seedStatus,
          notice: seed.seedNotice,
          files: record.seed.files,
          references: record.seed.references,
          notes: record.seed.notes ?? null,
        });
      }
      if (seed.seedStatus === 'pending') {
        return reply.send({
          available: false,
          status: 'pending',
          notice: seed.seedNotice,
          files: [],
          references: [],
          notes: null,
        });
      }
      return reply.status(404).send({
        available: false,
        status: 'unavailable',
        notice: seed.seedNotice,
        files: [],
        references: [],
        notes: null,
      });
    },
  );

  // Replaces an unusable draft; refused once staging has a base.
  app.post(
    AGENT_CHANNEL_ROUTES.SEED_REGENERATE,
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;

      if (!options.onRegenerateSeed) {
        return reply.status(503).send({ error: 'seeding_unavailable', message: 'this deployment does not seed' });
      }

      const parsed = RegenerateSeedRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: 'invalid_request', message: parsed.error.issues[0]?.message });
      }

      if (options.gamesStore && record.slug) {
        const roundGeneration = store
          ? ((await store.ensureRoundGeneration(issueNumber)) ?? record.roundGeneration ?? 1)
          : (record.roundGeneration ?? 1);
        const staged = await options.gamesStore.listStagedSources({
          slug: record.slug,
          issueNumber,
          roundGeneration,
        });
        if (staged.files.length > 0) {
          return reply.status(409).send({
            error: 'already_staged',
            message:
              'you have staged files this round — a new seed would change the base they overlay. ' +
              'Continue with what you have staged, or clear the staging buffer first.',
          });
        }
      }

      const result = await options.onRegenerateSeed({
        issueNumber,
        ...(parsed.data.steer ? { steer: parsed.data.steer } : {}),
        log: request.log,
      });
      if (!result.ok) {
        const status = result.reason === 'not_configured' ? 503 : result.reason === 'not_found' ? 404 : 409;
        return reply.status(status).send({ error: result.reason, message: REGENERATE_SEED_REFUSALS[result.reason] });
      }
      return reply.send({
        status: result.status,
        regenerationsRemaining: result.regenerationsRemaining,
        notice: 'A new draft is generating. Call get_seed again in a minute or two; do not wait in a loop.',
      });
    },
  );

  /**
   * Current Creator Kit — engine-pinned tarball from `kits/current.json`.
   *
   * Missing registry is a clear machine-readable error (bucket empty until the first
   * games-repo publish), never a fabricated engineRef.
   */
  app.get(
    AGENT_CHANNEL_ROUTES.KIT,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;

      if (!options.objectStore) {
        return reply.status(503).send({ error: 'kit_store_unavailable', message: 'the kit store is not configured' });
      }

      try {
        const registryBody = await options.objectStore.readObject('kits/current.json');
        if (!registryBody) {
          return reply.status(404).send({
            error: 'kit_registry_missing',
            message: 'kits/current.json is not published yet — the games-repo kit publisher has not run',
          });
        }
        const registry = parseKitRegistry(registryBody.toString('utf8'));
        // The pointer can advance mid-round; the round builds against one engine.
        const previousPin = resolved.record.roundKitEngineRef;
        const outdated = (await gateVerdict(resolved.record))?.status === 'kit_outdated';
        let engineRef =
          (await store!.pinRoundKitEngineRef(resolved.issueNumber, registry.current, outdated)) ?? registry.current;
        // Re-pin when the pinned kit has aged out of retention.
        if (engineRef !== registry.current && !(await options.objectStore.objectExists(`kits/${engineRef}.tgz`))) {
          engineRef =
            (await store!.pinRoundKitEngineRef(resolved.issueNumber, registry.current, true)) ?? registry.current;
        }
        const kitEngineChanged = Boolean(previousPin) && previousPin !== engineRef;
        const sidecarBody = await options.objectStore.readObject(`kits/${engineRef}.json`);
        if (!sidecarBody) {
          return reply.status(404).send({
            error: 'kit_artifact_missing',
            message: `kits/${engineRef}.json sidecar is missing for the current registry entry`,
          });
        }
        const sidecar = parseKitSidecar(sidecarBody.toString('utf8'));
        // Metadata probe only — do not pull the multi-MB kit into the request path.
        if (!(await options.objectStore.objectExists(`kits/${engineRef}.tgz`))) {
          return reply.status(404).send({
            error: 'kit_artifact_missing',
            message: `kits/${engineRef}.tgz is missing for the current registry entry`,
          });
        }

        const kitUrl = await options.objectStore.signReadUrl(`kits/${engineRef}.tgz`, DEFAULT_SIGNED_URL_TTL_SECONDS);
        return reply.send({
          engineRef,
          kitUrl,
          sha256: sidecar.sha256,
          unpack: kitUnpackCommand(kitUrl),
          entry: KIT_ENTRY,
          // The round's engine moved: rebuild against the one in this reply.
          ...(kitEngineChanged ? { kitEngineChanged: true } : {}),
          // Shell-less clients browse via these tools instead of unpacking.
          browse: {
            list: 'list_kit_files',
            search: 'search_kit_files',
            read: 'read_kit_file',
            readMany: 'read_kit_files',
            fragment: 'read_kit_file_fragment',
          },
        });
      } catch (error) {
        if (error instanceof KitRegistryError) {
          return reply.status(404).send({ error: error.code, message: error.message });
        }
        throw error;
      }
    },
  );

  // Prompt-ready API reference for MCP get_kit_api — see byoca-mcp SKILL.md.
  app.get(
    AGENT_CHANNEL_ROUTES.KIT_API,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      if (!options.objectStore) {
        return reply.status(503).send({ error: 'kit_store_unavailable', message: 'the kit store is not configured' });
      }
      try {
        const query = request.query as { engineRef?: string };
        let engineRef = query.engineRef?.trim();
        if (!engineRef) {
          const registryBody = await options.objectStore.readObject('kits/current.json');
          if (!registryBody) {
            return reply.status(404).send({
              error: 'kit_registry_missing',
              message: 'kits/current.json is not published yet — the games-repo kit publisher has not run',
            });
          }
          engineRef = parseKitRegistry(registryBody.toString('utf8')).current;
        }
        const digestBody = await options.objectStore.readObject(`kits/${engineRef}.digest.md`);
        if (!digestBody) {
          return reply.status(404).send({
            error: 'kit_artifact_missing',
            message: `kits/${engineRef}.digest.md is missing for engineRef ${engineRef}`,
          });
        }
        return reply.send({
          engineRef,
          digest: compactKitDigestForApi(digestBody.toString('utf8'), DEFAULT_MCP_DIGEST_MAX_BYTES),
        });
      } catch (error) {
        if (error instanceof KitRegistryError) {
          return reply.status(404).send({ error: error.code, message: error.message });
        }
        throw error;
      }
    },
  );

  /**
   * List files inside the current Creator Kit without downloading the tarball to the agent.
   */
  app.get(
    AGENT_CHANNEL_ROUTES.KIT_FILES,
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      if (!kitFileStore) {
        return reply.status(503).send({ error: 'kit_store_unavailable', message: 'the kit store is not configured' });
      }
      try {
        const query = request.query as {
          prefix?: string;
          glob?: string;
          limit?: string;
          offset?: string;
          engineRef?: string;
        };
        const tree = await kitFileStore.loadTree(query.engineRef);
        return reply.send(
          listKitFiles(tree, {
            prefix: query.prefix,
            glob: query.glob,
            limit: optionalFiniteQuery(query.limit),
            offset: optionalFiniteQuery(query.offset),
          }),
        );
      } catch (error) {
        const sent = sendKitFilesError(reply, error);
        if (sent) return sent;
        throw error;
      }
    },
  );

  /** Grep text files in the current Creator Kit. */
  app.get(
    AGENT_CHANNEL_ROUTES.KIT_SEARCH,
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      if (!kitFileStore) {
        return reply.status(503).send({ error: 'kit_store_unavailable', message: 'the kit store is not configured' });
      }
      try {
        const query = request.query as {
          q?: string;
          query?: string;
          prefix?: string;
          limit?: string;
          engineRef?: string;
        };
        const tree = await kitFileStore.loadTree(query.engineRef);
        return reply.send(
          searchKitFiles(tree, {
            query: query.q ?? query.query ?? '',
            prefix: query.prefix,
            limit: optionalFiniteQuery(query.limit),
          }),
        );
      } catch (error) {
        const sent = sendKitFilesError(reply, error);
        if (sent) return sent;
        throw error;
      }
    },
  );

  /** Read one small kit file (refuse oversized — use /fragment). */
  app.get(
    AGENT_CHANNEL_ROUTES.KIT_FILE,
    { config: { rateLimit: { max: 240, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      if (!kitFileStore) {
        return reply.status(503).send({ error: 'kit_store_unavailable', message: 'the kit store is not configured' });
      }
      try {
        const query = request.query as { path?: string; encoding?: string; engineRef?: string };
        if (!query.path?.trim()) {
          return reply.status(400).send({ error: 'kit_path_invalid', message: 'path is required' });
        }
        const encoding = query.encoding === 'base64' || query.encoding === 'utf8' ? query.encoding : undefined;
        const tree = await kitFileStore.loadTree(query.engineRef);
        return reply.send(readKitFile(tree, query.path, { encoding }));
      } catch (error) {
        const sent = sendKitFilesError(reply, error);
        if (sent) return sent;
        throw error;
      }
    },
  );

  /**
   * Read several small kit files in one request — collapses ChatGPT/Claude per-turn
   * tool-call budgets when browsing a scaffold.
   */
  app.post(
    AGENT_CHANNEL_ROUTES.KIT_FILES_READ,
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      if (!kitFileStore) {
        return reply.status(503).send({ error: 'kit_store_unavailable', message: 'the kit store is not configured' });
      }
      try {
        const body = (request.body ?? {}) as {
          paths?: unknown;
          encoding?: string;
          engineRef?: string;
        };
        if (!Array.isArray(body.paths)) {
          return reply.status(400).send({ error: 'kit_query_invalid', message: 'paths must be an array of strings' });
        }
        const paths = body.paths.filter((path): path is string => typeof path === 'string');
        if (paths.length === 0) {
          return reply.status(400).send({ error: 'kit_query_invalid', message: 'paths must be a non-empty array' });
        }
        const encoding = body.encoding === 'base64' || body.encoding === 'utf8' ? body.encoding : undefined;
        const tree = await kitFileStore.loadTree(body.engineRef);
        return reply.send(readKitFiles(tree, paths, { encoding }));
      } catch (error) {
        const sent = sendKitFilesError(reply, error);
        if (sent) return sent;
        throw error;
      }
    },
  );

  /** Read a byte/line window of one kit file. */
  app.get(
    AGENT_CHANNEL_ROUTES.KIT_FILE_FRAGMENT,
    { config: { rateLimit: { max: 240, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      if (!kitFileStore) {
        return reply.status(503).send({ error: 'kit_store_unavailable', message: 'the kit store is not configured' });
      }
      try {
        const query = request.query as {
          path?: string;
          offset?: string;
          limit?: string;
          unit?: string;
          encoding?: string;
          engineRef?: string;
        };
        if (!query.path?.trim()) {
          return reply.status(400).send({ error: 'kit_path_invalid', message: 'path is required' });
        }
        const encoding = query.encoding === 'base64' || query.encoding === 'utf8' ? query.encoding : undefined;
        const unit = query.unit === 'bytes' || query.unit === 'lines' ? query.unit : undefined;
        const tree = await kitFileStore.loadTree(query.engineRef);
        return reply.send(
          readKitFileFragment(tree, query.path, {
            offset: optionalFiniteQuery(query.offset),
            limit: optionalFiniteQuery(query.limit),
            unit,
            encoding,
          }),
        );
      } catch (error) {
        const sent = sendKitFilesError(reply, error);
        if (sent) return sent;
        throw error;
      }
    },
  );

  // knowledge_query's route. A capped round still returns 200, not an error.
  app.get(
    AGENT_CHANNEL_ROUTES.KNOWLEDGE_QUERY,
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber } = resolved;
      if (!knowledgeSearch) {
        return reply
          .status(503)
          .send({ error: 'knowledge_search_unavailable', message: 'knowledge_query is not configured' });
      }

      const query = request.query as { query?: string; q?: string; mode?: string; scope?: string };
      const text = (query.query ?? query.q ?? '').trim();
      if (!text) {
        return reply.status(400).send({ error: 'knowledge_query_invalid', message: 'query is required' });
      }
      const mode: KnowledgeMode = query.mode === 'chunks' ? 'chunks' : 'answer';
      const scope = KNOWLEDGE_SCOPES.has(query.scope as KnowledgeScope) ? (query.scope as KnowledgeScope) : undefined;

      const bucket = mode === 'answer' ? knowledgeAnswersByBuild : knowledgeChunksByBuild;
      const cap = mode === 'answer' ? maxKnowledgeAnswersPerWindow : maxKnowledgeChunksPerWindow;
      if (isRateLimited(bucket, issueNumber, now(), cap)) {
        return reply.send(knowledgeCapWarning(mode, cap));
      }

      const startedAt = now();
      const result = await knowledgeSearch({ query: text, mode, scope });
      logKnowledgeQuery(request.log, {
        issueNumber,
        mode,
        scope,
        cacheHit: result.cached,
        fallback: result.fallback,
        truncated: result.truncated,
        chunkCount: result.chunks.length,
        warningCodes: result.warnings.map((warning) => warning.code),
        ms: now() - startedAt,
      });
      return reply.send(result);
    },
  );

  /**
   * Curated first-party exemplars — allowlist JSON in-repo, never a store listing.
   */
  app.get(
    AGENT_CHANNEL_ROUTES.EXAMPLES,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      return reply.send({ examples: listAgentBuildExamples() });
    },
  );

  /**
   * Signed tarball of one allowlisted exemplar's sources (`examples/<slug>.tgz`).
   * Non-allowlisted slugs 404 even if an object happens to exist under that name.
   */
  app.get(
    AGENT_CHANNEL_ROUTES.EXAMPLES_BY_SLUG,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;

      const slug = String((request.params as { slug?: string }).slug ?? '');
      const example = getAgentBuildExample(slug);
      if (!example) {
        return reply.status(404).send({ error: 'unknown_example', message: 'slug is not on the exemplar allowlist' });
      }

      if (!options.objectStore) {
        return reply
          .status(503)
          .send({ error: 'example_store_unavailable', message: 'the example store is not configured' });
      }

      const objectName = `examples/${example.slug}.tgz`;
      if (!(await options.objectStore.objectExists(objectName))) {
        return reply.status(404).send({
          error: 'example_unavailable',
          message: `no packed sources for allowlisted slug ${example.slug}`,
        });
      }

      let sha256: string | null = null;
      const sidecarBody = await options.objectStore.readObject(`examples/${example.slug}.json`);
      if (sidecarBody) {
        try {
          const parsed = JSON.parse(sidecarBody.toString('utf8')) as { sha256?: unknown };
          if (typeof parsed.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(parsed.sha256)) {
            sha256 = parsed.sha256.toLowerCase();
          }
        } catch {
          // Sidecar is optional; a corrupt one must not block the download.
        }
      }

      const tarballUrl = await options.objectStore.signReadUrl(objectName, DEFAULT_SIGNED_URL_TTL_SECONDS);
      return reply.send({
        slug: example.slug,
        title: example.title,
        tarballUrl,
        ...(sha256 ? { sha256 } : {}),
        unpack: exampleUnpackCommand(tarballUrl),
      });
    },
  );

  /**
   * Exemplar sources as files, for agents that cannot fetch the tarball.
   *
   * Same allowlist gate as the signed-URL route above — the exemplar catalog is a
   * hand-curated list of first-party slugs, and a slug that is not on it does not
   * become readable just because a different verb reaches the same bucket. What
   * changes is only the transport: bytes through the tool instead of a link.
   */
  app.get(
    AGENT_CHANNEL_ROUTES.EXAMPLES_BY_SLUG_FILES,
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;

      const example = getAgentBuildExample(String((request.params as { slug?: string }).slug ?? ''));
      if (!example) {
        return reply.status(404).send({ error: 'unknown_example', message: 'slug is not on the exemplar allowlist' });
      }
      if (!exampleFileStore) {
        return reply
          .status(503)
          .send({ error: 'example_store_unavailable', message: 'the example store is not configured' });
      }

      try {
        const query = request.query as { prefix?: string; limit?: string; offset?: string };
        const tree = await exampleFileStore.loadTree(example.slug);
        return reply.send(
          listExampleFiles(tree, {
            prefix: query.prefix,
            limit: optionalFiniteQuery(query.limit),
            offset: optionalFiniteQuery(query.offset),
          }),
        );
      } catch (error) {
        const sent = sendExampleFilesError(reply, error);
        if (sent) return sent;
        throw error;
      }
    },
  );

  /** One file from an allowlisted exemplar, inline. */
  app.get(
    AGENT_CHANNEL_ROUTES.EXAMPLES_BY_SLUG_FILE,
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;

      const example = getAgentBuildExample(String((request.params as { slug?: string }).slug ?? ''));
      if (!example) {
        return reply.status(404).send({ error: 'unknown_example', message: 'slug is not on the exemplar allowlist' });
      }
      if (!exampleFileStore) {
        return reply
          .status(503)
          .send({ error: 'example_store_unavailable', message: 'the example store is not configured' });
      }

      try {
        const query = request.query as { path?: string; encoding?: string };
        const encoding = query.encoding === 'base64' ? 'base64' : query.encoding === 'utf8' ? 'utf8' : undefined;
        if (query.encoding && !encoding) {
          return reply.status(400).send({ error: 'example_query_invalid', message: 'encoding must be utf8 or base64' });
        }
        const tree = await exampleFileStore.loadTree(example.slug);
        return reply.send(readExampleFile(tree, query.path ?? '', { ...(encoding ? { encoding } : {}) }));
      } catch (error) {
        const sent = sendExampleFilesError(reply, error);
        if (sent) return sent;
        throw error;
      }
    },
  );

  /**
   * Gate verdict for the job's delivery (BY-05 terminal receipt).
   *
   * Unlike every other channel read, a capability whose generation is exactly one
   * behind current is accepted — limited to this delivery's own verdict — so an agent
   * can observe the green that closed its round. Writes and other reads still 401.
   * Query `?version=` to name a delivery; default is the job's latest playable pointer
   * (`previewVersion`, then `deliveredVersion`) — same order as Studio and restore.
   */
  app.get(
    AGENT_CHANNEL_ROUTES.GATE,
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply, { allowTerminalReceipt: true });
      if (!resolved) return reply;
      const { record, access } = resolved;

      const query = request.query as { version?: string };
      const requestedVersion = typeof query.version === 'string' && query.version.trim() ? query.version.trim() : null;
      const version = requestedVersion ?? record.previewVersion ?? record.deliveredVersion ?? null;

      if (!version || !record.slug) {
        return reply.send({
          status: 'pending',
          deliveryId: null,
          summary:
            'nothing has been delivered yet — continue building and call submit_sources first; do not call get_gate_verdict again before a delivery',
          retryAfterSeconds: 30,
          access,
        });
      }

      // Receipt mode may only read the delivery the closed round owns — the job's
      // current pointer. Asking for any other version is not a receipt grant.
      if (access === 'terminal_receipt' && version !== record.deliveredVersion) {
        return reply.status(401).send({ error: STALE_AGENT_TOKEN_REASON });
      }

      const gate = await gateVerdict({
        ...record,
        deliveredVersion: record.deliveredVersion === version ? version : undefined,
        previewVersion: version,
      });
      if (!gate) {
        let progress: {
          lane: string;
          stage: string;
          index: number;
          total: number;
          at: string;
        } | null = null;
        try {
          const manifest = await options.gamesStore?.getManifest(record.slug, version);
          if (manifest?.gateProgress && !manifest.gate && !manifest.previewGate) {
            progress = manifest.gateProgress;
          }
        } catch {
          /* ignore */
        }
        // A recorded crash is our build dying, not a slow one.
        const crashed = gateCrashStall(record) !== null;
        return reply.send({
          status: crashed ? 'crashed' : 'pending',
          deliveryId: version,
          summary: crashed
            ? 'our gate build failed before it could check your game — this is a platform fault, not your code. Deliver again to start a fresh gate run; the round is still open.'
            : 'gate has not reported yet — do not loop on get_gate_verdict; stop this run and let Studio show the eventual result',
          retryAfterSeconds: 30,
          access,
          ...(progress
            ? {
                progress,
                lane: progress.lane === 'preview' ? 'preview' : 'publish',
              }
            : {}),
        });
      }

      const status = deriveGateStatusString(gate);
      return reply.send({
        status,
        deliveryId: version,
        version: gate.version,
        green: gate.green,
        lane: gate.lane,
        ranAt: gate.ranAt,
        summary: gate.green
          ? 'gate accepted this delivery'
          : gate.status === 'preview_passed'
            ? 'preview check passed — continue iterating, then submit_sources with mode=publish (TRACE required)'
            : gate.status === 'preview_failed'
              ? (gate.report?.split('\n').at(-1) ?? 'preview check refused this delivery')
              : (gate.report?.split('\n').at(-1) ?? 'gate refused this delivery'),
        ...(gate.report ? { report: gate.report } : {}),
        ...(gate.status ? { gateStatus: gate.status } : {}),
        ...('previewPassed' in gate && gate.previewPassed !== undefined ? { previewPassed: gate.previewPassed } : {}),
        access,
      });
    },
  );

  /**
   * Gate-produced media for a delivery (BY-28).
   *
   * Exists for the agent that cannot run the game — a connector-surface client
   * (ChatGPT, claude.ai) with no shell and no browser builds and submits fine, but
   * iterates blind on verdict text and finishes with nothing to show the creator.
   * The gate already produced the missing evidence on every run: capture PNGs and a
   * gameplay MP4, stored as derived artifacts on the version. This is the read back.
   *
   * Read-only over runs that already happened — deliberately *not* an on-demand
   * capture: rendering agent code is gate compute, and it stays behind the delivery
   * cap. Filenames come exclusively from the validated `media/metadata.json` (the
   * same allowlist rule as the published-media route), with the manifest's own
   * `gate.screenshot` as the fallback for runs capture abandoned partway. Terminal
   * receipt is accepted exactly as on the verdict read, and for the same reason:
   * green closes the round, and post-green is when there is something worth showing.
   */
  app.get(
    AGENT_CHANNEL_ROUTES.MEDIA,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply, { allowTerminalReceipt: true });
      if (!resolved) return reply;
      const { record, access } = resolved;

      if (!options.gamesStore || !options.objectStore) {
        return reply.status(503).send({ error: 'the media store is not configured' });
      }

      const query = request.query as { version?: string; frames?: string };
      const requestedVersion = typeof query.version === 'string' && query.version.trim() ? query.version.trim() : null;
      const version = requestedVersion ?? record.previewVersion ?? record.deliveredVersion ?? null;

      if (!version || !record.slug) {
        return reply.send({
          available: false,
          deliveryId: null,
          reason: 'nothing has been delivered yet — media is produced by the gate, after submit',
          access,
        });
      }

      // Same receipt rule as the verdict read: a closed round may only look at the
      // delivery it owns.
      if (access === 'terminal_receipt' && version !== record.deliveredVersion) {
        return reply.status(401).send({ error: STALE_AGENT_TOKEN_REASON });
      }

      // Version ids are ours (timestamp + suffix), but this one arrived in a query
      // string and is about to be interpolated into a signed object path — shape-check
      // it rather than trusting the round to have asked nicely.
      if (!/^[A-Za-z0-9-]+$/.test(version)) {
        return reply.status(400).send({ error: 'invalid version' });
      }

      const slug = record.slug;
      // The manifest proves this version exists — but a slug is not a job. Every
      // improvement round is a *new* job that inherits the published slug, so a
      // version delivered by an earlier round resolves perfectly well under this
      // one's slug, and after a slug transfer that earlier job can belong to a
      // different creator entirely. The manifest records the job that produced it;
      // that is the ownership check, and the slug never was one.
      //
      // Absent and not-yours answer identically on purpose: distinguishing them
      // would let a round enumerate which versions its predecessors delivered.
      const manifest = await options.gamesStore.getManifest(slug, version);
      if (!manifest || manifest.issueNumber !== record.issueNumber) {
        return reply.send({
          available: false,
          deliveryId: version,
          reason: 'no such delivery for this build',
          access,
        });
      }

      // Either lane's verdict can own frames. Publish wins when both exist: it is the
      // later, fuller run, and its media is what a creator would be shown. Preview
      // frames (BY-28a) are what make this read useful *during* a round — before
      // BY-28a a preview delivery had no media at all, so an agent iterating on the
      // cheap lane could only read prose.
      const verdict = manifest.gate
        ? { ...manifest.gate, lane: 'publish' as const }
        : manifest.previewGate
          ? { ...manifest.previewGate, lane: 'preview' as const }
          : null;
      // Publish wins the *verdict* — it is the later, fuller run — but not the frame.
      // A publish run that failed before capture names no screenshot, and preferring
      // its silence over a preview frame that exists would report "no media" while the
      // bytes sit in the bucket. Verdict precedence and evidence precedence are
      // different questions; only the first one publish should win by default.
      const verdictScreenshot = manifest.gate?.screenshot ?? manifest.previewGate?.screenshot ?? null;

      const metadataBody = await options.gamesStore.getDerivedArtifact(slug, version, 'media/metadata.json');
      const media = parseGameMedia(metadataBody?.toString('utf8') ?? null);

      // Runs that failed mid-capture store frames without metadata; the verdict names
      // the first stored frame (`media/opening.png` shape).
      const fallbackShot =
        !media && verdictScreenshot && /^media\/[a-z0-9][a-z0-9_.-]*\.png$/i.test(verdictScreenshot)
          ? verdictScreenshot.slice('media/'.length)
          : null;

      const screenshotFiles = media
        ? media.screenshots.map((shot) => ({ name: shot.name, file: shot.file }))
        : fallbackShot
          ? [{ name: 'opening', file: fallbackShot }]
          : [];
      const videoFile = media?.video ?? null;

      if (screenshotFiles.length === 0 && !videoFile) {
        return reply.send({
          available: false,
          deliveryId: version,
          reason: 'the gate stored no media for this delivery',
          access,
        });
      }

      const mediaObject = (file: string) => `games/${slug}/versions/${version}/media/${file}`;

      // Metadata names what capture *intended* to store, which is not the same as what
      // landed: the gate writes each media file independently and swallows a per-file
      // failure to protect the verdict (gate-runner `storeCaptureMedia`), so a run can
      // store metadata.json and lose the mp4. Signing a name we never confirmed hands
      // the agent a URL that 404s — and the agent then tells the creator their video is
      // ready. Probe before advertising; a signed URL is a promise about bytes.
      const probed = await Promise.all(
        screenshotFiles.map(async (shot) =>
          (await options.objectStore!.objectExists(mediaObject(shot.file))) ? shot : null,
        ),
      );
      const storedShots = probed.filter((shot): shot is { name: string; file: string } => shot !== null);
      const storedVideo =
        videoFile && (await options.objectStore.objectExists(mediaObject(videoFile))) ? videoFile : null;

      if (storedShots.length === 0 && !storedVideo) {
        return reply.send({
          available: false,
          deliveryId: version,
          reason: 'the gate stored no media for this delivery',
          access,
        });
      }

      const screenshots = await Promise.all(
        storedShots.map(async (shot) => ({
          ...shot,
          url: await options.objectStore!.signReadUrl(mediaObject(shot.file), DEFAULT_SIGNED_URL_TTL_SECONDS),
        })),
      );
      const video = storedVideo
        ? {
            file: storedVideo,
            url: await options.objectStore.signReadUrl(mediaObject(storedVideo), DEFAULT_SIGNED_URL_TTL_SECONDS),
          }
        : null;

      // Frames carried *through* the channel, not pointed at.
      //
      // A signed URL assumes the reader can open a socket. The agent this endpoint was
      // built for cannot: a ChatGPT-side connector runs our tools and nothing else — no
      // shell, no fetch, no egress at all (owner test, 2026-08-03). For that client a
      // URL is not a degraded experience, it is a blank one, and the same is true of
      // `get_kit`'s tarball (which is why #510 added file-reading tools rather than
      // another link). So the bytes ride the reply.
      //
      // Bounded, because context is the cost here rather than bandwidth: capture stores
      // up to eight frames and each may be ~700 KB, which no client should be made to
      // swallow by default. `opening` answers "did it draw"; `all` is for "show the
      // creator what it looks like". Whatever the budget drops is reported — a caller
      // told it has every frame when it has three is worse off than one that knows.
      const requestedFrames = typeof query.frames === 'string' ? query.frames : 'opening';
      const frameMode: 'opening' | 'all' | 'none' =
        requestedFrames === 'all' || requestedFrames === 'none' ? requestedFrames : 'opening';

      const openingFirst = [
        ...storedShots.filter((shot) => shot.name === 'opening'),
        ...storedShots.filter((shot) => shot.name !== 'opening'),
      ];
      const wanted = frameMode === 'none' ? [] : frameMode === 'all' ? openingFirst : openingFirst.slice(0, 1);

      const frames: Array<{ file: string; name: string; png: string }> = [];
      let framesOmitted = 0;
      let inlineBytes = 0;
      for (const shot of wanted) {
        if (frames.length >= MAX_INLINE_FRAMES) {
          framesOmitted += 1;
          continue;
        }
        const body = await options.gamesStore.getDerivedArtifact(slug, version, `media/${shot.file}`).catch(() => null);
        // An unreadable or oversized frame is skipped, not fatal: the URLs still stand
        // for clients that can use them, and a partial answer beats a 500.
        if (!body || body.length === 0 || body.length > maxShotBytes) {
          framesOmitted += 1;
          continue;
        }
        // Measured with this frame included, not before it. Checking the running total
        // first makes the budget a floor rather than a ceiling: three frames just under
        // the line individually still land ~2.1 MB together. A frame that would cross
        // the line is dropped and the scan continues, so a smaller later frame can
        // still be carried. No starvation: maxShotBytes is below the budget, so the
        // first frame always fits.
        if (inlineBytes + body.length > MAX_INLINE_FRAME_BYTES) {
          framesOmitted += 1;
          continue;
        }
        inlineBytes += body.length;
        frames.push({ file: shot.file, name: shot.name, png: body.toString('base64') });
      }

      return reply.send({
        available: true,
        deliveryId: version,
        ...(verdict
          ? {
              gate: {
                green: verdict.green,
                ranAt: verdict.ranAt,
                ...(verdict.status ? { status: verdict.status } : {}),
                // Which lane took these frames. A preview pass is not publish
                // readiness, and an agent that reads `green` without this would
                // report a game sealed when it has only typechecked.
                lane: verdict.lane,
              },
            }
          : {}),
        screenshots,
        video,
        frames,
        ...(framesOmitted > 0 ? { framesOmitted } : {}),
        // Said in the payload, not only in the tool description, because the agent that
        // needs to know is the one that cannot test a URL to find out.
        ...(video
          ? {
              videoNote:
                'The video is available only as a URL. If you cannot fetch URLs, do not try — ' +
                'give the link to the creator, who can open it, and describe the game from the frames.',
            }
          : {}),
        expiresInSeconds: DEFAULT_SIGNED_URL_TTL_SECONDS,
        access,
      });
    },
  );
}
