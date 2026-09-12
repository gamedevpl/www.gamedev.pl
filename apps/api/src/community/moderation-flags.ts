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
  // Repo-lane games publish from the snapshot, not the store.
  isSlugPublished?: (slug: string) => Promise<boolean>;
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
  blocked: boolean;
  unshared: boolean;
  unpublished: boolean;
  // Still reachable; an operator must act elsewhere.
  stillPublic: boolean;
}

// Abuse lives in shared drafts too, not only publications.
export async function takeDownSlug(input: {
  store: Store;
  slug: string;
  reason: string;
  at: string;
  invalidatePublishedGameCaches: (slug: string) => void;
  isSlugPublished?: (slug: string) => Promise<boolean>;
}): Promise<TakedownOutcome> {
  // Draft link first: the creator can re-open that one.
  const record = await input.store.getSubmissionBySlug(input.slug);
  let blocked = false;
  let unshared = false;
  if (record) {
    await input.store.setModerationBlocked(record.jobId, input.at);
    blocked = true;
    if (record.draftSharedAt) {
      await input.store.setDraftShared(record.jobId, null);
      unshared = true;
    }
  }

  const publication = await input.store.getPublication(input.slug);
  let unpublished = false;
  if (isPublished(publication)) {
    unpublished = await input.store.archivePublication(input.slug, input.reason, input.at);
  }
  input.invalidatePublishedGameCaches(input.slug);

  // Repo-lane games have no publication; they serve from the snapshot.
  const stillPublic = !unpublished && (await (input.isSlugPublished?.(input.slug) ?? Promise.resolve(false)));
  return { blocked, unshared, unpublished, stillPublic };
}

export async function registerModerationFlagRoutes(
  app: FastifyInstance,
  options: ModerationFlagRoutesOptions,
): Promise<void> {
  const { store, now, invalidatePublishedGameCaches, isSlugPublished } = options;
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

    const at = new Date(now()).toISOString();
    const action: ModerationFlagAction = parsed.data.action;
    // Claim first: two operators must not both take down.
    const claim = await store.resolveModerationFlag(request.params.id, {
      action,
      resolvedByUid: request.user!.uid,
      resolutionNote: parsed.data.note ? sanitizeCreatorText(parsed.data.note, { singleLine: false }) : null,
      resolvedAt: at,
    });
    if (!claim.ok) {
      const status = claim.reason === 'not_found' ? 404 : 409;
      return reply.status(status).send({ error: claim.reason });
    }

    let outcome: TakedownOutcome = { blocked: false, unshared: false, unpublished: false, stillPublic: false };
    if (action === 'taken_down') {
      try {
        outcome = await takeDownSlug({
          store,
          slug: claim.flag.slug,
          reason: `moderation: ${claim.flag.reason}`,
          at,
          invalidatePublishedGameCaches,
          ...(isSlugPublished ? { isSlugPublished } : {}),
        });
      } catch (error) {
        // The claim outlived its takedown; hand it back.
        await store.reopenModerationFlag(claim.flag.id).catch(() => {});
        request.log.error({ err: error, slug: claim.flag.slug }, 'moderation takedown failed; flag reopened');
        return reply.status(500).send({ error: 'takedown_failed' });
      }
    }

    request.log.warn({ slug: claim.flag.slug, action, ...outcome }, 'moderation flag resolved');
    return reply.send({ flag: claim.flag, ...outcome });
  });
}
