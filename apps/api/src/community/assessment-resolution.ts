// Operator follow-up on a verdict; see docs/game-assessment-plan.md.
import { ASSESSMENT_RESOLUTION_STATUSES, type AssessmentResolutionStatus } from '@gamedevpl/contract';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isAdminSession } from '../platform/admin-session.js';
import { sanitizeCreatorText } from '../platform/submission-status.js';
import type { AssessmentResolution, GameAssessment, Store } from '../platform/store.js';

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
    // Verdict generation this resolution answers; a newer row is refused.
    expectedUpdatedAt: z.string().trim().min(1).max(40).optional(),
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

export type PreparedResolution = { ok: true; resolution: AssessmentResolution | null } | { ok: false; error: string };

// Sanitizes like a reviewer note; a real status needs a comment.
export function prepareResolution(
  input: { status: AssessmentResolutionStatus | null; comment?: string | null; link?: string | null },
  resolvedBy: string,
  nowMs: number,
): PreparedResolution {
  if (input.status === null) return { ok: true, resolution: null };
  const comment = sanitizeCreatorText(input.comment?.trim() ?? '', { singleLine: false }).slice(
    0,
    MAX_RESOLUTION_COMMENT,
  );
  if (!comment) return { ok: false, error: 'comment is required' };
  const link = input.link ? sanitizeCreatorText(input.link, { singleLine: true }).slice(0, MAX_RESOLUTION_LINK) : null;
  return { ok: true, resolution: buildResolution({ status: input.status, comment, link }, resolvedBy, nowMs) };
}

export interface AppliedResolution {
  updated: GameAssessment[];
  // Reviewers whose verdict moved between the read and the write.
  stale: string[];
  missing: number;
}

// Writes one resolution across its targets.
export async function applyResolution(
  store: Store,
  target: { slug: string; reviewerUid?: string; expectedUpdatedAt?: string },
  resolution: AssessmentResolution | null,
): Promise<AppliedResolution> {
  // Named reviewer: one row. Unnamed: the whole game, each pinned.
  const targets = target.reviewerUid
    ? [{ reviewerUid: target.reviewerUid, expectedUpdatedAt: target.expectedUpdatedAt }]
    : (await store.listGameAssessmentsBySlug(target.slug)).map((row) => ({
        reviewerUid: row.reviewerUid,
        expectedUpdatedAt: row.updatedAt,
      }));

  const updated: GameAssessment[] = [];
  const stale: string[] = [];
  let missing = 0;
  for (const one of targets) {
    const result = await store.setGameAssessmentResolution(
      target.slug,
      one.reviewerUid,
      resolution,
      one.expectedUpdatedAt,
    );
    if (result.status === 'ok') updated.push(result.assessment);
    else if (result.status === 'stale') stale.push(one.reviewerUid);
    else missing += 1;
  }
  return { updated, stale, missing };
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

    const prepared = prepareResolution(body.data, request.user!.uid, now());
    if (!prepared.ok) {
      return reply.status(400).send({ error: prepared.error });
    }

    const { updated, stale, missing } = await applyResolution(store, body.data, prepared.resolution);
    if (updated.length === 0 && stale.length > 0) {
      // The verdict moved under the operator; re-read before resolving again.
      return reply.status(409).send({ error: 'stale_verdict', stale });
    }
    if (updated.length === 0 && (missing > 0 || stale.length === 0)) {
      return reply.status(404).send({ error: 'not found' });
    }

    return { assessments: updated, resolved: prepared.resolution !== null, stale };
  });
}
