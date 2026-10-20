// POST /api/games/:slug/proposals; policy lives in proposal-text.ts.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isModerationBlock, type ContentChecker } from '../platform/moderation.js';
import type { Store } from '../platform/store.js';
import { toPublicProposal } from './proposal-public.js';
import { openTextProposal, MAX_PROPOSALS_PER_HOUR, type TextProposalDeps } from './proposal-text.js';
import {
  MAX_PROPOSAL_DESCRIPTION_LENGTH,
  MAX_PROPOSAL_TITLE_LENGTH,
  MIN_PROPOSAL_DESCRIPTION_LENGTH,
} from './proposals.js';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const SlugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN, 'invalid slug'),
});

const TextProposalSchema = z.object({
  title: z.string().trim().min(3).max(MAX_PROPOSAL_TITLE_LENGTH),
  description: z.string().trim().min(MIN_PROPOSAL_DESCRIPTION_LENGTH).max(MAX_PROPOSAL_DESCRIPTION_LENGTH),
});

export interface TextProposalRoutesOptions {
  store: Store;
  contentChecker?: ContentChecker;
  notify?: TextProposalDeps['notify'];
  notifyOperators?: TextProposalDeps['notifyOperators'];
  readSnapshotPointer?: TextProposalDeps['readSnapshotPointer'];
  now?: () => number;
}

export async function registerTextProposalRoutes(
  app: FastifyInstance,
  options: TextProposalRoutesOptions,
): Promise<void> {
  app.post<{ Params: { slug: string } }>(
    '/api/games/:slug/proposals',
    // Edge guard; the hourly per-proposer ceiling is in the domain.
    { config: { rateLimit: { max: MAX_PROPOSALS_PER_HOUR * 4, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!request.user) return reply.status(401).send({ error: 'authentication required' });
      if (request.user.tier === 'blocked') return reply.status(403).send({ error: 'account is blocked' });
      const params = SlugParamsSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
      const body = TextProposalSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'invalid request' });

      const result = await openTextProposal(
        {
          store: options.store,
          contentChecker: options.contentChecker,
          log: request.log,
          notify: options.notify,
          notifyOperators: options.notifyOperators,
          readSnapshotPointer: options.readSnapshotPointer,
          now: options.now,
        },
        {
          targetSlug: params.data.slug,
          proposerUid: request.user.uid,
          title: body.data.title,
          description: body.data.description,
        },
      );
      if (!result.ok) {
        // JSON drops an undefined category; the client looks up contentRejected.<category>.
        if (isModerationBlock(result.error)) {
          return reply.status(result.status).send({ error: result.error, category: result.category ?? 'other' });
        }
        return reply.status(result.status).send({ error: result.error });
      }
      return reply.status(201).send({ proposal: toPublicProposal(result.proposal) });
    },
  );
}
