import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { assertAgentTokenActive, InvalidAgentTokenError, readBearerToken, verifyAgentToken } from './agent-token.js';
import { selfBuildDeliveryCap } from './builder.js';
import { InvalidUploadError, type GamesStore } from './games-store.js';
import { parseSpecTitle } from './github-client.js';
import { canTransition, resolveJobState } from './job-state.js';
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
/** ~300 KB decoded, which a pixel-art frame sits well inside. */
const maxShotBytes = 300 * 1024;
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
const BuildSourcesInputSchema = z.object({
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
    .min(1, 'files is required')
    .max(64, 'too many files'),
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
     * The delivery path never sets this; it exists so the operator's health re-gate can
     * reuse the same configured trigger (see gate-trigger.ts) instead of a second one
     * that would drift.
     */
    mode?: 'health';
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

  /**
   * Resolves the build a request is about. The token is the whole credential: it
   * carries the issue number, so there is nothing to address in the URL and nothing
   * a caller can point at a build they were not handed.
   */
  async function resolveBuild(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ issueNumber: number; record: SubmissionRecord } | null> {
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
      assertAgentTokenActive(claims, record, now());
    } catch (error) {
      if (!(error instanceof InvalidAgentTokenError)) throw error;
      // Stale/expired tokens are a strict 401 in every case — including terminal jobs.
      // `publishedAt` (and other stop reasons) are permanent; letting a signature-valid
      // but generation-stale or expired key through would grant indefinite read of
      // sources/inbox plus unguarded inbox/ack writes. The 401 body already is the
      // stop signal ("this build is finished — get a fresh prompt…"). Terminal-receipt
      // reads for a closed round's own gate verdict belong to BY-05/BY-06, not here.
      reply.status(401).send({ error: error.message || 'invalid build token' });
      return null;
    }

    return { issueNumber, record };
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
   */
  async function markBuildingFromChannel(issueNumber: number, record: SubmissionRecord): Promise<void> {
    if (!store) return;
    const current = record.state ?? 'queued';
    if (!canTransition(current, 'building')) return;
    await store.recordJobTransition(issueNumber, {
      to: 'building',
      at: new Date().toISOString(),
      by: 'agent',
      reason: 'channel_signal',
    });
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
    const { slug, deliveredVersion } = record;
    if (!options.gamesStore || !slug || !deliveredVersion) return null;
    try {
      const manifest = await options.gamesStore.getManifest(slug, deliveredVersion);
      if (!manifest?.gate) return null;
      return {
        // Named so the agent can tell a verdict about *this* delivery from a stale one
        // about the previous round — the difference between "fix it" and "already fixed".
        version: deliveredVersion,
        green: manifest.gate.green,
        ranAt: manifest.gate.ranAt,
        // The tail is where the chain names the check that stopped it; the runner has
        // already trimmed to 4000 characters for exactly this reason.
        ...(manifest.gate.report ? { report: manifest.gate.report } : {}),
        // `kit_outdated` is a distinct refusal: refresh the kit, do not chase check:game.
        ...(manifest.gate.status === 'kit_outdated' ? { status: 'kit_outdated' as const } : {}),
      };
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
        ...(gate && !gate.green
          ? {
              mustFixGate:
                gate.status === 'kit_outdated'
                  ? `The gate refused your delivery (${gate.version}) because the Creator Kit is ` +
                    'outdated (`kit_outdated`). Refresh the kit (re-run get_kit), rebuild against ' +
                    'it, and deliver again with the new kitEngineRef.'
                  : `The gate ran against your delivery and refused it (${gate.version}). You are not ` +
                    'done: nothing can be published until it passes. Read `gate.report` below — it ends ' +
                    'with the check that stopped the chain — fix the cause in your game, and deliver ' +
                    'again with `npm run submit -- <slug>`. Re-delivering without a fix just stores ' +
                    'another version that fails the same way.',
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
      await markBuildingFromChannel(issueNumber, record);
      options.onEvent?.(issueNumber);

      return reply.send({ accepted: true, event: stored, ...(await channelState(issueNumber, record)) });
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
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
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
        await markBuildingFromChannel(issueNumber, record);
        const { version } = await options.gamesStore.putCandidateSources({
          slug,
          issueNumber,
          files: parsed.data.files,
          // Provenance: which backend built this version. Backend name on the dispatch
          // ('copilot' / 'self') is the durable record; builder is the round selector.
          backend: record.dispatch?.backend ?? record.builder,
          ...(parsed.data.kitEngineRef ? { kitEngineRef: parsed.data.kitEngineRef } : {}),
        });
        // Recorded before the gate is asked to run: this is what the creator's preview
        // reads, and a delivered game should be playable on the status page whether or
        // not anything ever verifies it. The gate decides whether it may be *published*,
        // which is a different question from whether its author can watch it.
        await store?.setSubmissionDeliveredVersion(issueNumber, version);
        if (store && record.builder === 'self') {
          await store.incrementRoundDeliveryCount(issueNumber);
        }
        // The shelf, studio, and notifications all show `record.title`. Games that
        // predated the naming step still carry the truncated prompt there, even after
        // the agent wrote a real name into SPEC.md — and publish already prefers the
        // SPEC title for the catalog, so the two surfaces disagreed. Adopting it here
        // keeps them aligned for every delivery from now on.
        if (store) {
          const spec = parsed.data.files.find((file) => file.path === 'SPEC.md')?.content;
          const deliveredTitle = spec ? parseSpecTitle(spec) : null;
          if (deliveredTitle) {
            const sanitized = sanitizeCreatorText(deliveredTitle, { singleLine: true }).slice(0, 80);
            if (sanitized.length >= 3 && sanitized !== record.title) {
              await store.setSubmissionTitle(issueNumber, sanitized);
            }
          }
        }
        // Past the agent, and recorded as such. Without this the job stays `building`,
        // and the agent's own session then reports `completed` with a candidate present
        // — which the reconciler reads as "done, ready for review". That would promote a
        // game to the review queue on the agent's say-so, before our gate had run and
        // whatever it might have said. `submitted` is the state the reconciler refuses
        // to move, which is exactly the protection this needs.
        if (store) {
          const current = record.state ?? 'building';
          if (canTransition(current, 'submitted')) {
            await store.recordJobTransition(issueNumber, {
              to: 'submitted',
              at: new Date().toISOString(),
              by: 'agent',
              reason: 'sources_delivered',
            });
          }
        }
        const gate = await options.onSourcesDelivered?.({ issueNumber, slug, version });
        // Booked here rather than inside the trigger because this is where the job is
        // known: the trigger takes a slug and a version and has no idea whose ledger to
        // write to. Best-effort like every other write in this handler — the delivery has
        // already been accepted, and refusing it now would make the agent upload again.
        if (store && gate?.buildId) {
          await store
            .recordJobCost(issueNumber, {
              kind: 'gate_run',
              at: new Date().toISOString(),
              by: 'cloud-build',
              ref: gate.buildId,
            })
            .catch(() => {});
        }
        options.onEvent?.(issueNumber);

        return reply.send({
          accepted: true,
          delivery: { slug, version },
          ...(await channelState(issueNumber, record)),
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
   * Hands a build back its own last delivery.
   *
   * The channel was upload-only, and that quietly made the agent's *branch* the real
   * home of a game: a follow-up session could only continue the work if it happened to
   * land on the same branch, and when it did not — which is what happens whenever the
   * branch is unknown at resume time — the creator's game started again from nothing.
   * The store already holds every delivered version, immutably; this is the read that
   * makes it the source of truth rather than a copy nobody can get back.
   *
   * Scoped to the job's own game by the same token that authorizes its delivery, so a
   * build can restore what it delivered and nothing else.
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
      // Nothing delivered yet is the ordinary state of a first build, not an error:
      // the agent starts from the repository, exactly as it does today.
      if (!record.slug || !record.deliveredVersion) {
        return reply.send({ delivery: null, files: [] });
      }

      const manifest = await options.gamesStore.getManifest(record.slug, record.deliveredVersion);
      if (!manifest) {
        request.log.error(
          { slug: record.slug, version: record.deliveredVersion },
          'delivered version has no manifest — the store lost a version a job still points at',
        );
        return reply.status(502).send({ error: 'the delivered version could not be read back' });
      }

      const files = await Promise.all(
        manifest.sourceFiles.map(async (path) => ({
          path,
          content: await options.gamesStore!.getSourceFile(record.slug!, record.deliveredVersion!, path),
        })),
      );
      // A manifest listing a file the bucket does not have is a broken version, not a
      // partial one. Handing back a game with holes would have the agent "restore" a
      // deletion it never made.
      const missing = files.filter((file) => file.content === null).map((file) => file.path);
      if (missing.length > 0) {
        request.log.error(
          { slug: record.slug, version: record.deliveredVersion, missing },
          'delivered version is missing files its manifest lists',
        );
        return reply.status(502).send({ error: 'the delivered version could not be read back' });
      }

      return reply.send({
        delivery: { slug: record.slug, version: record.deliveredVersion },
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
}
