import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { MANAGED_UNAVAILABLE_ERROR, type ManagedAvailabilityGate } from '../agent-surface/managed-availability.js';
import type { GitHubClient } from '../catalog/github-client.js';
import {
  storeCreatorPlaytestShot,
  storeCreatorReferenceImages,
  formatPlaytestContextBlock,
} from '../delivery/creator-media.js';
import type { ContentChecker } from '../platform/moderation.js';
import { logModerationRejection } from '../platform/moderation-metrics.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import { sanitizeCreatorText } from '../platform/submission-status.js';
import { InvalidTokenError, mintToken, verifyToken } from '../platform/submission-token.js';
import { isBuilderKind, type BuilderKind } from './builder.js';
import type { ChatAgentImage } from './chat-agent.js';
import type { ChatOrchestration } from './chat-orchestration.js';
import { FeedbackRequestSchema, REFERENCE_IMAGES_BODY_LIMIT_BYTES } from './feedback-request.js';

// Structural: the real type is private to submissions.ts, which imports this.
type ImprovementRoundOutcome = { route: 'job'; jobId: number } | { route: 'unavailable'; reason: string } | null;

export interface ImproveRoutesOptions {
  store: Store | undefined;
  githubClient: GitHubClient | null;
  submissionTokenSecret: string | undefined;
  managedAvailabilityGate: ManagedAvailabilityGate | null | undefined;
  contentChecker: ContentChecker;
  now: () => number;
  dailyImprovementQuota: number;
  maxImprovementsPerWindow: number;
  improvementRateLimitWindowMs: number;
  checkUserAccess: (request: FastifyRequest, reply: FastifyReply) => boolean;
  builderOf: (record: SubmissionRecord | null | undefined) => BuilderKind;
  invalidateStatusCache: (issueNumber: number) => void;
  runChatAgent: ChatOrchestration['runChatAgent'];
  startImprovementRound: (input: {
    issueNumber: number;
    text: string;
    title: string;
    locale: string;
    log: { error: (context: object, message: string) => void };
    builder?: BuilderKind;
    requestedBy?: 'creator' | 'agent';
  }) => Promise<ImprovementRoundOutcome>;
}

