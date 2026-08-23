import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Store } from '../platform/store.js';

/**
 * Following a game — "Obserwuj".
 *
 * GitHub's Star is a bookmark; this is a subscription, and the difference is the whole
 * reason it exists: the one message worth interrupting someone for is "a game you
 * played has a new version" (ops `docs/game-page-plan.md`). Nothing else about a game
 * somebody else owns is worth a notification, so nothing else sends one.
 *
 * The count is public — it is the honest version of a star count, and the page shows it
 * beside the play numbers rather than as a trophy. Who follows is not: a follower list
 * is a list of people, and no visitor needs one.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SlugParamsSchema = z.object({ slug: z.string().trim().min(1).max(64) });

export interface GameFollowResponse {
  slug: string;
  followers: number;
  /** Null for a signed-out visitor: they see the count, and no state of their own. */
  following: boolean | null;
}

export interface GameFollowRoutesOptions {
  store: Store;
  now?: () => number;
}

export async function registerGameFollowRoutes(app: FastifyInstance, options: GameFollowRoutesOptions): Promise<void> {
  const { store } = options;
  const now = options.now ?? Date.now;

  function parseSlug(request: { params: unknown }): string | null {
    const params = SlugParamsSchema.safeParse(request.params);
    if (!params.success || !SLUG_PATTERN.test(params.data.slug)) return null;
    return params.data.slug;
  }

  /** A game has to exist and be live before anyone can follow it. */
  async function isLive(slug: string): Promise<boolean> {
    const publication = await store.getPublication(slug);
    if (publication) return publication.state === 'published';
    // Repo-migrated games have no publication record; a published job is the fallback
    // proof, same as the board's existence gate.
    return Boolean(await store.getPublishedSubmissionBySlug(slug));
  }

  app.get('/api/games/:slug/follow', async (request, reply) => {
    const slug = parseSlug(request);
    if (!slug) return reply.status(400).send({ error: 'invalid slug' });
    if (!(await isLive(slug))) return reply.status(404).send({ error: 'not_found' });

    const uid = request.user?.uid ?? null;
    const [followers, following] = await Promise.all([
      store.countGameFollowers(slug),
      uid ? store.isFollowingGame(slug, uid) : Promise.resolve(null),
    ]);
    return reply.send({ slug, followers, following } satisfies GameFollowResponse);
  });

  app.put(
    '/api/games/:slug/follow',
    // Generous against real use — nobody follows a game thirty times an hour — and
    // bounded against a loop toggling the tally.
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const slug = parseSlug(request);
      if (!slug) return reply.status(400).send({ error: 'invalid slug' });
      const uid = request.user?.uid;
      if (!uid) return reply.status(401).send({ error: 'authentication required' });
      if (!(await isLive(slug))) return reply.status(404).send({ error: 'not_found' });

      const body = z.object({ following: z.boolean() }).safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: 'invalid request' });

      const followers = body.data.following
        ? await store.setGameFollow(slug, uid, new Date(now()).toISOString())
        : await store.clearGameFollow(slug, uid);

      return reply.send({ slug, followers, following: body.data.following } satisfies GameFollowResponse);
    },
  );
}
