import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

export type CreatorReviewPreview = { slug: string; title: string; html: string };
export type CreatorReviewPreviewLoader = (slug: string, version: string) => Promise<CreatorReviewPreview | null>;

export function registerReviewPlay(
  app: FastifyInstance,
  refuseUnlessReviewer: (request: FastifyRequest, reply: FastifyReply) => unknown,
  load?: CreatorReviewPreviewLoader,
): void {
  app.get(
    '/api/review/games/:slug',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (refuseUnlessReviewer(request, reply)) return reply;
      const params = z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/) }).safeParse(request.params);
      const query = z.object({ version: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/) }).safeParse(request.query);
      if (!params.success || !query.success) return reply.status(400).send({ error: 'invalid review candidate' });
      if (!load) return reply.status(503).send({ error: 'review previews are not configured' });
      const game = await load(params.data.slug, query.data.version);
      if (!game) return reply.status(409).send({ error: 'review candidate unavailable — reload the queue' });
      return reply.header('Cache-Control', 'private, no-store').send(game);
    },
  );
}
