import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { creatorOwnsSlug } from '../platform/slug-ownership.js';
import { InvalidTokenError, verifyToken } from '../platform/submission-token.js';
import type { GitHubClient } from '../catalog/github-client.js';
import type { AgentBackend } from '../agent-surface/agent-backend.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import type { BuilderKind } from './builder.js';
import { isPublished } from '../platform/publication-state.js';
import { closeJob } from './close-job.js';

export interface DraftLifecycleRoutesOptions {
  store?: Store;
  now: () => number;
  submissionTokenSecret?: string;
  githubClient: GitHubClient | null;
  checkUserAccess: (request: FastifyRequest, reply: FastifyReply) => boolean;
  backendFor: (builder: BuilderKind | undefined) => Promise<AgentBackend | undefined>;
  builderOf: (record: SubmissionRecord | null | undefined) => BuilderKind;
  releaseWorkspace: (
    jobId: number,
    workspace: string,
    log: { error: (context: object, message: string) => void },
    backendName?: string,
  ) => Promise<void>;
  invalidateStatusCache: (jobId: number) => void;
  invalidatePublishedGameCaches: (slug: string) => void;
}

// Creator self-service on their submission: share, abandon, delete.
export async function registerDraftLifecycleRoutes(
  app: FastifyInstance,
  options: DraftLifecycleRoutesOptions,
): Promise<void> {
  const {
    store,
    now,
    submissionTokenSecret,
    githubClient,
    checkUserAccess,
    backendFor,
    builderOf,
    releaseWorkspace,
    invalidateStatusCache,
    invalidatePublishedGameCaches,
  } = options;

  // No separate draft link — /play/<slug> is the address for life.

  // Off by default means genuinely off: 404s for everyone but the creator.

  // Ownership checked via the store — a shared link isn't enough.
  app.post(
    '/api/submissions/:token/share',
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!submissionTokenSecret) {
        return reply.status(503).send({ error: 'submissions are not configured' });
      }
      if (!checkUserAccess(request, reply)) return;
      if (!store) {
        return reply.status(503).send({ error: 'submissions are not configured' });
      }

      const parsedBody = z.object({ shared: z.boolean() }).safeParse(request.body ?? {});
      if (!parsedBody.success) {
        return reply.status(400).send({ error: 'shared must be true or false' });
      }

      const token = z.string().parse((request.params as { token?: string }).token);
      let jobId: number;
      try {
        jobId = verifyToken(token, submissionTokenSecret);
      } catch (error) {
        if (error instanceof InvalidTokenError) {
          return reply.status(400).send({ error: 'invalid token' });
        }
        throw error;
      }

      const record = await store.getSubmission(jobId);
      if (!record || record.ownerUid !== request.user!.uid) {
        return reply.status(403).send({ error: 'only the creator can share this game' });
      }
      if (!record.slug) {
        return reply.status(409).send({ error: 'this game has no address yet' });
      }

      await store.setDraftShared(jobId, parsedBody.data.shared ? new Date(now()).toISOString() : null);
      return reply.send({ shared: parsedBody.data.shared, slug: record.slug });
    },
  );

  // Abandon closes the issue and the agent's open PR.

  // Does not refund the daily quota — the agent time was spent.

  // Ownership checked via the store, not just the token.
  app.post(
    '/api/submissions/:token/abandon',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!githubClient || !submissionTokenSecret) {
        return reply.status(503).send({ error: 'submissions are not configured' });
      }
      if (!checkUserAccess(request, reply)) {
        return;
      }
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
        return reply.status(403).send({ error: 'only the creator can abandon this build' });
      }
      if (record.abandonedAt) {
        return reply.send({ ok: true, alreadyAbandoned: true });
      }

      await closeJob(
        { store, now, backendFor, builderOf, releaseWorkspace, invalidateStatusCache },
        { record, to: 'canceled', by: 'creator', reason: 'abandoned', log: request.log },
      );

      return reply.send({ ok: true });
    },
  );

  app.post(
    '/api/submissions/:token/delete-game',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!submissionTokenSecret) {
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
      if (!record) {
        return reply.status(403).send({ error: 'only the creator can delete this game' });
      }
      if (!record.slug) {
        return reply.status(409).send({ error: 'this game has no address yet' });
      }
      // Not record.ownerUid — a slug transfer can move ownership on.
      if (!(await creatorOwnsSlug(store, record.slug, request.user!.uid))) {
        return reply.status(403).send({ error: 'only the creator can delete this game' });
      }

      const publication = await store.getPublication(record.slug);
      if (!isPublished(publication)) {
        return reply.status(409).send({ error: 'not_published' });
      }

      await store.archivePublication(record.slug, 'deleted by creator', new Date(now()).toISOString());
      invalidatePublishedGameCaches(record.slug);
      invalidateStatusCache(jobId);

      return reply.send({ ok: true, slug: record.slug });
    },
  );
}
