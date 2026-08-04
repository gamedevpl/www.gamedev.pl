import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
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
import { selfBuildDeliveryCap } from './builder.js';
import { DEFAULT_SIGNED_URL_TTL_SECONDS, type GcsObjectStore } from './gcs-sign.js';
import {
  InvalidUploadError,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  type DeliveryMode,
  type GamesStore,
} from './games-store.js';
import { parseGameMedia, parseSpecTitle } from './github-client.js';
import { canTransition, resolveJobState, type JobState } from './job-state.js';
import {
  KitFilesError,
  createKitFileStore,
  listKitFiles,
  readKitFile,
  readKitFileFragment,
  readKitFiles,
  searchKitFiles,
} from './kit-files.js';
import {
  KIT_ENTRY,
  KitRegistryError,
  exampleUnpackCommand,
  kitUnpackCommand,
  parseKitRegistry,
  parseKitSidecar,
} from './kit-registry.js';
import { seedPayload } from './seed-status.js';
import { type CreatorMessage, type Store, type SubmissionRecord } from './store.js';
import { BUILD_EVENT_KINDS, BUILD_STEPS, sanitizeCreatorText, type BuildEvent } from './submission-status.js';

/**
 * The build channel (docs/agent-live-channel-plan.md).
 *
 * Before this existed, everything the creator saw about their build had to travel by
 * git: the agent wrote a note, committed it, pushed it, waited for CI, and we read it
 * back through a 60-second-cached contents API. The transport charged a CI run per
 * sentence, so agents batched — which is why the status page sat still for ten minutes
 * at a time. This is the direct route: one authenticated POST, visible in seconds.
 *
 * It is also the *return* path. Every call answers with the creator's queued change
 * requests and a control block, so an agent that reports progress gets its instructions
 * back for free. Note the limit: this makes a *working* agent responsive, but it cannot
 * wake a stopped one — nothing is polling between sessions. Creator feedback therefore
 * still goes out as a PR comment, which is both the durable record and the wake-up.
 *
 * Everything the agent sends is untrusted, prompt-influenced text: sanitized here,
 * escaped on render, and never fed back to any model as instructions.
 */

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
/** Fastify rejects before the handler when the JSON body exceeds this. */
const shotBodyLimit = Math.ceil((maxShotBytes * 4) / 3) + 4096;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const BuildShotInputSchema = z.object({
  // Sized in base64 characters, so an oversized payload is rejected before it is
  // decoded. 4/3 expansion plus padding slack.
  png: z
    .string()
    .trim()
    .min(1, 'png is required')
    .max(Math.ceil((maxShotBytes * 4) / 3) + 1024, 'screenshot is too large')
    .regex(/^[A-Za-z0-9+/\s]*={0,2}$/, 'png must be base64'),
  label: z
    .string()
    .trim()
    .max(MAX_SHOT_LABEL * 4)
    .optional(),
  labelLocalized: z
    .string()
    .trim()
    .max(MAX_SHOT_LABEL * 4)
    .optional(),
  locale: z
    .string()
    .trim()
    .max(10)
    .regex(/^[a-z]{2}(-[A-Za-z0-9]{2,8})?$/, 'invalid locale')
    .optional(),
});

const MAX_PREVIEW_LABEL = 120;
/**
 * 320 KB decoded. The games repo caps an assembled bundle at a little over 200 KB
 * (validate.ts Check 4) and the largest game in the catalog measures 243 KB, so this
 * clears the real ceiling with slack while staying well inside a Firestore document.
 */
