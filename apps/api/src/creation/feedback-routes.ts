import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { GitHubClient } from '../catalog/github-client.js';
import {
  formatPlaytestContextBlock,
  storeCreatorPlaytestShot,
  storeCreatorReferenceImages,
} from '../delivery/creator-media.js';
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
import { FeedbackRequestSchema, REFERENCE_IMAGES_BODY_LIMIT_BYTES } from './feedback-request.js';
import { detectStall, type JobTransition } from './job-state.js';

// Structural: the real ResumeOutcome lives in submissions.ts, which imports this.
type ResumeResult = { started: true } | { started: false; reason: string };

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
  invalidateStatusCache: (issueNumber: number) => void;
  runChatAgent: ChatOrchestration['runChatAgent'];
  resumeBuild: (input: {
    issueNumber: number;
    feedback: string;
    locale: string;
    log: { error: (context: object, message: string) => void };
    undelivered?: boolean;
    feedbackQueueFailed?: boolean;
    builder?: BuilderKind;
    preserveRoundBudget?: boolean;
    transition?: { by: JobTransition['by']; reason: string };
  }) => Promise<ResumeResult>;
}

// Change requests on a draft, before it ships; published games use improve.
export function registerFeedbackRoutes(app: FastifyInstance, options: FeedbackRoutesOptions): void {
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

  // Post-play revision loop: the token holder relays what to change.

  // It reaches the agent through the job's inbox, not GitHub.

  // Creator text is sanitized and fenced as data, never as instructions.

  // A published game cannot be revised here — that is the improve route.
  app.post(
    '/api/submissions/:token/feedback',
    {
      bodyLimit: REFERENCE_IMAGES_BODY_LIMIT_BYTES,
      config: { rateLimit: { max: maxFeedbackPerWindow, timeWindow: feedbackRateLimitWindowMs } },
    },
    async (request, reply) => {
      if (!githubClient || !submissionTokenSecret) {
        return reply.status(503).send({ error: 'submissions are not configured' });
      }

      if (!checkUserAccess(request, reply)) {
        return;
      }

      const token = z.string().parse((request.params as { token?: string }).token);

      let issueNumber: number;
      try {
        issueNumber = verifyToken(token, submissionTokenSecret);
      } catch (error) {
        if (error instanceof InvalidTokenError) {
          return reply.status(400).send({ error: 'invalid submission token' });
        }
        throw error;
      }

      const parsed = FeedbackRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      // 1. Content moderation before spending any quota / GitHub write.
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

      // 2. Coarse per-IP rate limit.
      if (isRateLimited(feedbackByIp, request.ip, currentTime, maxFeedbackPerWindow, feedbackRateLimitWindowMs)) {
        return reply.status(429).send({ error: 'too many feedback requests, please try again later' });
      }

      const dateStr = new Date(currentTime).toISOString().slice(0, 10);

      // A published game is done: a revision is a new idea.

      // The record is the authority; there is no PR to consult.
      const record = store ? await store.getSubmission(issueNumber) : null;
      if (record?.publishedAt) {
        return reply.status(409).send({ error: 'this game is already published; submit a new idea to make changes' });
      }
      // Publishing already closed the round, so no session collects mail.

      // A fresh resume mid-bake would race the bake.
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
          shotId = await storeCreatorPlaytestShot(store, issueNumber, parsed.data.context.screenshotPng);
        } catch (shotError) {
          request.log.error({ err: shotError }, 'failed to store creator playtest screenshot');
        }
      }
      if (store && parsed.data.context?.referenceImages?.length) {
        try {
          const stored = await storeCreatorReferenceImages(store, issueNumber, parsed.data.context.referenceImages);
          referenceImageShotIds = stored.ids;
          referenceImages = stored.images;
        } catch (shotError) {
          request.log.error({ err: shotError }, 'failed to store creator reference images');
        }
      }
      const contextBlock = formatPlaytestContextBlock(parsed.data.context, shotId, referenceImageShotIds);
      const inboxText = contextBlock ? `${sanitizedFeedback}\n\n${contextBlock}` : sanitizedFeedback;

      // A revision is a new task on the job's own workspace.

      // Nothing delivered yet means there is no revision and nothing to restore.

      // Pass that through, so recovery is only promised when possible.
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
          // Ended or quiet self to platform is the handoff escape hatch.

          // Anything else stays locked: two agents cannot write one round.
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
      // Fronts the message (chat-agent.ts); null takes this route unchanged.
      let studioAckText: string | undefined;
      // Guards the fallback queuing step below against a duplicate write.
      let creatorMessageQueued = false;
      // An explicit builder switch is routing intent, not chat.

      // Letting the chat agent answer it would block the new round.
      if (record && !builderChanging) {
        const chatOutcome = await runChatAgent({
          issueNumber,
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
            // Marked delivered once the reply lands too — see markCreatorMessagesDelivered below.
            const creatorMessage = await store.appendCreatorMessage(issueNumber, inboxText);
            creatorMessageQueued = true;
            await store.appendCreatorMessage(issueNumber, chatOutcome.replyText, {
              origin: 'studio',
              delivered: true,
            });
            await store.markCreatorMessagesDelivered(issueNumber, [creatorMessage.id]);
            invalidateStatusCache(issueNumber);
            return reply.send({ ok: true, ...(shotId ? { shotId } : {}) });
          } catch (queueError) {
            // A failed write must not claim success — fail open instead.
            request.log.error({ err: queueError }, 'failed to record studio chat reply; failing open to the builder');
          }
        }
        if (chatOutcome?.kind === 'build') studioAckText = chatOutcome.ackText;
      }

      // 4. Daily per-user quota — a conversational reply above already returned.
      if (store) {
        const quota = await store.checkAndIncrementQuota(request.user!.uid, dateStr, dailyFeedbackQuota, 'feedback');
        if (!quota.allowed) {
          if (quota.tier === 'blocked') {
            return reply.status(403).send({ error: 'account is blocked' });
          }
          return reply.status(429).send({ error: 'daily feedback quota exceeded' });
        }
      }

      // Queue before dispatch: a hung dispatch used to lose the note.

      // The inbox is the durable copy; the dispatch is the head start.
      let queued = creatorMessageQueued;
      if (store && !creatorMessageQueued) {
        try {
          await store.appendCreatorMessage(issueNumber, inboxText);
          queued = true;
        } catch (queueError) {
          request.log.error({ err: queueError }, 'failed to queue feedback for the agent');
        }
      }
      const appendStudioAck = async () => {
        if (!store || !queued || !studioAckText) return;
        await store
          .appendCreatorMessage(issueNumber, studioAckText, { origin: 'studio_ack', delivered: true })
          .catch(() => {});
      };

      // A round with a dispatch ref steers via the inbox only.

      // Two tasks on one round is what produced concurrent sessions.

      // Queue only after the append: a failure must not look sent.

      // A queued job with no refs is the opposite: nobody polls.

      // Self to platform must resume, or the mail dies unread.
      if (record && shouldSteerFeedbackViaInbox(record, { builderChanging, stall: currentStall })) {
        if (!queued) {
          return reply.status(503).send({ error: 'failed to queue feedback for the agent' });
        }
        // The current agent accepted the note, so its acknowledgement is truthful.
        await appendStudioAck();
        // Drop the cache so the note appears on the next poll.
        invalidateStatusCache(issueNumber);
        return reply.send({
          ok: true,
          ...(shotId ? { shotId } : {}),
        });
      }

      const handoffStall = builderChanging && record ? currentStall : null;
      const handoffReason =
        record?.agentEndedAt || handoffStall === 'ended'
          ? 'agent_ended_handoff'
          : builderChanging
            ? 'quiet_builder_handoff'
            : 'creator_feedback';

      const outcome = await resumeBuild({
        issueNumber,
        feedback: inboxText,
        locale: creatorLocale,
        log: request.log,
        // Handoff always bumps the round generation, killing the self token.
        ...(builderChanging ? {} : record?.deliveredVersion ? {} : { undelivered: true }),
        ...(requestedBuilder && isBuilderKind(requestedBuilder) ? { builder: requestedBuilder } : {}),
        ...(builderChanging ? { preserveRoundBudget: true } : {}),
        // Inbox write above failed but this path still dispatches — see BuildBrief.
        ...(!queued ? { feedbackQueueFailed: true } : {}),
        // Name the actor so a reopen is not read as GitHub-derived.
        transition: {
          by: 'creator',
          reason: handoffReason,
        },
      });

      // Store the acknowledgement only after a new session is accepted.
      if (outcome.started) await appendStudioAck();
      // Without this, Studio served the previous round for up to a minute.

      // That is the false "agent not connected" warning.
      invalidateStatusCache(issueNumber);

      // Accepted, and honest about what it bought.

      // The message is kept either way; the next round reads it.

      // But a round that never started must not look like one working.
      return reply.send({
        ok: true,
        ...(shotId ? { shotId } : {}),
        ...(outcome.started ? {} : { roundStarted: false, reason: outcome.reason }),
      });
    },
  );
}
