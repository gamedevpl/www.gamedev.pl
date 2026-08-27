import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { pageOwnerGames } from './owner-games.js';
import { mintToken } from '../platform/submission-token.js';
import type { ManagedAvailabilityGate } from '../agent-surface/managed-availability.js';
import type { Store } from '../platform/store.js';

export interface CreatorSelfRoutesOptions {
  store?: Store;
  now: () => number;
  checkUserAccess: (request: FastifyRequest, reply: FastifyReply) => boolean;
  dailySubmissionQuota: number;
  submissionTokenSecret?: string;
  managedAvailabilityGate?: ManagedAvailabilityGate | null;
}

// A creator's own read-only account state: quota and shelf.
export async function registerCreatorSelfRoutes(
  app: FastifyInstance,
  options: CreatorSelfRoutesOptions,
): Promise<void> {
  const { store, now, checkUserAccess, dailySubmissionQuota, submissionTokenSecret, managedAvailabilityGate } = options;

  // What's left of today's allowance — never increments, just reads.
  app.get('/api/me/quota', async (request, reply) => {
    if (!checkUserAccess(request, reply)) {
      return;
    }
    const dateStr = new Date(now()).toISOString().slice(0, 10);
    if (!store) {
      return reply.send({
        submissions: { used: 0, limit: dailySubmissionQuota },
        ...(managedAvailabilityGate
          ? { platformBuilder: await managedAvailabilityGate.peek(request.user!.uid, dateStr) }
          : {}),
      });
    }

    const [usage, user, platformBuilder] = await Promise.all([
      store.getUsage(request.user!.uid, dateStr),
      store.getUser(request.user!.uid),
      managedAvailabilityGate ? managedAvailabilityGate.peek(request.user!.uid, dateStr) : undefined,
    ]);
    return reply.send({
      submissions: {
        used: usage.submissions,
        // Trusted accounts bypass the counter — report no ceiling.
        limit: user?.tier === 'trusted' ? null : dailySubmissionQuota,
      },
      ...(platformBuilder ? { platformBuilder } : {}),
    });
  });

  app.get('/api/submissions/mine', async (request, reply) => {
    if (!submissionTokenSecret) {
      return reply.status(503).send({ error: 'submissions are not configured' });
    }
    if (!checkUserAccess(request, reply)) {
      return;
    }
    if (!store) {
      return reply.send({ submissions: [] });
    }

    const records = await store.listSubmissionsByOwner(request.user!.uid);
    const { games: shelf, truncated, total } = pageOwnerGames(records, 'shelf');
    return reply.send({
      submissions: shelf.map(({ tip, catalogPublishedAt }) => ({
        token: mintToken(tip.jobId, submissionTokenSecret),
        title: tip.title,
        createdAt: tip.createdAt,
        // Last derived status, kept current by the two-minute sweep.

        // lastNotifiedStatus is the fallback for older records.
        lastKnownStatus: tip.lastStatus ?? tip.lastNotifiedStatus ?? null,
        // So a published card can offer Play without deriving the slug itself.
        slug: tip.slug ?? null,
        ...(tip.publishedAt ? { publishedAt: tip.publishedAt } : {}),
        ...(catalogPublishedAt ? { livePublishedAt: catalogPublishedAt } : {}),
      })),
      truncated,
      totalGames: total,
    });
  });
}
