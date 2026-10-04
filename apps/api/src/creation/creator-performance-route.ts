import type { FastifyInstance } from 'fastify';
import type { ReadGamePerformance } from '@gamedevpl/contract';
import { GamePerformanceQuerySchema } from '../platform/game-performance-query.js';

export function registerCreatorPerformanceRoute(app: FastifyInstance, read: ReadGamePerformance): void {
  app.get(
    '/api/me/studio/performance',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!request.user) return reply.status(401).send({ error: 'authentication required' });
      const query = request.query as Record<string, unknown>;
      const parsed = GamePerformanceQuerySchema.safeParse({
        ...query,
        ...(query.days === undefined ? {} : { days: Number(query.days) }),
      });
      if (!parsed.success) return reply.status(400).send({ error: 'invalid performance query' });
      const result = await read(request.user.uid, parsed.data);
      if (!result.ok) {
        if (result.retryAfterSeconds) reply.header('retry-after', String(result.retryAfterSeconds));
        return reply.status(result.code === 'rate_limited' ? 429 : 404).send({ error: result.code });
      }
      return reply.send(result.report);
    },
  );
}
