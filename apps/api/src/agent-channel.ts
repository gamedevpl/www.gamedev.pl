import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { InvalidAgentTokenError, readBearerToken, verifyAgentToken } from './agent-token.js';
import type { CreatorMessage, Store, SubmissionRecord } from './store.js';
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
}

type RejectionReason = 'stopped' | 'rate_limited' | 'too_many_events';

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
  const eventsByBuild = new Map<number, number[]>();
  const inboxChecksByBuild = new Map<number, number[]>();

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

    let issueNumber: number;
    try {
      issueNumber = verifyAgentToken(token, agentTokenSecret);
    } catch (error) {
      if (error instanceof InvalidAgentTokenError) {
        reply.status(401).send({ error: 'invalid build token' });
        return null;
      }
      throw error;
    }

    const record = await store.getSubmission(issueNumber);
    if (!record) {
      reply.status(404).send({ error: 'unknown build' });
      return null;
    }

    return { issueNumber, record };
  }

  function stopReason(record: SubmissionRecord): 'abandoned' | 'published' | null {
    if (record.abandonedAt) return 'abandoned';
    if (record.publishedAt) return 'published';
    return null;
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
    return {
      pending: pending.map((message) => ({ id: message.id, text: message.text, createdAt: message.createdAt })),
      control: {
        stop: reason !== null,
        ...(reason ? { reason } : {}),
        // The creator's language, so the agent can write its next update in it.
        locale: record.locale ?? 'en',
      },
    };
  }

  app.post('/api/agent/build/progress', async (request, reply) => {
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
    options.onEvent?.(issueNumber);

    return reply.send({ accepted: true, event: stored, ...(await channelState(issueNumber, record)) });
  });

  // Collect without reporting. Deliberately does NOT mark messages delivered — an
  // agent that reads a request and then crashes must not lose it. Acking is explicit.
  app.get('/api/agent/build/inbox', async (request, reply) => {
    const resolved = await resolveBuild(request, reply);
    if (!resolved) return reply;
    const { issueNumber, record } = resolved;

    if (isRateLimited(inboxChecksByBuild, issueNumber, now(), maxInboxChecksPerWindow)) {
      return reply.status(429).send({ error: 'too many inbox checks' });
    }

    return reply.send(await channelState(issueNumber, record));
  });

  app.post('/api/agent/build/inbox/ack', async (request, reply) => {
    const resolved = await resolveBuild(request, reply);
    if (!resolved) return reply;
    const { issueNumber, record } = resolved;

    const parsed = AckRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }

    await store!.markCreatorMessagesDelivered(issueNumber, parsed.data.ids);
    return reply.send({ ok: true, ...(await channelState(issueNumber, record)) });
  });
}
