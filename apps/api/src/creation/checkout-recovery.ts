import { isAbandonedRecovery } from '../store/slices/recovery-admission.js';
import { isCanonicalSlug } from '../platform/slug-policy.js';
import { codeSurfaceEnabled } from './code-surface.js';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { mintToken } from '../platform/submission-token.js';
import { ownsSubmissionOrSlug } from '../platform/slug-ownership.js';
import type { Store } from '../platform/store.js';
import type { CreateGameRouteDeps } from './create-game.js';

const Slug = z.string().max(61).refine(isCanonicalSlug);
const Body = z.object({
  slug: Slug,
  key: z.string().uuid(),
  title: z.string().min(3).max(120),
  concept: z.string().min(30).max(4000),
});

// Zod knows which field failed; names and bounds only, never the value.
function describeBody(error: z.ZodError): string {
  const parts = error.issues.map((issue) => {
    const field = issue.path.join('.') || 'request';
    if (issue.code === 'too_small') return `${field} is shorter than ${String(issue.minimum)}`;
    if (issue.code === 'too_big') return `${field} is longer than ${String(issue.maximum)}`;
    return `${field} is not valid`;
  });
  return [...new Set(parts)].join('; ');
}

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
    const archived = publication?.state === 'archived' && publication.takedownReason === 'deleted by creator';
    if ((publication && !archived) || (await deps.isSlugPublished(slug))) return { kind: 'occupied' as const };
    if (!holder) return { kind: publication ? ('occupied' as const) : ('missing' as const) };
    if (
      !(await ownsSubmissionOrSlug(deps.store!, holder, uid)) ||
      (holder.abandonedAt && holder.state !== 'canceled' && !archived && !isAbandonedRecovery(holder)) ||
      holder.moderationBlockedAt
    )
      return { kind: 'occupied' as const };
    return {
      kind:
        archived && ['published', 'failed', 'canceled', 'abandoned'].includes(holder.state ?? '')
          ? ('archived' as const)
          : holder.state === 'canceled' || isAbandonedRecovery(holder)
            ? ('canceled' as const)
            : ('active' as const),
      holder,
    };
  };
  app.get<{ Params: { slug: string } }>(
    '/api/me/studio/games/:slug/recovery',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!deps.checkUserAccess(request, reply)) return;
      if (!codeSurfaceEnabled())
        return reply.code(503).send({ error: 'unavailable', message: 'Code recovery is temporarily disabled.' });
      if (!deps.store || !deps.submissionTokenSecret) return reply.code(503).send({ error: 'unavailable' });
      if (!Slug.safeParse(request.params.slug).success) return reply.code(400).send({ error: 'invalid slug' });
      const status = await inspect(request.params.slug, request.user!.uid);
      return { kind: status.kind };
    },
  );
  app.post(
    '/api/me/studio/recover',
    { bodyLimit: 20_000, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!deps.checkUserAccess(request, reply)) return;
      if (!codeSurfaceEnabled())
        return reply.code(503).send({ error: 'unavailable', message: 'Code recovery is temporarily disabled.' });
      if (!deps.store || !deps.submissionTokenSecret) return reply.code(503).send({ error: 'unavailable' });
      const parsed = Body.safeParse(request.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: 'invalid recovery request', message: `Recovery refused: ${describeBody(parsed.error)}.` });
      const { slug, key, title, concept } = parsed.data;
      const nonce = randomUUID();
      if (!(await deps.store.beginCheckoutRecovery(slug, nonce, Date.now())))
        return reply.code(409).send({
          error: 'recovery_in_progress',
          message: 'Recovery is already running. Retry shortly with the same recovery key.',
        });
      try {
        const status = await inspect(slug, request.user!.uid);
        if ('holder' in status && status.holder?.recoveryKey === key) {
          if (['canceled', 'abandoned', 'failed', 'published'].includes(status.holder.state ?? ''))
            return reply.code(409).send({
              error: 'recovery_changed',
              message:
                'The recovery round has ended. Run recovery again to start a new draft; your local files are safe.',
            });
          return { slug, token: mintToken(status.holder.jobId, deps.submissionTokenSecret) };
        }
        if (status.kind === 'active' || status.kind === 'occupied')
          return reply
            .code(409)
            .send({ error: 'slug_unavailable', message: 'Choose another slug; existing games are never overwritten.' });
        const created = await deps.createGame({
          uid: request.user!.uid,
          ip: request.clientIp,
          payload: { title, concept, builder: 'self' },
          recovery: {
            slug,
            sourceJobId: status.kind === 'canceled' || status.kind === 'archived' ? status.holder.jobId : null,
            key,
            admissionNonce: nonce,
          },
          log: request.log,
        });
        if (!created.ok) return reply.code(created.status).send({ error: created.error, category: created.category });
        return { slug: created.slug, token: mintToken(created.jobId, deps.submissionTokenSecret) };
      } finally {
        await deps.store.finishCheckoutRecovery(slug, nonce).catch(() => {});
      }
    },
  );
}
