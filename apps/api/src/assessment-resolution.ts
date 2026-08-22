// Operator follow-up on a verdict; see docs/game-assessment-plan.md.
import { ASSESSMENT_RESOLUTION_STATUSES, type AssessmentResolutionStatus } from '@gamedevpl/contract';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isAdminSession } from './admin-session.js';
import { sanitizeCreatorText } from './submission-status.js';
import type { AssessmentResolution, GameAssessment, Store } from './store.js';

export const MAX_RESOLUTION_COMMENT = 2000;
const MAX_RESOLUTION_LINK = 300;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const ResolutionStatusSchema = z.enum(ASSESSMENT_RESOLUTION_STATUSES);

export const ResolveAssessmentSchema = z
  .object({
    slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN, 'invalid slug'),
    // Omitted resolves every reviewer's row for the slug.
    reviewerUid: z.string().trim().min(1).max(120).optional(),
    // Null withdraws a resolution recorded by mistake.
    status: ResolutionStatusSchema.nullable(),
    comment: z.string().trim().max(MAX_RESOLUTION_COMMENT).optional(),
    link: z.string().trim().max(MAX_RESOLUTION_LINK).nullable().optional(),
  })
  .strict();

export type ResolveAssessmentInput = z.infer<typeof ResolveAssessmentSchema>;

// How the operator console filters the detailed rows it lists.
export const RESOLUTION_FILTERS = ['all', 'open', 'resolved'] as const;
export type ResolutionFilter = (typeof RESOLUTION_FILTERS)[number];

export function matchesResolutionFilter(row: GameAssessment, filter: ResolutionFilter): boolean {
  if (filter === 'all') return true;
  return filter === 'resolved' ? row.resolution !== null : row.resolution === null;
}

// Caller sanitizes comment first, same as a reviewer note.
export function buildResolution(
  input: { status: AssessmentResolutionStatus; comment: string; link?: string | null },
  resolvedBy: string,
  nowMs: number,
): AssessmentResolution {
  return {
    status: input.status,
    comment: input.comment,
    link: input.link?.trim() ? input.link.trim() : null,
    resolvedAt: new Date(nowMs).toISOString(),
    resolvedBy,
  };
}

export interface AssessmentResolutionTotals {
  resolved: number;
  open: number;
}

// Per-game rollup: how much feedback was acted on.
export function summarizeResolutions(rows: GameAssessment[]): AssessmentResolutionTotals {
  let resolved = 0;
  for (const row of rows) {
    if (row.resolution) resolved += 1;
  }
  return { resolved, open: rows.length - resolved };
}

export interface AssessmentResolutionRouteOptions {
  store: Store;
  adminUids: Set<string>;
  now: () => number;
}

export async function registerAssessmentResolutionRoute(
  app: FastifyInstance,
  options: AssessmentResolutionRouteOptions,
): Promise<void> {
  const { store, adminUids, now } = options;

  // Operator follow-up: what was done about a verdict, and how.
  app.post('/api/admin/assessments/resolve', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }
    const body = ResolveAssessmentSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'invalid request' });
    }

    let resolution: AssessmentResolution | null = null;
    if (body.data.status !== null) {
      const comment = sanitizeCreatorText(body.data.comment?.trim() ?? '', { singleLine: false }).slice(
        0,
        MAX_RESOLUTION_COMMENT,
      );
      if (!comment) {
        return reply.status(400).send({ error: 'comment is required' });
      }
      const link = body.data.link ? sanitizeCreatorText(body.data.link, { singleLine: true }).slice(0, 300) : null;
      resolution = buildResolution({ status: body.data.status, comment, link }, request.user!.uid, now());
    }

    // Named reviewer: one row. Unnamed: the whole game.
    const targets = body.data.reviewerUid
      ? [body.data.reviewerUid]
      : (await store.listGameAssessmentsBySlug(body.data.slug)).map((row) => row.reviewerUid);
    if (targets.length === 0) {
      return reply.status(404).send({ error: 'not found' });
    }

    const updated: GameAssessment[] = [];
    for (const reviewerUid of targets) {
      const row = await store.setGameAssessmentResolution(body.data.slug, reviewerUid, resolution);
      if (row) updated.push(row);
    }
    if (updated.length === 0) {
      return reply.status(404).send({ error: 'not found' });
    }

    return { assessments: updated, resolved: resolution !== null };
  });
}
