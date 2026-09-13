// Serves the agent executor, and only to a reviewer session.

// Withholding the script is the only gate a client flag cannot flip.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AGENT_PLAY_BRIDGE } from '@gamedevpl/contract';
import { isReviewerSession } from './review.js';

export interface AgentPlayRoutesOptions {
  reviewerUids?: Set<string>;
  adminUids?: Set<string>;
}

export async function registerAgentPlayRoutes(
  app: FastifyInstance,
  options: AgentPlayRoutesOptions = {},
): Promise<void> {
  const reviewerUids = options.reviewerUids ?? new Set<string>();
  const adminUids = options.adminUids ?? new Set<string>();

  // 404 like the review desk: probing learns nothing either way.
  app.get('/api/agent-play/bridge', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isReviewerSession(request, reviewerUids, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }
    // Never shared: a cached copy would reach the next visitor.
    reply.header('cache-control', 'private, no-store');
    return reply.send({ source: AGENT_PLAY_BRIDGE });
  });
}
