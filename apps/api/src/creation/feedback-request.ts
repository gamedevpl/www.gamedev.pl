import { BUILDERS, MAX_SHOT_BYTES } from '@gamedevpl/contract';
import { z } from 'zod';
import { MAX_REFERENCE_IMAGES } from '../delivery/creator-media.js';

// Shared by the create, feedback and improve routes, which now live apart.
export const MAX_SHOT_BASE64_CHARS = Math.ceil((MAX_SHOT_BYTES * 4) / 3) + 1024;

const referenceImageSchema = z.string().max(MAX_SHOT_BASE64_CHARS, 'reference image is too large');

// Four images at that cap exceed Fastify's default body limit.
export const REFERENCE_IMAGES_BODY_LIMIT_BYTES = MAX_REFERENCE_IMAGES * MAX_SHOT_BASE64_CHARS + 64 * 1024;

export const ReferenceImagesSchema = z.array(referenceImageSchema).max(MAX_REFERENCE_IMAGES);

export const FeedbackRequestSchema = z.object({
  feedback: z
    .string()
    .trim()
    .min(10, 'feedback must be at least 10 characters')
    .max(2000, 'feedback must be at most 2000 characters'),

  // Builder for the new round this opens, refused while one is active.

  // Switching builders is a round-boundary decision only.
  builder: z.enum(BUILDERS).optional(),

  // Optional playtest attachment: a paused-frame PNG plus an instrumentation digest.

  // Data, never instructions — same fencing as the free-text feedback.
  context: z
    .object({
      screenshotPng: z.string().max(MAX_SHOT_BASE64_CHARS, 'screenshot is too large').optional(),
      instrumentation: z
        .object({
          playSeconds: z.number().int().min(0).max(86_400).optional(),
          lastAliveFrames: z.number().int().min(0).max(1_000_000).nullable().optional(),
          errors: z.array(z.string().max(200)).max(10).optional(),
          progress: z.array(z.string().max(80)).max(20).optional(),
        })
        .optional(),
      // Same shape as screenshotPng, plural — a steering message may carry several.
      referenceImages: ReferenceImagesSchema.optional(),
    })
    .optional(),
});

export const TurnRequestSchema = z.object({
  text: z.string().trim().min(1, 'text is required').max(2000, 'text must be at most 2000 characters'),
  builder: z.enum(BUILDERS).optional(),
  context: FeedbackRequestSchema.shape.context,
});
