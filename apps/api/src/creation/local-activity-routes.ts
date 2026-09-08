import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Store } from '../platform/store.js';
import { verifyToken } from '../platform/submission-token.js';

const activitySchema = z
  .object({
    runId: z.string().uuid(),
    agent: z.enum(['claude', 'codex', 'agy', 'muse', 'vibe', 'gemini', 'cursor', 'copilot']),
    phase: z.enum(['preparing', 'editing', 'permission', 'interactive', 'verifying', 'ready', 'failed', 'stopped']),
    start: z.boolean().optional(),
  })
  .strict();
export async function registerLocalActivityRoutes(app: FastifyInstance, store: Store, secret: string) {
  app.route<{ Params: { token: string } }>({
    method: ['GET', 'POST'],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    url: '/api/me/studio/local-activity/:token',
    handler: async (request, reply) => {
      if (!request.user) return reply.code(401).send({ error: 'authentication required' });
      if (request.user.tier === 'blocked') return reply.code(403).send({ error: 'account is blocked' });
      let jobId: number;
      try {
        jobId = verifyToken(request.params.token, secret);
      } catch {
        return reply.code(404).send({ error: 'not found' });
      }
      const record = await store.getSubmission(jobId);
      if (!record || record.ownerUid !== request.user.uid) return reply.code(404).send({ error: 'not found' });
      reply.header('cache-control', 'no-store');
      if (request.method === 'GET')
        return {
          activity: record.localActivity?.generation === (record.roundGeneration ?? 0) ? record.localActivity : null,
        };
      const parsed = activitySchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid activity' });
      const { start = false, ...input } = parsed.data;
      if (start && input.phase !== 'preparing') return reply.code(400).send({ error: 'invalid start' });
      const saved = await store.setLocalActivity(jobId, { ...input, at: new Date().toISOString() }, start);
      if (!saved) return reply.code(409).send({ error: 'local task superseded' });
      return { ok: true };
    },
  });
}
