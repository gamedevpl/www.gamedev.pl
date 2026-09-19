import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isSubmissionInFlight } from '@gamedevpl/contract';
import { pageOwnerGames } from './owner-games.js';
import { recordShelfShadow } from './shelf-shadow.js';
import { mintToken } from '../platform/submission-token.js';
import type { ManagedAvailabilityGate } from '../agent-surface/managed-availability.js';
import { canActOnSlug } from '../platform/game-access-permissions.js';
import type { Store } from '../platform/store.js';
import { readOwnerShelfRecords } from './studio-shelf-records.js';
import { shelfVerifySamplerFor } from './shelf-source.js';
import { shelfReadsFromDocument } from '../platform/shelf-reads-env.js';

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
  // Per process: a restart re-verifies before it trusts the document.

  // What's left of today's allowance — never increments, just reads.
  app.get('/api/me/quota', async (request, reply) => {
    if (!checkUserAccess(request, reply)) {
      return reply;
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
      return reply;
    }
    if (!store) {
      return reply.send({ submissions: [] });
    }

    // The document answers; sampled reads pay source and judge it against them.
    const records = await readOwnerShelfRecords(
      store,
      request.user!.uid,
      (owned, ownedNow) => recordShelfShadow({ store, log: request.log }, request.user!.uid, owned, ownedNow).then(() => undefined),
      { fromDocument: shelfReadsFromDocument(), verify: shelfVerifySamplerFor(app) },
    );
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

  // The header badge's number only -- reads open rounds, not the shelf.
  app.get('/api/submissions/mine/active-count', async (request, reply) => {
    if (!checkUserAccess(request, reply)) {
      return reply;
    }
    if (!store) {
      return reply.send({ active: 0 });
    }

    const uid = request.user!.uid;
    // A round on a game given away is not work in flight.
    const owned = await store.listOpenRoundsByOwner(uid);
    const stillOwned = await Promise.all(
      owned.map(async (round) => !round.slug || (await canActOnSlug(store, round.slug, uid, 'read'))),
    );
    const open = owned.filter((_, index) => stillOwned[index]);
    const { games } = pageOwnerGames(open, 'shelf');
    const active = games.filter(({ tip }) => isSubmissionInFlight(tip.lastStatus ?? tip.lastNotifiedStatus)).length;
    return reply.send({ active });
  });
}
