import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { resolveJobState } from './job-state.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import { codeSurfaceEnabled, isLiveAgentRound } from './code-surface.js';

type Request = FastifyRequest<{ Params: { slug: string } }>;
export function registerCreatorTakeover(
  app: FastifyInstance,
  options: {
    store: Store;
    resolveForSlug: (
      request: Request,
      reply: FastifyReply,
    ) => Promise<{ record: SubmissionRecord; slug: string } | null>;
    invalidate?: (jobId: number) => void;
    now?: () => number;
  },
): void {
  const route = '/api/me/studio/games/:slug/sources/session';
  const config = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };
  app.get<{ Params: { slug: string } }>(route, config, async (request, reply) => {
    if (!codeSurfaceEnabled()) return reply.code(404).send({ error: 'not found' });
    const resolved = await options.resolveForSlug(request, reply);
    if (!resolved) return reply;
    const { record } = resolved;
    const locked = isLiveAgentRound(record);
    return {
      locked,
      jobId: record.jobId,
      generation: record.roundGeneration ?? 1,
      canTakeOver:
        locked &&
        (record.builder ?? record.defaultBuilder) === 'self' &&
        !record.builderHandoff &&
        resolveJobState(record) !== 'submitted' &&
        resolveJobState(record) !== 'publishing',
    };
  });
  app.post<{ Params: { slug: string } }>(route, config, async (request, reply) => {
    if (!codeSurfaceEnabled()) return reply.code(404).send({ error: 'not found' });
    const resolved = await options.resolveForSlug(request, reply);
    if (!resolved) return reply;
    const parsed = z
      .object({
        jobId: z.number().int().positive(),
        generation: z.number().int().positive(),
        stopAgent: z.literal(true),
      })
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'explicit agent takeover confirmation required' });
    const { record } = resolved;
    if (
      parsed.data.jobId !== record.jobId ||
      !(await options.store.takeOverAgentRound(
        record.jobId,
        request.user!.uid,
        parsed.data.generation,
        new Date((options.now ?? Date.now)()).toISOString(),
      ))
    )
      return reply
        .code(409)
        .send({ error: 'round_changed', message: 'The round changed; check its status before taking over.' });
    request.log.info({ jobId: record.jobId }, 'creator disconnected agent session for local delivery');
    options.invalidate?.(record.jobId);
    return { accepted: true };
  });
}