// Change requests on a game that already shipped; drafts use feedback instead.
export function registerImproveRoutes(app: FastifyInstance, options: ImproveRoutesOptions): void {
  const {
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
  } = options;

  // Creator-requested improvement on an already-published game.

  // The draft path returns 409 once a game ships; this succeeds it.

  // A new games-repo issue amends the live SPEC, fenced as data.

  // Ownership is store-checked: a shared status link is not enough.

  // Per-route rate limit, registered in app.ts via registerRateLimit.

  // CodeQL's js/missing-rate-limiting model recognizes config.rateLimit.
  app.post(
    '/api/submissions/:token/improve',
    {
      bodyLimit: REFERENCE_IMAGES_BODY_LIMIT_BYTES,
      config: {
        rateLimit: {
          max: maxImprovementsPerWindow,
          timeWindow: improvementRateLimitWindowMs,
          errorResponseBuilder: () => ({
            error: 'too many improvement requests, please try again later',
          }),
        },
      },
    },
    async (request, reply) => {
      if (!githubClient || !submissionTokenSecret) {
        return reply.status(503).send({ error: 'submissions are not configured' });
      }
      if (!store) {
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

      const record = await store.getSubmission(issueNumber);
      if (!record || record.ownerUid !== request.user!.uid) {
        return reply.status(403).send({ error: 'only the creator can request improvements' });
      }
      if (record.abandonedAt) {
        return reply.status(409).send({ error: 'this build was abandoned' });
      }
      if (!record.publishedAt || !record.slug) {
        return reply.status(409).send({
          error: 'this game is not published yet; use feedback on the draft instead',
        });
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
      const dateStr = new Date(currentTime).toISOString().slice(0, 10);
      const sanitizedFeedback = sanitizeCreatorText(parsed.data.feedback, { singleLine: false });
      const sanitizedTitle = sanitizeCreatorText(`Improve ${record.title}`, { singleLine: true });
      let shotId: string | undefined;
      let referenceImageShotIds: string[] = [];
      let referenceImages: ChatAgentImage[] = [];
      if (parsed.data.context?.screenshotPng) {
        try {
          shotId = await storeCreatorPlaytestShot(store, issueNumber, parsed.data.context.screenshotPng);
        } catch (shotError) {
          request.log.error({ err: shotError }, 'failed to store creator playtest screenshot');
        }
      }
      if (parsed.data.context?.referenceImages?.length) {
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
      const requestedBuilder = parsed.data.builder;

      // Classify before spending any build-only quota or availability check.
      let studioAckText: string | undefined;
      // A pending copy left here by a failed reply attempt.
      let orphanedChatMessageId: string | undefined;
      const chatOutcome = await runChatAgent({
        issueNumber,
        message: sanitizedFeedback,
        scope: 'improve',
        record,
        locale: record.locale ?? 'en',
        ip: request.ip,
        uid: request.user!.uid,
        images: referenceImages,
      });
      if (chatOutcome?.kind === 'replied') {
        try {
          // Avoids an orphaned "delivered" copy if the reply write below fails.
          const creatorMessage = await store.appendCreatorMessage(issueNumber, inboxText);
          orphanedChatMessageId = creatorMessage.id;
          await store.appendCreatorMessage(issueNumber, chatOutcome.replyText, { origin: 'studio', delivered: true });
          await store.markCreatorMessagesDelivered(issueNumber, [creatorMessage.id]);
          orphanedChatMessageId = undefined;
          invalidateStatusCache(issueNumber);
          return reply.send({ ok: true, ...(shotId ? { shotId } : {}) });
        } catch (queueError) {
          // A failed write must not claim success — fail open instead.
          request.log.error({ err: queueError }, 'failed to record studio chat reply; failing open to the builder');
        }
      }
      if (chatOutcome?.kind === 'build') studioAckText = chatOutcome.ackText;

      const requestedBuilderForCheck = parsed.data.builder;
      const effectiveBuilder =
        requestedBuilderForCheck && isBuilderKind(requestedBuilderForCheck)
          ? requestedBuilderForCheck
          : builderOf(record);
      // Ahead of quota spend — a refused request must not cost a slot.
      if (effectiveBuilder === 'platform' && managedAvailabilityGate) {
        const availability = await managedAvailabilityGate.peek(request.user!.uid, dateStr);
        if (!availability.available) {
          return reply.status(409).send({ error: MANAGED_UNAVAILABLE_ERROR, reason: availability.reason });
        }
      }

      const quota = await store.checkAndIncrementQuota(
        request.user!.uid,
        dateStr,
        dailyImprovementQuota,
        'improvements',
      );
      if (!quota.allowed) {
        if (quota.tier === 'blocked') {
          return reply.status(403).send({ error: 'account is blocked' });
        }
        return reply.status(429).send({ error: 'daily improvement quota exceeded' });
      }

      const started = await startImprovementRound({
        issueNumber,
        text: inboxText,
        title: sanitizedTitle,
        // Their own words, so the new round's thread opens with them.
        requestedBy: 'creator',
        // The record was already loaded above for the ownership check.
        locale: record.locale ?? 'en',
        log: request.log,
        // A new job, so builder choice needs no active-round lock.
        ...(requestedBuilder && isBuilderKind(requestedBuilder) ? { builder: requestedBuilder } : {}),
      });
      if (!started) {
        return reply.status(502).send({ error: 'failed to submit improvement request' });
      }
      if (started.route === 'unavailable') {
        return reply.status(409).send({ error: MANAGED_UNAVAILABLE_ERROR, reason: started.reason });
      }
      // Resolve it now — the new round carries this request forward.
      if (orphanedChatMessageId) {
        await store.markCreatorMessagesDelivered(issueNumber, [orphanedChatMessageId]).catch(() => {});
      }
      // The ack belongs on the new thread, not the old one.
      if (studioAckText) {
        await store
          .appendCreatorMessage(started.jobId, studioAckText, { origin: 'studio_ack', delivered: true })
          .catch(() => {});
      }
      // Re-store under the new job: the brief endpoint reads that id.
      if (parsed.data.context?.referenceImages?.length) {
        try {
          await storeCreatorReferenceImages(store, started.jobId, parsed.data.context.referenceImages);
        } catch (shotError) {
          request.log.error({ err: shotError }, 'failed to store creator reference images on the new job');
        }
      }
      // A new job with its own capability the old token cannot address.

      // Minted as the shelf mints one, and no more exposed than that.
      const jobToken = mintToken(started.jobId, submissionTokenSecret);
      return reply.send({
        ok: true,
        jobId: started.jobId,
        token: jobToken,
        slug: record.slug,
        ...(shotId ? { shotId } : {}),
      });
    },
  );
}
