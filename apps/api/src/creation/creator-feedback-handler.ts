import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { GitHubClient } from '../catalog/github-client.js';
import { storeCreatorPlaytestShot, storeCreatorReferenceImages } from '../platform/creator-media-store.js';
import { formatPlaytestContextBlock } from '../platform/playtest-context.js';
import { cliSurfaceEnabled } from '../platform/cli-surface.js';
import { isRateLimited } from '../platform/ip-rate-limit.js';
import { logModerationRejection } from '../platform/moderation-metrics.js';
import type { ContentChecker } from '../platform/moderation.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import { sanitizeCreatorText } from '../platform/submission-status.js';
import { InvalidTokenError, verifyToken } from '../platform/submission-token.js';
import {
  allowsSelfToPlatformHandoff,
  isActiveBuildRound,
  isBuilderKind,
  shouldSteerFeedbackViaInbox,
  type BuilderKind,
} from './builder.js';
import type { ChatAgentImage } from './chat-agent.js';
import type { ChatOrchestration } from './chat-orchestration.js';
import { loadRecentChatTurns } from './chat-turns-history.js';
import { FeedbackRequestSchema, TurnRequestSchema } from './feedback-request.js';
import { detectStall, type JobTransition } from './job-state.js';
import type { ResumeOutcome } from './resume-build.js';

export type CreatorMessageMode = 'feedback' | 'turn';

export interface FeedbackRoutesOptions {
  store: Store | undefined;
  githubClient: GitHubClient | null;
  submissionTokenSecret: string | undefined;
  contentChecker: ContentChecker;
  now: () => number;
  dailyFeedbackQuota: number;
  maxFeedbackPerWindow: number;
  feedbackRateLimitWindowMs: number;
  feedbackByIp: Map<string, number[]>;
  checkUserAccess: (request: FastifyRequest, reply: FastifyReply) => boolean;
  builderOf: (record: SubmissionRecord | null | undefined) => BuilderKind;
  invalidateStatusCache: (jobId: number) => void;
  runChatAgent: ChatOrchestration['runChatAgent'];
  resumeBuild: (input: {
    jobId: number;
    feedback: string;
    locale: string;
    log: { error: (context: object, message: string) => void };
    undelivered?: boolean;
    feedbackQueueFailed?: boolean;
    builder?: BuilderKind;
    preserveRoundBudget?: boolean;
    transition?: { by: JobTransition['by']; reason: string };
  }) => Promise<ResumeOutcome>;
}

function parseBody(mode: CreatorMessageMode, body: unknown) {
  if (mode === 'turn') {
    const parsed = TurnRequestSchema.safeParse(body);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'invalid request' };
    return { data: { feedback: parsed.data.text, builder: parsed.data.builder, context: parsed.data.context } };
  }
  const parsed = FeedbackRequestSchema.safeParse(body);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'invalid request' };
  return { data: parsed.data };
}

function sendFeedbackOk(reply: FastifyReply, shotId: string | undefined, extra: Record<string, unknown> = {}) {
  return reply.send({ ok: true, ...(shotId ? { shotId } : {}), ...extra });
}

function sendTurnReply(reply: FastifyReply, text: string) {
  return reply.send({ kind: 'reply', text });
}

function sendTurnBuild(reply: FastifyReply, roundId: number, ack?: string) {
  return reply.send({ kind: 'build', roundId, ...(ack ? { ack } : {}) });
}

