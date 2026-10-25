import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canActOnSubmissionOrSlug } from '../platform/game-access-permissions.js';
import type { Store } from '../platform/store.js';
import { verifyToken } from '../platform/submission-token.js';
import { MCP_PRESENCE_MIN_GAP_MS } from '../agent-surface/mcp-presence.js';

const WORKING_PHASES = new Set(['preparing', 'editing', 'permission', 'interactive', 'verifying']);

const activitySchema = z
  .object({
    runId: z.string().uuid(),
    agent: z.enum(['claude', 'codex', 'agy', 'muse', 'vibe', 'gemini', 'cursor', 'copilot']),
    phase: z.enum(['preparing', 'editing', 'permission', 'interactive', 'verifying', 'ready', 'failed', 'stopped']),
    start: z.boolean().optional(),
  })
  .strict();
export async function registerLocalActivityRoutes(app: FastifyInstance, store: Store, secret: string) {
  const lastSignal = new Map<number, number>();
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
      if (!record || !(await canActOnSubmissionOrSlug(store, record, request.user.uid, 'build'))) {
        return reply.code(404).send({ error: 'not found' });
      }
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
      // A working local agent counts as agent signal, so Studio leaves no_agent_yet.
      const now = Date.now();
      if (WORKING_PHASES.has(input.phase) && now - (lastSignal.get(jobId) ?? -Infinity) >= MCP_PRESENCE_MIN_GAP_MS) {
        lastSignal.set(jobId, now);
        // preserveEnded: a heartbeat after submit must not reopen the handoff.
        await store
          .touchLastAgentSignalAt(jobId, new Date(now).toISOString(), undefined, {
            preserveEnded: true,
            roundGeneration: record.roundGeneration ?? 1,
          })
          .catch((error: unknown) => request.log.warn({ err: error, jobId }, 'local activity signal failed'));
      }
      return { ok: true };
    },
  });
}
