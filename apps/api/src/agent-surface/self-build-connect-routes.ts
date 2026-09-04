import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { allowsSelfToPlatformHandoff, detectStall, isActiveBuildRound } from '../creation/job-state.js';
import { InvalidTokenError, verifyToken } from '../platform/submission-token.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import { mintConnectPayload } from './self-build-connect.js';

export interface SelfBuildConnectRoutesOptions {
  store?: Store;
  now: () => number;
  submissionTokenSecret?: string;
  appBaseUrl: string;
  checkUserAccess: (request: FastifyRequest, reply: FastifyReply) => boolean;
  ensureSubmissionSlug: (jobId: number, record: SubmissionRecord) => Promise<string | null>;
}

// Connects a creator's agent to a self-build round.
export async function registerSelfBuildConnectRoutes(
  app: FastifyInstance,
  options: SelfBuildConnectRoutesOptions,
): Promise<void> {
  const { store, now, submissionTokenSecret, appBaseUrl, checkUserAccess, ensureSubmissionSlug } = options;

  // Creator-session auth, owner only.

  // Valid only while the active round's builder is self.

  // Regenerating remints the key — it does not rotate.

  // Pending inbox lines are embedded under "also apply".

  // See self-build-connect.ts for the payload templates.
  app.get(
    '/api/submissions/:id/connect',
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!submissionTokenSecret) {
        return reply.status(503).send({ error: 'submissions are not configured' });
      }
      if (!checkUserAccess(request, reply)) return;
      if (!store) {
        return reply.status(503).send({ error: 'submissions are not configured' });
      }

      const id = z.string().parse((request.params as { id?: string }).id);
      let jobId: number;
      try {
        jobId = verifyToken(id, submissionTokenSecret);
      } catch (error) {
        if (error instanceof InvalidTokenError) {
          return reply.status(400).send({ error: 'invalid submission token' });
        }
        throw error;
      }

      const record = await store.getSubmission(jobId);
      // Same shape as share/abandon — 403 hides which is true.
      if (!record || record.ownerUid !== request.user!.uid) {
        return reply.status(403).send({ error: 'only the creator can connect a build' });
      }

      // Gates on the active round's builder, not the defaultBuilder fallback.
      const builder = record.builder ?? 'platform';
      if (builder !== 'self' || !isActiveBuildRound(record)) {
        return reply.status(409).send({
          error: 'connect_unavailable',
          reason: builder !== 'self' ? 'not_self_round' : 'inactive_round',
          builder,
        });
      }

      await store.ensureRoundGeneration(jobId);
      // Re-read after ensureRoundGeneration — a closing transition can race it.
      const fresh = await store.getSubmission(jobId);
      const freshBuilder = fresh?.builder ?? 'platform';
      if (!fresh || freshBuilder !== 'self' || !isActiveBuildRound(fresh)) {
        return reply.status(409).send({
          error: 'connect_unavailable',
          reason: freshBuilder !== 'self' ? 'not_self_round' : 'inactive_round',
          builder: freshBuilder,
        });
      }

      const slug = await ensureSubmissionSlug(jobId, fresh);
      if (!slug) {
        return reply.status(409).send({
          error: 'connect_unavailable',
          reason: 'missing_slug',
          builder: freshBuilder,
        });
      }

      const at = new Date(now()).toISOString();
      // BY-27b: hands out the creator-wide key, never per-game.
      const keyRecord = await store.ensureCreatorAgentKey(fresh.ownerUid, at);

      const pendingMessages = await store.listPendingCreatorMessages(jobId);
      const payload = mintConnectPayload({
        slug,
        ownerUid: fresh.ownerUid,
        keyGeneration: keyRecord.keyGeneration,
        title: fresh.title,
        submissionTokenSecret,
        appBaseUrl,
        pendingMessages,
        now: now(),
      });
      const stall = detectStall({
        state: fresh.state ?? 'queued',
        stateSince: fresh.stateSince ?? fresh.createdAt,
        lastAgentSignalAt: fresh.lastAgentSignalAt,
        agentState: fresh.agentState,
        agentEndedAt: fresh.agentEndedAt,
        now: now(),
        builder: freshBuilder,
      });
      // Payload carries a capability for Copy — never let intermediaries cache it.
      return reply.header('Cache-Control', 'no-store').send({
        ...payload,
        canSwitchToPlatform: allowsSelfToPlatformHandoff({
          currentBuilder: freshBuilder,
          requestedBuilder: 'platform',
          stall,
          agentEndedAt: fresh.agentEndedAt,
        }),
      });
    },
  );

  // Closed-beta retirement: old clients get an upgrade response, not a key.
  app.get(
    '/api/submissions/:id/agent-key',
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!checkUserAccess(request, reply)) return;
      return reply.status(410).send({
        error: 'per_game_keys_retired',
        reason: 'Reconnect this coding agent from Studio using OAuth or the creator-wide key.',
      });
    },
  );

  app.post(
    '/api/submissions/:id/agent-key/rotate',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!checkUserAccess(request, reply)) return;
      return reply.status(410).send({
        error: 'per_game_keys_retired',
        reason: 'Reconnect this coding agent from Studio using OAuth or the creator-wide key.',
      });
    },
  );
}
