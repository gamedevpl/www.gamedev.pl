// Tiles for one visual CreatorQA question, asked for after refine returns.

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { checkUserAccess } from '../platform/auth.js';
import { isRateLimited } from '../platform/ip-rate-limit.js';
import { rejectionFor, type ContentChecker } from '../platform/moderation.js';
import { logModerationRejection } from '../platform/moderation-metrics.js';
import {
  createOptionImageGeneratorFromEnv,
  MAX_OPTION_IMAGES,
  type OptionImage,
  type OptionImageGenerator,
} from './option-images.js';

// A sanity bound against abuse, not the product limit below.
const MAX_OPTIONS_ACCEPTED = 24;

// Same bounds refine accepts, because this is the same concept text.
const OptionImageRequestSchema = z.object({
  concept: z.string().trim().min(30, 'concept must be at least 30 characters').max(4000),
  question: z.string().trim().min(1, 'question must not be empty').max(500),
  options: z
    .array(
      z.object({
        label: z.string().trim().min(1, 'option label must not be empty').max(120),
        detail: z.string().trim().max(500).optional(),
      }),
    )
    .min(1, 'at least one option is required')
    .max(MAX_OPTIONS_ACCEPTED, `at most ${MAX_OPTIONS_ACCEPTED} options may be sent`),
});

export interface OptionImageRouteOptions {
  contentChecker: ContentChecker;
  generator?: OptionImageGenerator;
}

// Refine's own ceiling; the app calls this only after refine.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW_PER_IP = 30;

export async function registerOptionImageRoutes(app: FastifyInstance, options: OptionImageRouteOptions): Promise<void> {
  const contentChecker = options.contentChecker;
  const generator = options.generator ?? createOptionImageGeneratorFromEnv();
  const requestsByIp = new Map<string, number[]>();

  app.post('/api/submissions/option-images', async (request: FastifyRequest, reply) => {
    if (!checkUserAccess(request, reply)) {
      return reply;
    }

    // Unconfigured is a normal state, and the panel renders plain text options.
    if (!generator) {
      return { images: [] satisfies OptionImage[] };
    }

    const parseResult = OptionImageRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues[0]?.message ?? 'invalid request' });
    }

    if (
      isRateLimited(requestsByIp, request.clientIp, Date.now(), MAX_REQUESTS_PER_WINDOW_PER_IP, RATE_LIMIT_WINDOW_MS)
    ) {
      return reply.status(429).send({ error: 'too many option image requests, please try again later' });
    }

    const { concept, question, options: askedOptions } = parseResult.data;

    // All-or-nothing in the UI: a partial set is wasted spend.
    if (askedOptions.length > MAX_OPTION_IMAGES) {
      request.log.info(
        { asked: askedOptions.length, cap: MAX_OPTION_IMAGES },
        'option images skipped: too many options',
      );
      return { images: [] satisfies OptionImage[] };
    }

    // Nothing here proves this text came from a refine.
    const moderatedFields = [concept, question, ...askedOptions.flatMap((o) => [o.label, o.detail ?? ''])].filter(
      (field) => field.length > 0,
    );
    const moderation = await contentChecker.checkFields(moderatedFields);
    if (!moderation.allowed) {
      logModerationRejection(request.log, {
        surface: 'option_images',
        uid: request.user?.uid,
        category: moderation.category,
        unavailable: moderation.unavailable,
      });
      const rejection = rejectionFor(moderation);
      return reply.status(rejection.status).send({ error: rejection.error, category: rejection.category });
    }

    const startedAt = Date.now();
    try {
      const images = await generator.generate({
        concept,
        question,
        options: askedOptions,
      });
      request.log.info(
        { asked: askedOptions.length, produced: images.length, durationMs: Date.now() - startedAt },
        'option images complete',
      );
      return { images };
    } catch (err) {
      // Fail-open: the survey works without pictures, so never fail the screen.
      request.log.warn({ err, durationMs: Date.now() - startedAt }, 'option image generation failed');
      return { images: [] satisfies OptionImage[] };
    }
  });
}
