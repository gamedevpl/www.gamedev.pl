import { BUILDERS } from '@gamedevpl/contract';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ManagedAvailabilityGate } from '../agent-surface/managed-availability.js';
import { MANAGED_UNAVAILABLE_ERROR } from '../platform/managed-builder-error.js';
import type { GitHubClient } from '../catalog/github-client.js';
import type { GamesStore } from '../delivery/games-store.js';
import { sealRefusal } from '../platform/seal-preview.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import { InvalidTokenError, verifyToken } from '../platform/submission-token.js';
import { allowsCreatorBuilderHandoff, isActiveBuildRound, type BuilderKind } from './builder.js';
import { detectStall, type JobTransition } from './job-state.js';
import type { ResumeOutcome } from './resume-build.js';

export interface HandoffSealRoutesOptions {
  store: Store | undefined;
  gamesStore: GamesStore | undefined;
  githubClient: GitHubClient | null;
  submissionTokenSecret: string | undefined;
  managedAvailabilityGate: ManagedAvailabilityGate | null | undefined;
  now: () => number;
  checkUserAccess: (request: FastifyRequest, reply: FastifyReply) => boolean;
  builderOf: (record: SubmissionRecord | null | undefined) => BuilderKind;
  invalidateStatusCache: (jobId: number) => void;
  resumeBuild: (input: {
    jobId: number;
    feedback: string;
    locale: string;
    log: { error: (context: object, message: string) => void };
    builder?: BuilderKind;
    preserveRoundBudget?: boolean;
    transition?: { by: JobTransition['by']; reason: string };
  }) => Promise<ResumeOutcome>;
  gateTrigger:
    | ((input: {
        jobId: number;
        slug: string;
        version: string;
        mode?: 'health' | 'preview' | 'proposal';
      }) => Promise<{ buildId?: string; accepted?: boolean } | void> | void)
    | undefined;
}

