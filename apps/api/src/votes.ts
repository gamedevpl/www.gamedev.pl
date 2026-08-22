import { VOTE_VALUES } from '@gamedevpl/contract';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PublishedSlugGate } from './published-slugs.js';
import type { Store } from './store.js';

/**
 * Thumbs up/down per game (docs/improvement-loop-plan.md, signal source #2 —
 * "low-risk but gameable — dedupe by uid").
 *
 * Votes are keyed by uid, so casting is a revision, not an addition: the same value
 * twice is a no-op, the other value flips it, and there is a delete to un-vote. This
 * closes the cheap way to game a vote count (spamming one account); it does not and
 * cannot close the expensive one (many accounts), which the plan names as an accepted
 * limitation rather than something this feature attempts to solve.
 *
 * Gated on catalog membership like play telemetry (`published-slugs.ts`), for the same
 * reason: a vote on a slug that is not a real published game is not a signal about
 * anything. Unlike telemetry, a vote is an authenticated, foreground action with a
 * response the caller needs, so an unpublished slug answers 404 rather than accepting
 * and silently dropping — there is no hostile-iframe trust boundary to protect here.
 */

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const ParamsSchema = z.object({
  slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN, 'invalid slug'),
});
const VoteSchema = z.object({ value: z.enum(VOTE_VALUES) });

export interface VoteRoutesOptions {
  store: Store;
  /** Absent (no games repo configured) makes every slug answer 404, like telemetry. */
  publishedSlugs?: PublishedSlugGate | null;
}

export async function registerVoteRoutes(app: FastifyInstance, options: VoteRoutesOptions): Promise<void> {
  const { store, publishedSlugs } = options;

  async function isPublished(slug: string): Promise<boolean> {
    return (await publishedSlugs?.isPublished(slug)) ?? false;
  }

  app.get('/api/games/:slug/votes', async (request, reply) => {
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: params.error.issues[0]?.message ?? 'invalid slug' });
    }
    if (!(await isPublished(params.data.slug))) {
      return reply.status(404).send({ error: 'game not found' });
    }

    const counts = await store.getVoteCounts(params.data.slug);
    const mine = request.user ? await store.getVote(params.data.slug, request.user.uid) : null;
    return reply.send({ ...counts, mine });
  });

  app.post('/api/games/:slug/vote', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: params.error.issues[0]?.message ?? 'invalid slug' });
    }
    const body = VoteSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'invalid request' });
    }
    if (!(await isPublished(params.data.slug))) {
      return reply.status(404).send({ error: 'game not found' });
    }

    const counts = await store.castVote(params.data.slug, request.user.uid, body.data.value);
    return reply.send({ ...counts, mine: body.data.value });
  });

  app.delete('/api/games/:slug/vote', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: params.error.issues[0]?.message ?? 'invalid slug' });
    }
    if (!(await isPublished(params.data.slug))) {
      return reply.status(404).send({ error: 'game not found' });
    }

    const counts = await store.clearVote(params.data.slug, request.user.uid);
    return reply.send({ ...counts, mine: null });
  });
}
