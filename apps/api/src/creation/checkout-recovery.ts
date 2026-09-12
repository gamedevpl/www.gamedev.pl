import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { mintToken } from '../platform/submission-token.js';
import type { Store } from '../platform/store.js';
import type { CreateGameRouteDeps } from './create-game.js';

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}$/);
const Body = z.object({
  slug: Slug,
  key: z.string().uuid(),
  title: z.string().min(3).max(120),
  concept: z.string().min(30).max(4000),
});

export function registerCheckoutRecovery(
  app: FastifyInstance,
  deps: CreateGameRouteDeps & {
    store?: Store;
    isSlugPublished: (slug: string) => Promise<boolean>;
  },
): void {
  const inspect = async (slug: string, uid: string) => {
    const holder = await deps.store!.getSubmissionBySlug(slug);
    const publication = await deps.store!.getPublication(slug);
    if (publication || (await deps.isSlugPublished(slug))) return { kind: 'occupied' as const };
    if (!holder) return { kind: 'missing' as const };
    if (holder.ownerUid !== uid || (holder.abandonedAt && holder.state !== 'canceled') || holder.moderationBlockedAt)
      return { kind: 'occupied' as const };
    return { kind: holder.state === 'canceled' ? ('canceled' as const) : ('active' as const), holder };
  };
  app.get<{ Params: { slug: string } }>('/api/me/studio/games/:slug/recovery', async (request, reply) => {
    if (!deps.checkUserAccess(request, reply)) return;
    if (!deps.store || !deps.submissionTokenSecret) return reply.code(503).send({ error: 'unavailable' });
    if (!Slug.safeParse(request.params.slug).success) return reply.code(400).send({ error: 'invalid slug' });
    const status = await inspect(request.params.slug, request.user!.uid);
    return { kind: status.kind };
  });
  app.post('/api/me/studio/recover', { bodyLimit: 20_000 }, async (request, reply) => {
    if (!deps.checkUserAccess(request, reply)) return;
    if (!deps.store || !deps.submissionTokenSecret) return reply.code(503).send({ error: 'unavailable' });
    const parsed = Body.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid recovery request' });
    const { slug, key, title, concept } = parsed.data;
    const status = await inspect(slug, request.user!.uid);
    if (status.kind === 'active' && status.holder.recoveryKey === key)
      return { slug, token: mintToken(status.holder.jobId, deps.submissionTokenSecret) };
    if (status.kind === 'active' || status.kind === 'occupied')
      return reply
        .code(409)
        .send({ error: 'slug_unavailable', message: 'Choose another slug; existing games are never overwritten.' });
    const created = await deps.createGame({
      uid: request.user!.uid,
      ip: request.clientIp,
      payload: { title, concept, builder: 'self' },
      recovery: { slug, sourceJobId: status.kind === 'canceled' ? status.holder.jobId : null, key },
      log: request.log,
    });
    if (!created.ok) return reply.code(created.status).send({ error: created.error, category: created.category });
    return { slug: created.slug, token: mintToken(created.jobId, deps.submissionTokenSecret) };
  });
}
