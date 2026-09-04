import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import { seedPayload } from './seed-status.js';
import type { GamesStore } from '../delivery/games-store.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import type { AgentTokenAccess } from '../platform/agent-token.js';

// Empty body is ordinary: a steer is optional.
const RegenerateSeedRequestSchema = z.object({
  steer: z.string().trim().min(1).max(600, 'steer is too long').optional(),
});

const REGENERATE_SEED_REFUSALS: Record<string, string> = {
  not_configured: 'this deployment does not generate seeds',
  not_found: 'no round to regenerate a seed for',
  seed_not_readable:
    'this round was handed its seed as a workspace rather than reading it, so replacing the stored copy would not reach the agent',
  already_delivered: 'this round already delivered — build on what you delivered rather than restarting from a draft',
  cap_reached: 'this job has used its seed regenerations; continue from the draft you have or scaffold from the kit',
  seeding_off: 'seeding is off right now; continue from the kit, or try again once it is back on',
};

export interface AgentChannelSeedRoutesDeps {
  resolveBuild: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<{ jobId: number; record: SubmissionRecord; access: AgentTokenAccess } | null>;
  store: Store | undefined;
  gamesStore: GamesStore | undefined;
  onRegenerateSeed:
    | ((input: { jobId: number; steer?: string; log: FastifyRequest['log'] }) => Promise<
        | { ok: true; status: 'pending'; regenerationsRemaining: number }
        | {
            ok: false;
            reason:
              | 'not_configured'
              | 'not_found'
              | 'seed_not_readable'
              | 'already_delivered'
              | 'cap_reached'
              | 'seeding_off';
          }
      >)
    | undefined;
}

export function registerAgentChannelSeedRoutes(app: FastifyInstance, deps: AgentChannelSeedRoutesDeps): void {
  const { resolveBuild, store, gamesStore, onRegenerateSeed } = deps;

  app.get(
    AGENT_CHANNEL_ROUTES.SEED,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { record } = resolved;
      const seed = seedPayload(record);

      if (record.seed) {
        return reply.send({
          available: true,
          status: seed.seedStatus,
          notice: seed.seedNotice,
          files: record.seed.files,
          references: record.seed.references,
          notes: record.seed.notes ?? null,
        });
      }
      if (seed.seedStatus === 'pending') {
        return reply.send({
          available: false,
          status: 'pending',
          notice: seed.seedNotice,
          files: [],
          references: [],
          notes: null,
        });
      }
      return reply.status(404).send({
        available: false,
        status: 'unavailable',
        notice: seed.seedNotice,
        files: [],
        references: [],
        notes: null,
      });
    },
  );

  // Replaces an unusable draft; refused once staging has a base.
  app.post(
    AGENT_CHANNEL_ROUTES.SEED_REGENERATE,
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { jobId, record } = resolved;

      if (!onRegenerateSeed) {
        return reply.status(503).send({ error: 'seeding_unavailable', message: 'this deployment does not seed' });
      }

      const parsed = RegenerateSeedRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: 'invalid_request', message: parsed.error.issues[0]?.message });
      }

      if (gamesStore && record.slug) {
        const roundGeneration = store
          ? ((await store.ensureRoundGeneration(jobId)) ?? record.roundGeneration ?? 1)
          : (record.roundGeneration ?? 1);
        const staged = await gamesStore.listStagedSources({
          slug: record.slug,
          jobId,
          roundGeneration,
        });
        if (staged.files.length > 0) {
          return reply.status(409).send({
            error: 'already_staged',
            message:
              'you have staged files this round — a new seed would change the base they overlay. ' +
              'Continue with what you have staged, or clear the staging buffer first.',
          });
        }
      }

      const result = await onRegenerateSeed({
        jobId,
        ...(parsed.data.steer ? { steer: parsed.data.steer } : {}),
        log: request.log,
      });
      if (!result.ok) {
        const status = result.reason === 'not_configured' ? 503 : result.reason === 'not_found' ? 404 : 409;
        return reply.status(status).send({ error: result.reason, message: REGENERATE_SEED_REFUSALS[result.reason] });
      }
      return reply.send({
        status: result.status,
        regenerationsRemaining: result.regenerationsRemaining,
        notice: 'A new draft is generating. Call get_seed again in a minute or two; do not wait in a loop.',
      });
    },
  );
}
