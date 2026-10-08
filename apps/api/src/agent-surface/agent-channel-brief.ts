import { DREAM_SHOT_LABELS } from '../platform/dream-shots.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import {
  AGENT_BUILD_RULES_DIGEST,
  briefLocales,
  buildConstraints,
  DEFAULT_BUILD_ORIENTATION,
} from './agent-build-brief.js';
import { seedPayload } from './seed-status.js';
import { dispatchAttempt, type Store, type SubmissionRecord } from '../platform/store.js';
import type { AgentTokenAccess } from '../platform/agent-token.js';
import { canonicalAppBaseUrl } from '../platform/canonical-app-url.js';
import {
  mintReferenceImageToken,
  REFERENCE_IMAGE_DOWNLOAD_ROUTE,
  verifyReferenceImageToken,
} from './reference-image-url.js';

// Round brief and creator-attached reference images the agent starts from.
export interface AgentChannelBriefRoutesDeps {
  resolveBuild: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<{ jobId: number; record: SubmissionRecord; access: AgentTokenAccess } | null>;
  store: Store | undefined;
  // Signs the download URLs; without it the list stays inline only.
  agentTokenSecret?: string;
  now?: () => number;
}

export function registerAgentChannelBriefRoutes(app: FastifyInstance, deps: AgentChannelBriefRoutesDeps): void {
  const { resolveBuild, store, agentTokenSecret } = deps;
  const now = deps.now ?? Date.now;

  app.get(
    AGENT_CHANNEL_ROUTES.BRIEF,
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { jobId, record } = resolved;

      const pending = await store!.listPendingCreatorMessages(jobId);
      const seed = seedPayload(record);
      const referenceShots = (await store!.listBuildShots(jobId, { excludeLabels: DREAM_SHOT_LABELS })).filter(
        (shot) => shot.label === 'creator-reference',
      );
      return reply.send({
        title: record.title,
        slug: record.slug ?? null,
        spec: record.spec ?? '',
        qa: record.qa ?? [],
        rules: AGENT_BUILD_RULES_DIGEST,
        constraints: buildConstraints(DEFAULT_BUILD_ORIENTATION),
        locales: briefLocales(record.locale),
        ...seed,
        dispatchAttempt: await dispatchAttempt(store!, record),
        pendingMessages: pending.map((message) => ({
          id: message.id,
          text: message.text,
          createdAt: message.createdAt,
        })),
        referenceImages: referenceShots.map((shot) => ({ id: shot.id, createdAt: shot.createdAt })),
      });
    },
  );

  app.get(
    AGENT_CHANNEL_ROUTES.REFERENCE_IMAGES,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { jobId } = resolved;

      const summaries = (await store!.listBuildShots(jobId, { excludeLabels: DREAM_SHOT_LABELS })).filter(
        (shot) => shot.label === 'creator-reference',
      );
      // URLs instead of bytes: the agent downloads what it needs.
      if ((request.query as { urls?: string }).urls === '1' && agentTokenSecret) {
        const base = `${canonicalAppBaseUrl()}${REFERENCE_IMAGE_DOWNLOAD_ROUTE}`;
        return reply.send({
          images: summaries.map((summary) => {
            const minted = mintReferenceImageToken(agentTokenSecret, { jobId, shotId: summary.id, nowMs: now() });
            const url = `${base}?t=${encodeURIComponent(minted.token)}`;
            return { id: summary.id, createdAt: summary.createdAt, url, expiresAt: minted.expiresAt };
          }),
        });
      }
      const images = await Promise.all(
        summaries.map(async (summary) => {
          const shot = await store!.getBuildShot(jobId, summary.id);
          if (!shot) return null;
          return { id: shot.id, createdAt: shot.createdAt, png: shot.data };
        }),
      );
      return reply.send({ images: images.filter((image): image is NonNullable<typeof image> => image !== null) });
    },
  );

  // The signed token is the credential, so a plain curl works.
  app.get(
    REFERENCE_IMAGE_DOWNLOAD_ROUTE,
    { config: { rateLimit: { max: 300, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const token = (request.query as { t?: string }).t;
      const claim = agentTokenSecret && token ? verifyReferenceImageToken(agentTokenSecret, token, now()) : null;
      if (!claim || !store) return reply.status(404).send({ error: 'not found' });
      const shot = await store.getBuildShot(claim.jobId, claim.shotId);
      if (!shot || shot.label !== 'creator-reference') return reply.status(404).send({ error: 'not found' });
      return reply
        .header('content-type', shot.mediaType ?? 'image/png')
        .header('cache-control', 'private, max-age=300')
        .header('x-content-type-options', 'nosniff')
        .send(Buffer.from(shot.data, 'base64'));
    },
  );
}
