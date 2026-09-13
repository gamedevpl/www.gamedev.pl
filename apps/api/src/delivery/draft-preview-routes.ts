import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createSharedDraftGate, sharedDraftVersion } from './draft-share-gate.js';
import { isRateLimited } from '../platform/ip-rate-limit.js';
import { InvalidTokenError, verifyToken } from '../platform/submission-token.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import type { GamesStore } from './games-store.js';

type DraftPreviewValue = { slug: string; title: string; html: string };
export type DraftGrant = { jobId: number; version?: string };
// `revision` is the delivered candidate's games-store version id.
type CachedDraftPreview = { value: DraftPreviewValue; revision: string; expiresAt: number };

export interface DraftPreviewRoutesOptions {
  store?: Store;
  gamesStore?: GamesStore;
  now: () => number;
  submissionTokenSecret?: string;
  // Whether the games-repo client is configured — a legacy gate.
  githubConfigured: boolean;
  checkUserAccess: (request: FastifyRequest, reply: FastifyReply) => boolean;
  maxCachedDraftPreviews?: number;
}

export interface DraftPreviewRoutesHandle {
  // Null refuses. A grant names the exact version it authorized.
  canPlayDraft(request: FastifyRequest, slug: string): Promise<DraftGrant | null>;
  // Returns the reply, so a caller's `return` reads as answered.
  replyWithDraft(
    request: FastifyRequest,
    reply: FastifyReply,
    jobId: number,
    versionOverride?: string,
  ): Promise<FastifyReply>;
}