// Creator changes of course on a round: swap builder, seal a preview.
export function registerHandoffSealRoutes(app: FastifyInstance, options: HandoffSealRoutesOptions): void {
  const {
    store,
    gamesStore,
    githubClient,
    submissionTokenSecret,
    managedAvailabilityGate,
    now,
    checkUserAccess,
    builderOf,
    invalidateStatusCache,
    resumeBuild,
    gateTrigger,
  } = options;

  // Lets a creator replace the builder without creating feedback.
  app.post(
    '/api/submissions/:token/handoff',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!githubClient || !submissionTokenSecret) {
        return reply.status(503).send({ error: 'submissions are not configured' });
      }
      if (!checkUserAccess(request, reply)) return;
      if (!store) {
        return reply.status(503).send({ error: 'submissions are not configured' });
      }

      const token = z.string().parse((request.params as { token?: string }).token);
      let jobId: number;
      try {
        jobId = verifyToken(token, submissionTokenSecret);
      } catch (error) {
        if (error instanceof InvalidTokenError) {
          return reply.status(400).send({ error: 'invalid submission token' });
        }
        throw error;
      }

      const record = await store.getSubmission(jobId);
      if (!record || record.ownerUid !== request.user!.uid) {
        return reply.status(403).send({ error: 'only the creator can hand off this build' });
      }

      const parsedBody = z
        .object({
          builder: z.enum(BUILDERS).optional(),
          stopActiveSelfAgent: z.boolean().optional(),
          stopActivePlatformAgent: z.boolean().optional(),
        })
        .safeParse(request.body ?? {});
      if (!parsedBody.success) {
        return reply.status(400).send({ error: 'invalid builder handoff request' });
      }
      const requestedBuilder: BuilderKind = parsedBody.data.builder ?? 'platform';
      const creatorRequested =
        requestedBuilder === 'self'
          ? parsedBody.data.stopActivePlatformAgent === true
          : parsedBody.data.stopActiveSelfAgent === true;

      const currentBuilder = builderOf(record);
      if (requestedBuilder === 'platform' && managedAvailabilityGate) {
        const availability = await managedAvailabilityGate.peek(
          record.ownerUid,
          new Date(now()).toISOString().slice(0, 10),
        );
        if (!availability.available) {
          return reply.status(409).send({ error: MANAGED_UNAVAILABLE_ERROR, reason: availability.reason });
        }
      }
      if (record.builderHandoff?.acknowledgedAt && record.builderHandoff.to === requestedBuilder) {
        const retry = await resumeBuild({
          jobId,
          feedback: record.spec ?? `Continue building "${record.title}" for gamedev.pl.`,
          locale: record.locale ?? 'en',
          log: request.log,
          builder: requestedBuilder,
          preserveRoundBudget: true,
          transition: {
            by: 'creator',
            reason: requestedBuilder === 'self' ? 'platform_builder_handoff_retry' : 'self_builder_handoff_retry',
          },
        });
        if (retry.started) await store.clearBuilderHandoff(jobId);
        invalidateStatusCache(jobId);
        if (!retry.started) {
          if (retry.reason === 'platform_unavailable') {
            return reply.status(409).send({ error: MANAGED_UNAVAILABLE_ERROR, reason: retry.unavailableReason });
          }
          return reply.status(502).send({ error: retry.reason });
        }
        return reply.send({ ok: true });
      }
      const stall = detectStall({
        state: record.state ?? 'queued',
        stateSince: record.stateSince ?? record.createdAt,
        lastAgentSignalAt: record.lastAgentSignalAt,
        agentState: record.agentState,
        agentEndedAt: record.agentEndedAt,
        now: now(),
        builder: currentBuilder,
      });
      const roundAlreadyClosed = record.state === 'ready_for_review';
      if (
        record.state === 'publishing' ||
        (!isActiveBuildRound(record) && !roundAlreadyClosed) ||
        (!roundAlreadyClosed &&
          !allowsCreatorBuilderHandoff({
            currentBuilder,
            requestedBuilder,
            stall,
            agentEndedAt: record.agentEndedAt,
            creatorRequested,
          }))
      ) {
        return reply.status(409).send({ error: 'builder_locked', reason: 'active_round', builder: currentBuilder });
      }

      if (record.builderHandoff) {
        if (record.builderHandoff.to !== requestedBuilder) {
          return reply.status(409).send({ error: 'builder_handoff_in_progress', builder: currentBuilder });
        }
        if (record.builderHandoff.awaitsAgentAck === false) {
          return reply.status(409).send({ error: 'builder_handoff_in_progress', builder: currentBuilder });
        }
        return reply.status(202).send({
          ok: true,
          pending: true,
          builder: currentBuilder,
          target: record.builderHandoff.to,
          requestedAt: record.builderHandoff.requestedAt,
          ...(record.builderHandoff.acknowledgedAt ? { acknowledgedAt: record.builderHandoff.acknowledgedAt } : {}),
        });
      }

      // An already-ended agent cannot ack again; resume immediately.

      // Same if never dispatched: no agent exists to ack.
      const neverDispatched = !record.dispatch?.refs?.length;
      const awaitsAgentAck = creatorRequested && stall !== 'ended' && !neverDispatched && !roundAlreadyClosed;
      const requestedAt = new Date(now()).toISOString();
      const accepted = await store.requestBuilderHandoff(jobId, requestedBuilder, requestedAt, awaitsAgentAck);
      if (!accepted) {
        return reply.status(409).send({ error: 'builder_handoff_in_progress', builder: currentBuilder });
      }
      if (awaitsAgentAck) {
        invalidateStatusCache(jobId);
        return reply.status(202).send({
          ok: true,
          pending: true,
          builder: currentBuilder,
          target: requestedBuilder,
          requestedAt,
        });
      }

      // Recheck: a reviewer may have approved since the top read.
      if (roundAlreadyClosed) {
        const fresh = await store.getSubmission(jobId);
        if (!fresh || fresh.state === 'publishing' || fresh.state === 'published') {
          await store.clearBuilderHandoff(jobId).catch(() => {});
          return reply.status(409).send({ error: 'builder_locked', reason: 'active_round', builder: currentBuilder });
        }
      }

      const outcome = await resumeBuild({
        jobId,
        feedback: record.spec ?? `Continue building "${record.title}" for gamedev.pl.`,
        locale: record.locale ?? 'en',
        log: request.log,
        builder: requestedBuilder,
        preserveRoundBudget: true,
        transition: {
          by: 'creator',
          reason: requestedBuilder === 'self' ? 'platform_builder_handoff' : 'self_builder_handoff',
        },
      });
      if (outcome.started) {
        await store.clearBuilderHandoff(jobId);
      } else {
        // The quiet path has no agent to acknowledge the nudge.

        // Ack anyway: resumeBuild may have persisted the builder change.
        await store.acknowledgeBuilderHandoff(jobId, new Date(now()).toISOString());
      }
      invalidateStatusCache(jobId);

      if (!outcome.started) {
        if (outcome.reason === 'platform_unavailable') {
          return reply.status(409).send({ error: MANAGED_UNAVAILABLE_ERROR, reason: outcome.unavailableReason });
        }
        const status = outcome.reason === 'not_configured' ? 503 : 502;
        return reply.status(status).send({ error: outcome.reason });
      }
      return reply.send({ ok: true });
    },
  );
  // Promotes a green preview to a publish candidate, without an agent.

  // Platform agents deliver preview only; publish needs a TRACE they lack.

  // So a finished game sat in ready_for_review with nothing delivered.

  // Redelivering as origin seal makes the gate derive the golden.

  // Nothing is waived: the full acceptance gate still judges the game.

  // Same job, not a new one: ready_for_review is not terminal.
  app.post(
    '/api/submissions/:token/seal',
    // A seal spends a paid gate run; handoff spends nothing.
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!submissionTokenSecret) {
        return reply.status(503).send({ error: 'submissions are not configured' });
      }
      if (!checkUserAccess(request, reply)) return;
      if (!store || !gamesStore || !gateTrigger) {
        return reply.status(503).send({ error: 'store_unavailable' });
      }

      const token = z.string().parse((request.params as { token?: string }).token);
      let jobId: number;
      try {
        jobId = verifyToken(token, submissionTokenSecret);
      } catch (error) {
        if (error instanceof InvalidTokenError) {
          return reply.status(400).send({ error: 'invalid submission token' });
        }
        throw error;
      }

      const owner = await store.getSubmission(jobId);
      if (!owner || owner.ownerUid !== request.user!.uid) {
        return reply.status(403).send({ error: 'only the creator can seal this build' });
      }

      const at = () => new Date(now()).toISOString();
      // Atomic claim: past this point there is one writer.

      // A concurrent request is refused before it spends anything.
      const claimed = await store.claimSeal(jobId, at());
      if (!claimed) {
        const fresh = await store.getSubmission(jobId);
        return reply.status(409).send({ error: (fresh && sealRefusal(fresh)) ?? 'not_reviewable' });
      }

      // Reverts the claim, so a failed seal leaves a retryable round.
      const abort = async (reason: string) => {
        await store
          .recordJobTransition(jobId, { to: 'ready_for_review', at: at(), by: 'system', reason })
          .catch(() => {});
      };

      const slug = claimed.slug!;
      const previewVersion = claimed.previewVersion!;
      const manifest = await gamesStore.getManifest(slug, previewVersion);
      if (!manifest?.previewGate?.green) {
        await abort('seal_not_green');
        return reply.status(409).send({ error: 'preview_not_green' });
      }

      const files: { path: string; content: string }[] = [];
      for (const path of manifest.sourceFiles) {
        const content = await gamesStore.getSourceFile(slug, previewVersion, path);
        if (content === null) {
          await abort('seal_incomplete');
          return reply.status(409).send({ error: 'preview_incomplete' });
        }
        files.push({ path, content });
      }
      // The documented floor, from the refusal this would otherwise hit.

      // round-start is the landmark every game reaches, so nothing is waived.
      if (!files.some((file) => file.path === 'PLAYTEST.json')) {
        files.push({
          path: 'PLAYTEST.json',
          content: `${JSON.stringify({ expectProgress: ['round-start'] }, null, 2)}\n`,
        });
      }

      let version: string;
      try {
        ({ version } = await gamesStore.putCandidateSources({
          slug,
          jobId,
          roundGeneration: claimed.roundGeneration ?? 1,
          files,
          backend: claimed.dispatch?.backend ?? claimed.builder,
          origin: 'seal',
          mode: 'publish',
          ...(manifest.kitEngineRef ? { kitEngineRef: manifest.kitEngineRef } : {}),
          ...(manifest.engineRef ? { engineRef: manifest.engineRef } : {}),
        }));
      } catch (error) {
        request.log.error({ err: error, jobId }, 'sealing a preview failed');
        await abort('seal_failed');
        return reply.status(502).send({ error: 'seal_failed' });
      }

      await store.setSubmissionDeliveredVersion(jobId, version);
      await store.recordJobTransition(jobId, {
        to: 'submitted',
        at: at(),
        by: 'creator',
        reason: 'seal_delivered',
      });

      const gate = await gateTrigger({ jobId, slug, version });
      if (gate?.buildId) {
        await store
          .recordJobCost(jobId, { kind: 'gate_run', at: at(), by: 'cloud-build', ref: gate.buildId })
          .catch(() => {});
      }
      invalidateStatusCache(jobId);

      return reply.send({ ok: true, version });
    },
  );
}