const maxPreviewBytes = 320 * 1024;
// Deliveries are rare by nature — a build delivers once, a revision round once more — so
// this bounds a looping agent rather than shaping normal use.
const DEFAULT_MAX_SUBMITS_PER_WINDOW = 20;

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
     * Publish (default): full gate; TRACE/PLAYTEST required. Keeps `npm run submit` safe.
     */
    mode: z.enum(['preview', 'publish']).default('publish'),
  })
  .superRefine((value, ctx) => {
    const inline = value.files?.length ?? 0;
    if (!value.fromStaged && inline === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'files is required (or set fromStaged=true after staging files one-by-one)',
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

const BuildPreviewInputSchema = z.object({
  html: z
    .string()
    .trim()
    .min(1, 'html is required')
    .max(Math.ceil((maxPreviewBytes * 4) / 3) + 1024, 'preview is too large')
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
  /** Deliveries one build may make per hour. */
  maxSubmitsPerWindow?: number;
  /** Called when a candidate version lands, so the job can move on to the gate. */
  /**
   * Starts whatever verifies a delivery. May answer with what the run cost — the gate
   * trigger reports Cloud Build's own build id, which is booked below so a line on the
   * bill can be traced back to the game that caused it.
   */
  onSourcesDelivered?: (input: {
    issueNumber: number;
    slug: string;
    version: string;
    /**
     * `preview` runs `check:game --preview`. `health` is the operator re-gate.
     * Omitted means the acceptance (publish) gate.
     */
    mode?: 'health' | 'preview';
  }) => Promise<{ buildId?: string } | void> | void;
}

type RejectionReason =
  | 'stopped'
  | 'rate_limited'
  | 'too_many_events'
  | 'too_many_shots'
  /** Self-round sources-delivery budget exhausted; machine-readable for agents. */
  | 'delivery_cap';

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
  const maxEventsPerBuild = options.maxEventsPerBuild ?? 500;
  const maxEventsPerWindow = options.maxEventsPerWindow ?? 240;
  const maxInboxChecksPerWindow = 600;
  // Screenshots are far heavier than sentences, so they get their own, tighter caps.
  const maxShotsPerBuild = options.maxShotsPerBuild ?? 24;
  const maxShotsPerWindow = options.maxShotsPerWindow ?? 40;
  // A watcher pushes whatever currently builds, so previews arrive on a cadence rather
  // than on the agent's judgement. Only the newest few are worth keeping — each one
  // obsoletes the last — but the hourly allowance is generous, because a build that
  // recompiles every thirty seconds for half an hour is working exactly as intended.
  const keepPreviews = options.keepPreviews ?? 4;
  const maxPreviewsPerWindow = options.maxPreviewsPerWindow ?? 90;
  const maxSubmitsPerWindow = options.maxSubmitsPerWindow ?? DEFAULT_MAX_SUBMITS_PER_WINDOW;
  const eventsByBuild = new Map<number, number[]>();
  const inboxChecksByBuild = new Map<number, number[]>();
  const shotsByBuild = new Map<number, number[]>();
  const previewsByBuild = new Map<number, number[]>();
  const submitsByBuild = new Map<number, number[]>();
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

  function stopReason(record: SubmissionRecord): 'abandoned' | 'published' | 'canceled' | null {
    if (record.abandonedAt) return 'abandoned';
    if (record.publishedAt) return 'published';
    // The operator's cancel. This check is what makes cancellation *mean* something on
    // the Copilot backend: its tasks API has no cancel endpoint, so the whole mechanism
    // is the job being terminal here — a live session reads `control.stop` on its next
    // report and winds down, and anything it sends anyway is rejected below. Before this
    // line, `copilot-backend.cancel` described that behaviour without anything
    // implementing it.
    if (resolveJobState(record) === 'canceled') return 'canceled';
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
    const { slug } = record;
    // Prefer previewVersion: publish writes both pointers to the same id, while a later
    // mode=preview only advances previewVersion. delivered-first would keep reporting the
    // stale publish red after the agent already fixed and re-previewed.
    const version = record.previewVersion ?? record.deliveredVersion;
    if (!options.gamesStore || !slug || !version) return null;
    try {
      const manifest = await options.gamesStore.getManifest(slug, version);
      if (manifest?.gate) {
        return {
          // Named so the agent can tell a verdict about *this* delivery from a stale one
          // about the previous round — the difference between "fix it" and "already fixed".
          version,
          lane: 'publish' as const,
          green: manifest.gate.green,
          ranAt: manifest.gate.ranAt,
          // The tail is where the chain names the check that stopped it; the runner has
          // already trimmed to 4000 characters for exactly this reason.
          ...(manifest.gate.report ? { report: manifest.gate.report } : {}),
          // `kit_outdated` is a distinct refusal: refresh the kit, do not chase check:game.
          ...(manifest.gate.status === 'kit_outdated' ? { status: 'kit_outdated' as const } : {}),
        };
      }
      // Preview-lane check: never report as publishable green (that ends the MCP round).
      if (manifest?.previewGate) {
        const kitOutdated = manifest.previewGate.status === 'kit_outdated';
        return {
          version,
          lane: 'preview' as const,
          green: false,
          previewPassed: manifest.previewGate.green,
          ranAt: manifest.previewGate.ranAt,
          ...(manifest.previewGate.report ? { report: manifest.previewGate.report } : {}),
          status: kitOutdated
            ? ('kit_outdated' as const)
            : manifest.previewGate.green
              ? ('preview_passed' as const)
              : ('preview_failed' as const),
        };
      }
      return null;
    } catch (error) {
      app.log.warn({ err: error, issueNumber: record.issueNumber, slug }, 'could not read the gate verdict');
      return null;
    }
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
        delivered: Boolean(record.deliveredVersion),
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
                    'outdated (`kit_outdated`). Refresh the kit (re-run get_kit), rebuild against ' +
                    'it, and deliver again with the new kitEngineRef.'
                  : gate.status === 'preview_failed'
                    ? `The preview check refused your delivery (${gate.version}). Fix typecheck/smoke/build, ` +
                      'then submit_sources again with mode=preview. TRACE.json is not required until mode=publish.'
                    : `The gate ran against your delivery and refused it (${gate.version}). You are not ` +
                      'done: nothing can be published until it passes. Read `gate.report` below — it ends ' +
                      'with the check that stopped the chain — fix the cause in your game, and deliver ' +
                      'again with `npm run submit -- <slug>` (or submit_sources mode=publish). Re-delivering ' +
                      'without a fix just stores another version that fails the same way.',
            }
          : {}),
        ...(record.deliveredVersion
          ? {}
          : {
              mustDeliver:
                'Nothing has been delivered for this build yet. Pushing a branch is not delivering — ' +
                'run `npm run submit -- <slug>` before you finish, or this session produces nothing.',
            }),
      },
    };
  }

  // IP ceilings sit above the per-build limiters inside each handler. Agents
  // share a Cloud Run egress IP, so these are generous; the build-keyed checks
  // remain the real abuse control.
  app.post(
    '/api/agent/build/progress',
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

      const text = sanitizeCreatorText(parsed.data.text, { singleLine: true }).slice(0, MAX_EVENT_TEXT);
      if (!text) {
        return reply.status(400).send({ error: 'text is required' });
      }
      const localized = parsed.data.textLocalized
        ? sanitizeCreatorText(parsed.data.textLocalized, { singleLine: true }).slice(0, MAX_EVENT_TEXT)
        : '';
      // A localized sentence without a language tag cannot be matched to a reader, so
      // it is dropped rather than shown to someone who may not read it.
      const hasLocalized = Boolean(localized && parsed.data.locale);
      const progress = parsed.data.progress
        ? { done: Math.min(parsed.data.progress.done, parsed.data.progress.total), total: parsed.data.progress.total }
        : undefined;

      const event: Omit<BuildEvent, 'id' | 'createdAt'> = {
        kind: parsed.data.kind,
        ...(parsed.data.step ? { step: parsed.data.step } : {}),
        text,
        ...(hasLocalized ? { textLocalized: localized, locale: parsed.data.locale } : {}),
        ...(progress ? { progress } : {}),
      };

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

  /**
   * A picture of the game as it stands, pushed before any commit.
   *
   * The agent already renders real frames headlessly (`npm run capture`), but those
   * only reach the creator once they are committed and pushed, which is late. This
   * takes the same PNG directly. Bytes are checked rather than trusted: the payload
   * must actually start with a PNG signature, because everything downstream serves it
   * back to a browser as an image.
   */
  app.post(
    '/api/agent/build/shot',
    {
      // Match the decoded PNG ceiling (base64-expanded) so the schema's max is reachable.
      bodyLimit: shotBodyLimit,
      config: { rateLimit: { max: 120, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;

      const parsed = BuildShotInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

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

      const bytes = Buffer.from(parsed.data.png, 'base64');
      if (bytes.length > maxShotBytes) {
        return reply.status(413).send({ error: 'screenshot is too large' });
      }
      if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        return reply.status(400).send({ error: 'not a PNG' });
      }

      const label = parsed.data.label
        ? sanitizeCreatorText(parsed.data.label, { singleLine: true }).slice(0, MAX_SHOT_LABEL)
        : '';
      const labelLocalized = parsed.data.labelLocalized
        ? sanitizeCreatorText(parsed.data.labelLocalized, { singleLine: true }).slice(0, MAX_SHOT_LABEL)
        : '';
      // Same rule as a progress sentence: a caption with no language tag cannot be
      // matched to a reader, so it is dropped rather than shown to the wrong one.
      const hasLocalized = Boolean(labelLocalized && parsed.data.locale);

      // Re-encoded from the decoded bytes rather than stored as sent: whatever
      // whitespace or padding variant arrived, what we keep is canonical base64.
      const stored = await store!.appendBuildShot(issueNumber, {
        data: bytes.toString('base64'),
        ...(label ? { label } : {}),
        ...(hasLocalized ? { labelLocalized, locale: parsed.data.locale } : {}),
      });
      options.onEvent?.(issueNumber);

      return reply.send({
        accepted: true,
        shot: { id: stored.id, createdAt: stored.createdAt, ...(label ? { label } : {}) },
        ...(await channelState(issueNumber, record)),
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
    '/api/agent/build/preview',
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
      if (bytes.length > maxPreviewBytes) {
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
    '/api/agent/build/sources/stage',
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
        // a platform handoff while the agent is still uploading files.
        await markBuildingFromChannel(issueNumber, record);
        await store?.touchLastAgentSignalAt(issueNumber, undefined, { key: 'staging_sources' });
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

  app.get(
    '/api/agent/build/sources/stage',
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
    '/api/agent/build/sources/stage/clear',
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
    '/api/agent/build/sources',
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

      if (stopReason(record)) {
        return reply.send({ accepted: false, rejected: 'stopped', ...(await channelState(issueNumber, record)) });
      }
      if (isRateLimited(submitsByBuild, issueNumber, now(), maxSubmitsPerWindow)) {
        return reply.send({ accepted: false, rejected: 'rate_limited', ...(await channelState(issueNumber, record)) });
      }
      // Self rounds bound gate spend per round. The budget resets when a new round
      // opens, so exhausting it never bricks the game's next attempt.
      if (record.builder === 'self') {
        const cap = selfBuildDeliveryCap();
        const used = record.roundDeliveryCount ?? 0;
        if (used >= cap) {
          return reply.send({
            accepted: false,
            rejected: 'delivery_cap',
            reason: 'self_build_delivery_cap',
            deliveryCap: cap,
            deliveriesUsed: used,
            ...(await channelState(issueNumber, record)),
          });
        }
        // Self-build deliveries must name the kit they built against — without it the
        // gate cannot apply the N/N−1 window and would burn a delivery slot guessing.
        if (!parsed.data.kitEngineRef) {
          return reply.status(400).send({
            error:
              'kitEngineRef is required for self-build deliveries — send the engineRef from ' +
              'the Creator Kit you built against (kit.json / get_kit).',
            reason: 'kit_engine_ref_required',
          });
        }
      }

      // The job's own slug wins whenever it has one. A build that has already been
      // associated with a game cannot deliver into a different one, whatever it sends.
      //
      // A job now carries its slug from the moment it is created — minted from the
      // creator's confirmed title and named in the agent's brief — so this check bites
      // on the *first* delivery rather than only on later ones. That is deliberate and
      // it is not a tightening for its own sake: the creator has been given
      // `/studio/<slug>` since they pressed create, and may already have shared a link
      // to the game, so a delivery that renamed it would break an address that was
      // handed out in good faith. The error names the slug the agent was briefed with,
      // which is the one piece of information it needs to deliver again correctly.
      const slug = record.slug ?? parsed.data.slug;
      if (record.slug && record.slug !== parsed.data.slug) {
        return reply.status(409).send({ error: `this build delivers to ${record.slug}, not ${parsed.data.slug}` });
      }
      // Bind the job to this slug on the first delivery, and do it *before* storing
      // anything. Without this the check above never fires for a job that arrived
      // without a slug: every delivery would find `record.slug` unset and be free to
      // name a different game. Writing it first rather than after the upload means a
      // second delivery racing the first still finds the binding in place.
      if (!record.slug && store) {
        await store.setSubmissionSlug(issueNumber, slug);
      }

      try {
        // Fresh walk state — not `record.state`. Delivery often races the background
        // dispatch that flips `queued`→`dispatched`; the local snapshot stays `queued`,
        // and `canTransition('queued','submitted')` is false, so the protective
        // transition was skipped and the job stayed `building` (CP-1 double-close).
        const stateAfterSignal = await markBuildingFromChannel(issueNumber, record);
        const mode: DeliveryMode = parsed.data.mode === 'preview' ? 'preview' : 'publish';
        const roundGeneration = store
          ? ((await store.ensureRoundGeneration(issueNumber)) ?? record.roundGeneration ?? 1)
          : (record.roundGeneration ?? 1);

        let files = parsed.data.files ?? [];
        if (parsed.data.fromStaged) {
          const staged = await options.gamesStore.getStagedSourceFiles({
            slug,
            issueNumber,
            roundGeneration,
          });
          if (staged.length === 0 && files.length === 0) {
            return reply.status(400).send({
              error:
                'fromStaged=true but the staging buffer is empty — call stage_source_file for each path first, ' +
                'or pass files[] inline',
            });
          }
          // Inline files win on path collision so a final fix can patch one file without
          // re-staging the whole tree.
          const byPath = new Map<string, string>();
          for (const file of staged) byPath.set(file.path, file.content);
          for (const file of files) byPath.set(file.path, file.content);
          files = [...byPath.entries()].map(([path, content]) => ({ path, content }));
        }

        const { version } = await options.gamesStore.putCandidateSources({
          slug,
          issueNumber,
          files,
          // Provenance: which backend built this version. Backend name on the dispatch
          // ('copilot' / 'self') is the durable record; builder is the round selector.
          backend: record.dispatch?.backend ?? record.builder,
          mode,
          ...(parsed.data.kitEngineRef ? { kitEngineRef: parsed.data.kitEngineRef } : {}),
        });
        // Staging is spent once the candidate is written — clear so the next iterate
        // starts clean and a half-edited buffer cannot leak into a later round.
        if (parsed.data.fromStaged) {
          await options.gamesStore.clearStagedSources({ slug, issueNumber, roundGeneration }).catch(() => {});
        }
        // Preview updates Studio's playable pointer without marking a sealed delivery —
        // control.delivered / publication reconciliation still wait for mode=publish.
        // Publish sets both (setSubmissionDeliveredVersion also refreshes previewVersion).
        if (mode === 'preview') {
          await store?.setSubmissionPreviewVersion(issueNumber, version);
        } else {
          await store?.setSubmissionDeliveredVersion(issueNumber, version);
        }
        if (store && record.builder === 'self') {
          await store.incrementRoundDeliveryCount(issueNumber);
        }
        // The shelf, studio, and notifications all show `record.title`. Games that
        // predated the naming step still carry the truncated prompt there, even after
        // the agent wrote a real name into SPEC.md — and publish already prefers the
        // SPEC title for the catalog, so the two surfaces disagreed. Adopting it here
        // keeps them aligned for every delivery from now on.
        if (store) {
          const spec = files.find((file) => file.path === 'SPEC.md')?.content;
          const deliveredTitle = spec ? parseSpecTitle(spec) : null;
          if (deliveredTitle) {
            const sanitized = sanitizeCreatorText(deliveredTitle, { singleLine: true }).slice(0, 80);
            if (sanitized.length >= 3 && sanitized !== record.title) {
              await store.setSubmissionTitle(issueNumber, sanitized);
            }
          }
        }
        // Publish only: without this the job stays `building`, and the agent's own
        // session then reports `completed` with a candidate present — which the
        // reconciler reads as "done, ready for review". Preview stays in building so a
        // vibe-coding loop never looks like a sealed candidate.
        if (store && mode === 'publish') {
          if (canTransition(stateAfterSignal, 'submitted')) {
            await store.recordJobTransition(issueNumber, {
              to: 'submitted',
              at: new Date().toISOString(),
              by: 'agent',
              reason: 'sources_delivered',
            });
          }
        }
        const gate = await options.onSourcesDelivered?.({
          issueNumber,
          slug,
          version,
          ...(mode === 'preview' ? { mode: 'preview' as const } : {}),
        });
        // Booked here rather than inside the trigger because this is where the job is
        // known: the trigger takes a slug and a version and has no idea whose ledger to
        // write to. Best-effort like every other write in this handler — the delivery has
        // already been accepted, and refusing it now would make the agent upload again.
        const buildId = gate && typeof gate === 'object' && typeof gate.buildId === 'string' ? gate.buildId : undefined;
        if (store && buildId) {
          await store
            .recordJobCost(issueNumber, {
              kind: 'gate_run',
              at: new Date().toISOString(),
              by: 'cloud-build',
              ref: buildId,
            })
            .catch(() => {});
        }
        options.onEvent?.(issueNumber);

        // Delivery is channel activity — refresh the quiet clock and revoke a prior MCP `end`.
        await store?.touchLastAgentSignalAt(issueNumber);

        const fresh = store ? ((await store.getSubmission(issueNumber)) ?? record) : record;
        return reply.send({
          accepted: true,
          mode,
          delivery: { slug, version },
          // True only when Cloud Build (or a test trigger) returned a build id —
          // not merely "we accepted the upload". Agents must not treat acceptance as
          // "preview is assembling" when the gate never started.
          gateStarted: Boolean(buildId),
          ...(buildId ? { buildId } : {}),
          ...(await channelState(issueNumber, fresh)),
        });
      } catch (error) {
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
   * the only upload so far, or a fix after a red publish), then deliveredVersion. When
   * this job has neither but its slug is already published — the shape of every
   * post-publish improvement, which is a *new* job on an existing game — fall back to
   * the live publication. Without that, `npm run restore` reports nothing to restore
   * and the agent rebuilds a stranger's game instead of revising the one the creator
   * asked to change.
   *
   * Scoped to the job's own game by the same token that authorizes its delivery, so a
   * build can restore what it (or its published predecessor) delivered and nothing else.
   */
  app.get(
    '/api/agent/build/sources',
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { record } = resolved;

      if (!options.gamesStore) {
        return reply.status(503).send({ error: 'delivery is not configured on this deployment' });
      }

      const slug = record.slug;
      let version = record.previewVersion ?? record.deliveredVersion;
      // An improvement job inherits the slug before it has delivered anything of its
      // own. The publication pointer is what is live — the version the creator played.
      if (slug && !version) {
        const publication = await store!.getPublication(slug);
        if (publication?.state === 'published') {
          version = publication.currentVersion;
        }
      }

      // Nothing delivered yet is the ordinary state of a first build, not an error:
      // the agent starts from the repository, exactly as it does today.
      if (!slug || !version) {
        return reply.send({ delivery: null, files: [] });
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
        files,
      });
    },
  );

  // Collect without reporting. Deliberately does NOT mark messages delivered — an
  // agent that reads a request and then crashes must not lose it. Acking is explicit.
  app.get(
    '/api/agent/build/inbox',
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

  app.post(
    '/api/agent/build/inbox/ack',
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
  app.post(
    '/api/agent/build/end',
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;

      if (stopReason(record)) {
        return reply.send({ accepted: false, rejected: 'stopped', ...(await channelState(issueNumber, record)) });
      }

      await store!.markAgentEnded(issueNumber);
      const fresh = (await store!.getSubmission(issueNumber)) ?? record;
      return reply.send({
        accepted: true,
        ended: true,
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
    '/api/agent/build/brief',
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;

      const pending = await store!.listPendingCreatorMessages(issueNumber);
      const seed = seedPayload(record);
      return reply.send({
        title: record.title,
        slug: record.slug ?? null,
        spec: record.spec ?? '',
        qa: record.qa ?? [],
        rules: AGENT_BUILD_RULES_DIGEST,
        constraints: buildConstraints(DEFAULT_BUILD_ORIENTATION),
        locales: briefLocales(record.locale),
        ...seed,
        pendingMessages: pending.map((message) => ({
          id: message.id,
          text: message.text,
          createdAt: message.createdAt,
        })),
      });
    },
  );

  /**
   * Round-0 seed draft stored on the job (self builds and platform seeds that persisted).
   * 404-shaped `{ available: false }` when none and not pending — not an auth failure.
   * Pending seeds return 200 so MCP clients recheck instead of scaffolding.
   */
  app.get(
    '/api/agent/build/seed',
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
        notice: null,
        files: [],
        references: [],
        notes: null,
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
    '/api/agent/build/kit',
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
        const engineRef = registry.current;
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
          // Shell-less MCP clients (ChatGPT Apps code_execution often cannot curl
          // storage.googleapis.com) should browse via the kit file tools instead of
          // unpacking — keep kitUrl/unpack for agents with a writable checkout.
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

  /**
   * List files inside the current Creator Kit without downloading the tarball to the agent.
   */
  app.get(
    '/api/agent/build/kit/files',
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
    '/api/agent/build/kit/search',
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
    '/api/agent/build/kit/file',
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
    '/api/agent/build/kit/files/read',
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
    '/api/agent/build/kit/file/fragment',
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

  /**
   * Curated first-party exemplars — allowlist JSON in-repo, never a store listing.
   */
  app.get(
    '/api/agent/build/examples',
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
    '/api/agent/build/examples/:slug',
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
    '/api/agent/build/examples/:slug/files',
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
    '/api/agent/build/examples/:slug/file',
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
    '/api/agent/build/gate',
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
          summary: 'nothing has been delivered yet',
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
        return reply.send({
          status: 'pending',
          deliveryId: version,
          summary: 'gate has not reported yet',
          access,
        });
      }

      const status = gate.green
        ? 'green'
        : gate.status === 'kit_outdated'
          ? 'kit_outdated'
          : gate.status === 'preview_passed'
            ? 'preview_passed'
            : gate.status === 'preview_failed'
              ? 'preview_failed'
              : 'red';
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
    '/api/agent/build/media',
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

      const metadataBody = await options.gamesStore.getDerivedArtifact(slug, version, 'media/metadata.json');
      const media = parseGameMedia(metadataBody?.toString('utf8') ?? null);

      // Runs that failed mid-capture store frames without metadata; the manifest's
      // gate verdict names the first stored frame (`media/opening.png` shape).
      const fallbackShot =
        !media && manifest.gate?.screenshot && /^media\/[a-z0-9][a-z0-9_.-]*\.png$/i.test(manifest.gate.screenshot)
          ? manifest.gate.screenshot.slice('media/'.length)
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
        ...(manifest.gate
          ? {
              gate: {
                green: manifest.gate.green,
                ranAt: manifest.gate.ranAt,
                ...(manifest.gate.status ? { status: manifest.gate.status } : {}),
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
