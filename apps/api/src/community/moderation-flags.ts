import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { MODERATION_FLAG_ACTIONS, MODERATION_FLAG_REASONS, type ModerationFlagAction } from '@gamedevpl/contract';
import { isAdminSession } from '../platform/admin-session.js';
import { sanitizeCreatorText } from '../platform/submission-status.js';
import { isPublished } from '../platform/publication-state.js';
import type { Store } from '../platform/store.js';
import { isReviewerSession } from './review.js';

export interface ModerationFlagRoutesOptions {
  store?: Store;
  reviewerUids?: Set<string>;
  adminUids?: Set<string>;
  now: () => number;
  invalidatePublishedGameCaches: (slug: string) => void;
}

const MAX_NOTE = 2000;

const RaiseSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  reason: z.enum(MODERATION_FLAG_REASONS),
  note: z.string().trim().min(1).max(MAX_NOTE),
  source: z.enum(['catalog', 'creator']).default('creator'),
  gameVersion: z.string().trim().max(64).nullish(),
});

const ResolveSchema = z.object({
  action: z.enum(MODERATION_FLAG_ACTIONS),
  note: z.string().trim().max(MAX_NOTE).optional(),
});

export interface TakedownOutcome {
  unpublished: boolean;
  unshared: boolean;
}

// Abuse lives in shared drafts too, not only publications.
export async function takeDownSlug(input: {
  store: Store;
  slug: string;
  reason: string;
  at: string;
  invalidatePublishedGameCaches: (slug: string) => void;
}): Promise<TakedownOutcome> {
  const publication = await input.store.getPublication(input.slug);
  let unpublished = false;
  if (isPublished(publication)) {
    unpublished = await input.store.archivePublication(input.slug, input.reason, input.at);
    input.invalidatePublishedGameCaches(input.slug);
  }
  const record = await input.store.getSubmissionBySlug(input.slug);
  let unshared = false;
  if (record?.draftSharedAt) {
    await input.store.setDraftShared(record.jobId, null);
    unshared = true;
  }
  return { unpublished, unshared };
}

export async function registerModerationFlagRoutes(
  app: FastifyInstance,
  options: ModerationFlagRoutesOptions,
): Promise<void> {
  const { store, now, invalidatePublishedGameCaches } = options;
  const reviewerUids = options.reviewerUids ?? new Set<string>();
  const adminUids = options.adminUids ?? new Set<string>();

  function refuseUnlessReviewer(request: FastifyRequest): { error: string } | null {
    return isReviewerSession(request, reviewerUids, adminUids) ? null : { error: 'not found' };
  }

  // One credible report is actionable; it never waits for consensus.
  app.post(
    '/api/review/flags',
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const refused = refuseUnlessReviewer(request);
      if (refused) return reply.status(404).send(refused);
      if (!store) return reply.status(503).send({ error: 'store_unavailable' });

      const parsed = RaiseSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }
      const note = sanitizeCreatorText(parsed.data.note, { singleLine: false }).slice(0, MAX_NOTE);
      if (!note) return reply.status(400).send({ error: 'note is required' });

      const flag = await store.raiseModerationFlag({
        slug: parsed.data.slug,
        source: parsed.data.source,
        reason: parsed.data.reason,
        note,
        raisedByUid: request.user!.uid,
        gameVersion: parsed.data.gameVersion ?? null,
        createdAt: new Date(now()).toISOString(),
      });
      request.log.warn(
        { slug: flag.slug, reason: flag.reason, raisedByUid: flag.raisedByUid },
        'moderation flag raised on a game',
      );
      return reply.send({ flag });
    },
  );

  app.get('/api/admin/moderation-flags', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) return reply.status(404).send({ error: 'not_found' });
    if (!store) return reply.status(503).send({ error: 'store_unavailable' });
    const status = (request.query as { status?: string } | undefined)?.status;
    const flags = await store.listModerationFlags(
      status === 'resolved' || status === 'open' ? { status } : { status: 'open' },
    );
    return reply.send({ flags });
  });

  // Resolving with taken_down is what actually pulls the game.
  app.post<{ Params: { id: string } }>('/api/admin/moderation-flags/:id/resolve', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) return reply.status(404).send({ error: 'not_found' });
    if (!store) return reply.status(503).send({ error: 'store_unavailable' });

    const parsed = ResolveSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }
    const flag = await store.getModerationFlag(request.params.id);
    if (!flag) return reply.status(404).send({ error: 'not_found' });

    const at = new Date(now()).toISOString();
    const action: ModerationFlagAction = parsed.data.action;
    let outcome: TakedownOutcome = { unpublished: false, unshared: false };
    if (action === 'taken_down') {
      outcome = await takeDownSlug({
        store,
        slug: flag.slug,
        reason: `moderation: ${flag.reason}`,
        at,
        invalidatePublishedGameCaches,
      });
    }

    const resolved = await store.resolveModerationFlag(flag.id, {
      action,
      resolvedByUid: request.user!.uid,
      resolutionNote: parsed.data.note ? sanitizeCreatorText(parsed.data.note, { singleLine: false }) : null,
      resolvedAt: at,
    });
    request.log.warn({ slug: flag.slug, action, ...outcome }, 'moderation flag resolved');
    return reply.send({ flag: resolved, ...outcome });
  });
}
