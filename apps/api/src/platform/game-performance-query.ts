import { REVIEWER_COHORTS } from '@gamedevpl/contract';
import { z } from 'zod';

export const GamePerformanceQuerySchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  days: z.number().int().min(1).max(30).default(7),
  performanceReviewers: z.enum(REVIEWER_COHORTS).default('include'),
  artifactVersion: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