// Serves a build's playable HTML to its owner or sharer.
export async function registerDraftPreviewRoutes(
  app: FastifyInstance,
  options: DraftPreviewRoutesOptions,
): Promise<DraftPreviewRoutesHandle> {
  const { store, gamesStore, now, submissionTokenSecret, githubConfigured, checkUserAccess } = options;
  const shareGate = createSharedDraftGate({ gamesStore, now });
  const maxCachedDraftPreviews = options.maxCachedDraftPreviews ?? 50;

  // Cached per issue; coalesces misses and serves stale on refresh failure.
  const previewRateLimitWindowMs = 60 * 1000;
  const maxPreviewsPerWindow = 30;
  const previewsByIp = new Map<string, number[]>();
  const draftPreviewTtlMs = 5 * 60_000;
  const draftPreviewCache = new Map<number, CachedDraftPreview>();

  function rememberDraftPreview(jobId: number, entry: CachedDraftPreview): void {
    // Newest slot first so an active build outlives abandoned ones.
    draftPreviewCache.delete(jobId);
    if (draftPreviewCache.size >= maxCachedDraftPreviews) {
      const oldestKey = draftPreviewCache.keys().next().value;
      if (oldestKey !== undefined) draftPreviewCache.delete(oldestKey);
    }
    draftPreviewCache.set(jobId, entry);
  }

  // Playable only by its owner, or anyone the creator shared it with.
  async function canPlayDraft(request: FastifyRequest, slug: string): Promise<DraftGrant | null> {
    if (!store) return null;
    let record = await store.getSubmissionBySlug(slug);
    const uid = request.user?.uid;
    // Slug index can lag the owner query on a just-written draft.
    if (!record && uid) {
      record = (await store.listSubmissionsByOwner(uid)).find((row) => row.slug === slug) ?? null;
    }
    if (!record || record.abandonedAt) return null;
    // The owner sees their own red build; a stranger never does.
    if (uid && uid === record.ownerUid) return { jobId: record.jobId };
    // A pulled game is not re-opened by flipping the switch.
    if (record.moderationBlockedAt) return null;
    if (!record.draftSharedAt) return null;
    const version = sharedDraftVersion(record);
    if (!version || !(await shareGate.isGreen(slug, version))) return null;
    // Pinned: a delivery landing now must not ride this answer.
    return { jobId: record.jobId, version };
  }

  // Serves the gate's own bundle, never raw delivered sources.

  // Returns false only when nothing to serve yet; anything else throws.

  // Return boolean, never await Reply — thenable resolves to undefined.
  async function replyWithStoredDraft(
    request: FastifyRequest,
    reply: FastifyReply,
    record: SubmissionRecord,
    versionOverride?: string,
  ): Promise<boolean> {
    const { slug } = record;
    const playableVersion = versionOverride ?? record.previewVersion ?? record.deliveredVersion;
    if (!gamesStore || !slug || !playableVersion) return false;

    if (!versionOverride) {
      const cached = draftPreviewCache.get(record.jobId);
      if (cached && cached.revision === playableVersion && cached.expiresAt > now()) {
        reply.send(cached.value);
        return true;
      }
    }

    // Falls back to the gate's red-run document, never hidden.
    let bundle = await gamesStore.getDerivedArtifact(slug, playableVersion, 'bundle.html');
    const artifact = bundle ? 'bundle.html' : 'preview.html';
    bundle ??= await gamesStore.getDerivedArtifact(slug, playableVersion, 'preview.html');
    // Null means not ready yet; a store error throws instead.
    if (bundle === null) return false;

    const value: DraftPreviewValue = { slug, title: record.title || slug, html: bundle.toString('utf8') };
    if (!versionOverride) {
      rememberDraftPreview(record.jobId, {
        value,
        revision: playableVersion,
        expiresAt: now() + draftPreviewTtlMs,
      });
    }
    request.log.info(
      { jobId: record.jobId, slug, version: playableVersion, artifact },
      'served gate-built preview for a delivered version',
    );
    reply.send(value);
    return true;
  }

  async function replyWithDraft(
    request: FastifyRequest,
    reply: FastifyReply,
    jobId: number,
    versionOverride?: string,
  ): Promise<FastifyReply> {
    const serveLastKnown = (reason: string, err?: unknown): boolean => {
      if (versionOverride) return false;
      const lastKnown = draftPreviewCache.get(jobId);
      if (!lastKnown) return false;
      request.log.warn({ err, jobId, revision: lastKnown.revision }, reason);
      reply.send(lastKnown.value);
      return true;
    };

    // Guarded on gamesStore: without one, the record can't change the answer.
    const record = gamesStore ? await store?.getSubmission(jobId) : null;
    if (record) {
      try {
        if (await replyWithStoredDraft(request, reply, record, versionOverride)) return reply;
      } catch (error) {
        // No hygiene-error branch: this path never assembles, only serves bytes.
        if (serveLastKnown('stored draft read failed; serving last known draft', error)) return reply;

        // No second source left — this is a failure, not a pending state.
        request.log.error({ err: error, jobId }, 'stored draft preview failed');
        return reply.status(502).send({ error: 'failed to load preview' });
      }
    }
    if (serveLastKnown('no delivery yet for native job; serving last known draft')) return reply;
    // No store means no delivery can ever land — nothing to wait for.
    if (!gamesStore) {
      request.log.error({ jobId }, 'preview requested for a native job with no games store configured');
      return reply.status(503).send({ error: 'previews are not configured on this deployment' });
    }
    return reply.status(409).send({ error: 'no preview available for this submission yet' });
  }

  // Only reachable by the token holder for that specific submission.
  app.get(
    '/api/submissions/:token/preview',
    { config: { rateLimit: { max: maxPreviewsPerWindow, timeWindow: previewRateLimitWindowMs } } },
    async (request, reply) => {
      if (!githubConfigured || !submissionTokenSecret) {
        return reply.status(503).send({ error: 'submissions are not configured' });
      }

      if (!checkUserAccess(request, reply)) {
        return reply;
      }

      const token = z.string().parse((request.params as { token?: string }).token);
      const query = request.query as { version?: string } | undefined;
      const requestedVersion =
        typeof query?.version === 'string' && /^[a-zA-Z0-9_-]+$/.test(query.version) ? query.version : undefined;
      const currentTime = now();
      if (isRateLimited(previewsByIp, request.clientIp, currentTime, maxPreviewsPerWindow, previewRateLimitWindowMs)) {
        return reply.status(429).send({ error: 'too many preview requests, please try again later' });
      }

      let jobId: number;
      try {
        jobId = verifyToken(token, submissionTokenSecret);
      } catch (error) {
        if (error instanceof InvalidTokenError) {
          return reply.status(400).send({ error: 'invalid submission token' });
        }
        throw error;
      }

      await replyWithDraft(request, reply, jobId, requestedVersion);
      return reply; // resolve only after that send finished

    },
  );

  // Legacy route; new clients use /api/games/:slug instead.
  app.get('/api/drafts/:slug', async (request, reply) => {
    if (!githubConfigured) {
      return reply.status(503).send({ error: 'submissions are not configured' });
    }
    if (!checkUserAccess(request, reply)) {
      return reply;
    }
    if (!store) {
      return reply.status(503).send({ error: 'submissions are not configured' });
    }

    const parsedParams = z
      .object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/) })
      .safeParse(request.params as { slug?: string });
    if (!parsedParams.success) {
      return reply.status(404).send({ error: 'draft not found' });
    }

    if (isRateLimited(previewsByIp, request.clientIp, now(), maxPreviewsPerWindow, previewRateLimitWindowMs)) {
      return reply.status(429).send({ error: 'too many preview requests, please try again later' });
    }

    // Same sharing rule as /play/<slug>: owner, or anyone shared with.
    const grant = await canPlayDraft(request, parsedParams.data.slug);
    if (!grant) {
      return reply.status(404).send({ error: 'draft not found' });
    }

    await replyWithDraft(request, reply, grant.jobId, grant.version);
    return reply;
  });

  return { canPlayDraft, replyWithDraft };
}