export async function handleCreatorFeedback(
  options: FeedbackRoutesOptions,
  request: FastifyRequest,
  reply: FastifyReply,
  mode: CreatorMessageMode,
): Promise<unknown> {
  const {
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
  } = options;

  if (mode === 'turn' && !cliSurfaceEnabled()) {
    return reply.status(404).send({ error: 'not found' });
  }
  if (!githubClient || !submissionTokenSecret) {
    return reply.status(503).send({ error: 'submissions are not configured' });
  }
  if (!checkUserAccess(request, reply)) return;

  const token = z.string().parse((request.params as { token?: string }).token);
  let jobId: number;
  try {
    jobId = verifyToken(token, submissionTokenSecret);
  } catch (error) {
    if (error instanceof InvalidTokenError) {
      return reply.status(400).send({ error: 'invalid submission token' });
    }
    throw error;
  }

  const parsed = parseBody(mode, request.body);
  if ('error' in parsed) {
    return reply.status(400).send({ error: parsed.error });
  }

  const moderation = await contentChecker.checkFields([parsed.data.feedback]);
  if (!moderation.allowed) {
    logModerationRejection(request.log, {
      surface: 'creator_feedback',
      uid: request.user?.uid,
      category: moderation.category,
    });
    return reply.status(422).send({ error: 'content_rejected', category: moderation.category ?? 'other' });
  }

  const currentTime = now();
  if (isRateLimited(feedbackByIp, request.ip, currentTime, maxFeedbackPerWindow, feedbackRateLimitWindowMs)) {
    return reply.status(429).send({ error: 'too many feedback requests, please try again later' });
  }
  const dateStr = new Date(currentTime).toISOString().slice(0, 10);
  const record = store ? await store.getSubmission(jobId) : null;
  if (record?.publishedAt) {
    return reply.status(409).send({ error: 'this game is already published; submit a new idea to make changes' });
  }
  if (record?.state === 'publishing') {
    return reply.status(409).send({ error: 'this game is currently publishing; try again in a moment' });
  }

  const sanitizedFeedback = sanitizeCreatorText(parsed.data.feedback, { singleLine: false });
  const creatorLocale = record?.locale ?? 'en';
  let shotId: string | undefined;
  let referenceImageShotIds: string[] = [];
  let referenceImages: ChatAgentImage[] = [];
  if (store && parsed.data.context?.screenshotPng) {
    try {
      shotId = await storeCreatorPlaytestShot(store, jobId, parsed.data.context.screenshotPng);
    } catch (shotError) {
      request.log.error({ err: shotError }, 'failed to store creator playtest screenshot');
    }
  }
  if (store && parsed.data.context?.referenceImages?.length) {
    try {
      const stored = await storeCreatorReferenceImages(store, jobId, parsed.data.context.referenceImages);
      referenceImageShotIds = stored.ids;
      referenceImages = stored.images;
    } catch (shotError) {
      request.log.error({ err: shotError }, 'failed to store creator reference images');
    }
  }
  const contextBlock = formatPlaytestContextBlock(parsed.data.context, shotId, referenceImageShotIds);
  const inboxText = contextBlock ? `${sanitizedFeedback}\n\n${contextBlock}` : sanitizedFeedback;
  const requestedBuilder = parsed.data.builder;
  const builderChanging = Boolean(
    record && requestedBuilder && isBuilderKind(requestedBuilder) && requestedBuilder !== builderOf(record),
  );
  const currentStall = record
    ? detectStall({
        state: record.state ?? 'queued',
        stateSince: record.stateSince ?? record.createdAt,
        lastAgentSignalAt: record.lastAgentSignalAt,
        agentState: record.agentState,
        agentEndedAt: record.agentEndedAt,
        now: now(),
        builder: builderOf(record),
      })
    : null;
  if (record && requestedBuilder && isActiveBuildRound(record)) {
    const current = builderOf(record);
    if (requestedBuilder !== current) {
      if (
        !allowsSelfToPlatformHandoff({
          currentBuilder: current,
          requestedBuilder,
          stall: currentStall,
          agentEndedAt: record.agentEndedAt,
        })
      ) {
        return reply.status(409).send({
          error: 'builder_locked',
          reason: 'active_round',
          builder: current,
        });
      }
    }
  }

  let studioAckText: string | undefined;
  let creatorMessageQueued = false;
  if (record && !builderChanging) {
    const chatOutcome = await runChatAgent({
      jobId,
      message: sanitizedFeedback,
      scope: 'draft',
      record,
      locale: creatorLocale,
      ip: request.ip,
      uid: request.user!.uid,
      images: referenceImages,
    });
    if (chatOutcome?.kind === 'replied' && store) {
      try {
        const creatorMessage = await store.appendCreatorMessage(jobId, inboxText);
        creatorMessageQueued = true;
        await store.appendCreatorMessage(jobId, chatOutcome.replyText, {
          origin: 'studio',
          delivered: true,
        });
        await store.markCreatorMessagesDelivered(jobId, [creatorMessage.id]);
        invalidateStatusCache(jobId);
        if (mode === 'turn') return sendTurnReply(reply, chatOutcome.replyText);
        return sendFeedbackOk(reply, shotId);
      } catch (queueError) {
        request.log.error({ err: queueError }, 'failed to record studio chat reply; failing open to the builder');
      }
    }
    if (chatOutcome?.kind === 'build') studioAckText = chatOutcome.ackText;
  }

  if (store) {
    const quota = await store.checkAndIncrementQuota(request.user!.uid, dateStr, dailyFeedbackQuota, 'feedback');
    if (!quota.allowed) {
      if (quota.tier === 'blocked') {
        return reply.status(403).send({ error: 'account is blocked' });
      }
      return reply.status(429).send({ error: 'daily feedback quota exceeded' });
    }
  }

  let queued = creatorMessageQueued;
  if (store && !creatorMessageQueued) {
    try {
      await store.appendCreatorMessage(jobId, inboxText);
      queued = true;
    } catch (queueError) {
      request.log.error({ err: queueError }, 'failed to queue feedback for the agent');
    }
  }
  const appendStudioAck = async () => {
    if (!store || !queued || !studioAckText) return;
    await store.appendCreatorMessage(jobId, studioAckText, { origin: 'studio_ack', delivered: true }).catch(() => {});
  };

  if (record && shouldSteerFeedbackViaInbox(record, { builderChanging, stall: currentStall })) {
    if (!queued) {
      return reply.status(503).send({ error: 'failed to queue feedback for the agent' });
    }
    await appendStudioAck();
    invalidateStatusCache(jobId);
    if (mode === 'turn') return sendTurnBuild(reply, jobId, studioAckText);
    return sendFeedbackOk(reply, shotId);
  }

  const handoffStall = builderChanging && record ? currentStall : null;
  const handoffReason =
    record?.agentEndedAt || handoffStall === 'ended'
      ? 'agent_ended_handoff'
      : builderChanging
        ? 'quiet_builder_handoff'
        : 'creator_feedback';

  const outcome = await resumeBuild({
    jobId,
    feedback: inboxText,
    locale: creatorLocale,
    log: request.log,
    ...(builderChanging ? {} : record?.deliveredVersion ? {} : { undelivered: true }),
    ...(requestedBuilder && isBuilderKind(requestedBuilder) ? { builder: requestedBuilder } : {}),
    ...(builderChanging ? { preserveRoundBudget: true } : {}),
    ...(!queued ? { feedbackQueueFailed: true } : {}),
    transition: {
      by: 'creator',
      reason: handoffReason,
    },
  });

  if (outcome.started) await appendStudioAck();
  invalidateStatusCache(jobId);
  if (mode === 'turn') {
    if (outcome.started) return sendTurnBuild(reply, jobId, studioAckText);
    const text =
      outcome.reason === 'no_capacity'
        ? 'Saved — but no build round could start: the build agent is out of capacity right now.'
        : "Saved — but a new build round didn't start.";
    if (store && queued) {
      await store.appendCreatorMessage(jobId, text, { origin: 'studio', delivered: true }).catch(() => {});
    }
    return sendTurnReply(reply, text);
  }
  return sendFeedbackOk(reply, shotId, outcome.started ? {} : { roundStarted: false, reason: outcome.reason });
}

export async function handleCreatorTurnsGet(
  options: FeedbackRoutesOptions,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<unknown> {
  if (!cliSurfaceEnabled()) {
    return reply.status(404).send({ error: 'not found' });
  }
  const { store, githubClient, submissionTokenSecret, checkUserAccess } = options;
  if (!githubClient || !submissionTokenSecret) {
    return reply.status(503).send({ error: 'submissions are not configured' });
  }
  if (!checkUserAccess(request, reply)) return;

  const token = z.string().parse((request.params as { token?: string }).token);
  let jobId: number;
  try {
    jobId = verifyToken(token, submissionTokenSecret);
  } catch (error) {
    if (error instanceof InvalidTokenError) {
      return reply.status(400).send({ error: 'invalid submission token' });
    }
    throw error;
  }
  if (!store) return reply.send({ turns: [] });
  const turns = await loadRecentChatTurns(store, jobId);
  return reply.send({ turns });
}
