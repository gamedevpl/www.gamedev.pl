import { REVIEW_SWEEP_SOURCES } from '@gamedevpl/contract';
import { z } from 'zod';
import { RESOLUTION_FILTERS } from './assessment-resolution.js';

const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 200;

export const QueueQuerySchema = z.object({
  source: z.enum(REVIEW_SWEEP_SOURCES).optional(),
});

const QuerySchema = z
  .object({
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    // Detailed rows only: 'open' is the operator's own worklist.
    resolution: z.enum(RESOLUTION_FILTERS).default('all'),
  })
  .strict();

export type AssessmentPageQuery = z.infer<typeof QuerySchema>;

export function parseAssessmentPageQuery(query: unknown): AssessmentPageQuery | null {
  const parsed = QuerySchema.safeParse(query);
  return parsed.success ? parsed.data : null;
}

export function paginateAssessments<T>(rows: T[], query: AssessmentPageQuery) {
  const { offset, limit } = query;
  const recent = rows.slice(offset, offset + limit);
  return {
    recent,
    offset,
    limit,
    nextOffset: offset + recent.length < rows.length ? offset + recent.length : null,
  };
}
