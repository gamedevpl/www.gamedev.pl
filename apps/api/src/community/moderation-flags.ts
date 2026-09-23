import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { MODERATION_FLAG_ACTIONS, MODERATION_FLAG_REASONS, type ModerationFlagAction } from '@gamedevpl/contract';
import { isAdminSession } from '../platform/admin-session.js';
import { sanitizeCreatorText } from '../platform/submission-status.js';
import { isPublished } from '../platform/publication-state.js';
import type { Store } from '../platform/store.js';
import type { ModerationFlag } from '../store/records/moderation-flag.js';
import { isReviewerSession } from './review.js';

export interface ModerationFlagRoutesOptions {
  store?: Store;
  // A queue nobody is told about waits to be found.
  notifyFlagRaised?: (event: { flagId: string; slug: string; reason: string }) => Promise<void>;
  reviewerUids?: Set<string>;
  adminUids?: Set<string>;
  now: () => number;
  invalidatePublishedGameCaches: (slug: string) => void;
  // Repo-lane games publish from the snapshot, not the store.
  isSlugPublished?: (slug: string) => Promise<boolean>;
}

const MAX_NOTE = 2000;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const RaiseSchema = z.object({
  slug: z.string().trim().regex(SLUG_PATTERN),
  reason: z.enum(MODERATION_FLAG_REASONS),
  note: z.string().trim().min(1).max(MAX_NOTE),
  source: z.enum(['catalog', 'creator']).default('creator'),
  gameVersion: z.string().trim().max(64).nullish(),
});

const ReportParamsSchema = z.object({
  slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN, 'invalid slug'),
});

// A short operator pointer, not the DSA-precision notice (see ReportGameButton).
const MAX_PLAYER_NOTE = 500;

const ReportBodySchema = z.object({
  reason: z.enum(MODERATION_FLAG_REASONS),
  note: z.string().trim().min(1).max(MAX_PLAYER_NOTE),
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

// Reopened flags page again; still-open ones must not page twice.
function alertFlagId(reopened: boolean, flag: ModerationFlag): string {
  return reopened ? `${flag.id}@${flag.createdAt}` : flag.id;
}

export async function registerModerationFlagRoutes(
  app: FastifyInstance,
  options: ModerationFlagRoutesOptions,
): Promise<void> {
  const { store, now, invalidatePublishedGameCaches, isSlugPublished, notifyFlagRaised } = options;
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

      const { flag, reopened } = await store.raiseModerationFlag({
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
      // Detached: mail and push must not hold the reviewer's request open.
      void notifyFlagRaised?.({ flagId: alertFlagId(reopened, flag), slug: flag.slug, reason: flag.reason }).catch((error: unknown) => {
        request.log.error({ err: error, slug: flag.slug }, 'could not notify operators of a moderation flag');
      });
      return reply.send({ flag });
    },
  );

  // Player-facing report, into the same queue as a reviewer's flag.
  app.post(
    '/api/games/:slug/report',
    { config: { rateLimit: { max: 8, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!store) return reply.status(503).send({ error: 'store_unavailable' });
      if (!request.user) return reply.status(401).send({ error: 'authentication required' });
      if (request.user.tier === 'blocked') return reply.status(403).send({ error: 'account is blocked' });

      const params = ReportParamsSchema.safeParse(request.params ?? {});
      if (!params.success) {
        return reply.status(400).send({ error: params.error.issues[0]?.message ?? 'invalid slug' });
      }
      const body = ReportBodySchema.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'invalid request' });
      }

      const published = (await isSlugPublished?.(params.data.slug)) ?? false;
      if (!published) return reply.status(404).send({ error: 'game not found' });

      const sanitized = sanitizeCreatorText(body.data.note, { singleLine: false }).slice(0, MAX_PLAYER_NOTE);
      if (!sanitized) return reply.status(400).send({ error: 'note is required' });

      // Not content-moderated: quoting the abuse is the evidence operators need.
      const { flag, reopened } = await store.raiseModerationFlag({
        slug: params.data.slug,
        source: 'player',
        reason: body.data.reason,
        note: sanitized,
        raisedByUid: request.user.uid,
        gameVersion: null,
        createdAt: new Date(now()).toISOString(),
      });
      request.log.warn({ slug: flag.slug, reason: flag.reason }, 'player reported a game');
      // Detached, same as the reviewer path above.
      void notifyFlagRaised?.({ flagId: alertFlagId(reopened, flag), slug: flag.slug, reason: flag.reason }).catch((error: unknown) => {
        request.log.error({ err: error, slug: flag.slug }, 'could not notify operators of a player game report');
      });
      return reply.send({ ok: true });
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
