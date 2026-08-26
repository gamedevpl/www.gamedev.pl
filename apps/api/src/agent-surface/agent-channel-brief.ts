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
import type { AgentTokenAccess } from './agent-token.js';

// Round brief and creator-attached reference images the agent starts from.
export interface AgentChannelBriefRoutesDeps {
  resolveBuild: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<{ issueNumber: number; record: SubmissionRecord; access: AgentTokenAccess } | null>;
  store: Store | undefined;
}

export function registerAgentChannelBriefRoutes(app: FastifyInstance, deps: AgentChannelBriefRoutesDeps): void {
  const { resolveBuild, store } = deps;

  app.get(
    AGENT_CHANNEL_ROUTES.BRIEF,
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { issueNumber, record } = resolved;

      const pending = await store!.listPendingCreatorMessages(issueNumber);
      const seed = seedPayload(record);
      const referenceShots = (await store!.listBuildShots(issueNumber)).filter(
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
      const { issueNumber } = resolved;

      const summaries = (await store!.listBuildShots(issueNumber)).filter((shot) => shot.label === 'creator-reference');
      const images = await Promise.all(
        summaries.map(async (summary) => {
          const shot = await store!.getBuildShot(issueNumber, summary.id);
          if (!shot) return null;
          return { id: shot.id, createdAt: shot.createdAt, png: shot.data };
        }),
      );
      return reply.send({ images: images.filter((image): image is NonNullable<typeof image> => image !== null) });
    },
  );
}
