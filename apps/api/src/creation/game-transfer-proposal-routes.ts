import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canActOnGame } from '../platform/game-access-permissions.js';
import { resolveGameAccess } from '../platform/game-access-resolve.js';
import { isRecipientCodeShape } from '../platform/recipient-code.js';
import { isCanonicalSlug } from '../platform/slug-policy.js';
import type { Store } from '../platform/store.js';
import { opaqueAccessVersion, parseAccessVersion, proposalIsOpen } from '../store/records/game-transfer-proposal.js';
import { invalidateTransferInboxCache } from './transfer-inbox-cache.js';

export interface GameTransferProposalRoutesOptions {
  store: Store;
  now?: () => number;
  invalidatePublishedGameCaches?: (slug: string) => void;
  notifyTransferOffered?: (event: { uid: string; slug: string; gameTitle: string; invitedAt: string }) => Promise<void>;
}

function requireUser(
  request: { user?: { uid: string; tier?: string } | null },
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
): boolean {
  if (!request.user) {
    reply.status(401).send({ error: 'authentication required' });
    return false;
  }
  if (request.user.tier === 'blocked') {
    reply.status(403).send({ error: 'account is blocked' });
    return false;
  }
  return true;
}

const Params = z.object({
  slug: z.string().max(61).refine(isCanonicalSlug),
  proposalId: z.string().uuid(),
});
const ConfirmBody = z.object({ recipientCode: z.string().min(1).max(64) });

async function describeParticipant(store: Store, uid: string): Promise<string | null> {
  const user = await store.getUser(uid);
  return user?.profileName?.trim() || user?.handle || null;
}

export async function registerGameTransferProposalRoutes(
  app: FastifyInstance,
  options: GameTransferProposalRoutesOptions,
): Promise<void> {
  const { store, invalidatePublishedGameCaches, notifyTransferOffered } = options;
  const now = options.now ?? Date.now;

  app.get(
    '/api/me/studio/games/:slug/transfer/propose/:proposalId',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const params = Params.safeParse(request.params);
      if (!params.success) return reply.status(404).send({ error: 'not_found' });
      const { slug, proposalId } = params.data;
      const at = new Date(now()).toISOString();
      const proposal = await store.getTransferProposal(proposalId, at);
      const uid = request.user!.uid;
      if (!proposal || proposal.slug !== slug || proposal.ownerUid !== uid) {
        return reply.status(404).send({ error: 'not_found' });
      }
      const access = await resolveGameAccess(store, slug);
      if (!canActOnGame(access, uid, 'transfer') || access.accessRevision !== proposal.accessRevision) {
        return reply.status(409).send({ error: 'stale_owner', proposal: { status: 'invalidated' } });
      }
      const record = await store.getSubmissionBySlug(slug);
      return reply.send({
        proposal: {
          proposalId: proposal.proposalId,
          slug,
          status: proposalIsOpen(proposal, at) ? 'ready' : proposal.confirmedAt ? 'invalidated' : 'expired',
          expiresAt: proposal.expiresAt,
          accessVersion: opaqueAccessVersion(proposal.accessRevision),
          title: record?.title ?? slug,
          historyShared: true,
        },
      });
    },
  );

  app.post(
    '/api/me/studio/games/:slug/transfer/propose/:proposalId',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const params = Params.safeParse(request.params);
      if (!params.success) return reply.status(404).send({ error: 'not_found' });
      const body = ConfirmBody.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: 'invalid request' });
      const { slug, proposalId } = params.data;
      const uid = request.user!.uid;
      const at = new Date(now()).toISOString();
      const proposal = await store.getTransferProposal(proposalId, at);
      if (!proposal || proposal.slug !== slug || proposal.ownerUid !== uid) {
        return reply.status(404).send({ error: 'not_found' });
      }
      if (!proposalIsOpen(proposal, at)) return reply.status(409).send({ error: 'expired' });

      const access = await resolveGameAccess(store, slug);
      if (!canActOnGame(access, uid, 'transfer')) return reply.status(403).send({ error: 'not_owner' });
      if (
        access.accessRevision !== proposal.accessRevision ||
        parseAccessVersion(proposal.expectedAccessVersion) !== access.accessRevision
      ) {
        return reply.status(409).send({ error: 'stale_owner' });
      }
      if (!isRecipientCodeShape(body.data.recipientCode)) return reply.status(400).send({ error: 'invalid_code' });
      const recipient = await store.getUserByRecipientCode(body.data.recipientCode);
      if (!recipient) return reply.status(400).send({ error: 'invalid_code' });
      if (recipient.uid === uid) return reply.status(400).send({ error: 'cannot_transfer_to_self' });
      if (recipient.tier === 'blocked' || recipient.deletionScheduledFor) {
        return reply.status(400).send({ error: 'recipient_ineligible' });
      }

      const result = await store.createGameTransferInvitation(
        slug,
        uid,
        recipient.uid,
        access.accessRevision,
        at,
        body.data.recipientCode,
      );
      if (result === 'busy') return reply.status(409).send({ error: 'busy' });
      if (result === 'ineligible') return reply.status(400).send({ error: 'recipient_ineligible' });
      if (result === 'stale_owner') return reply.status(409).send({ error: 'stale_owner' });

      const confirmed = await store.confirmTransferProposal(proposalId, uid, at);
      if (!confirmed) return reply.status(409).send({ error: 'expired' });
      invalidateTransferInboxCache(store, recipient.uid);
      invalidatePublishedGameCaches?.(slug);
      if (notifyTransferOffered) {
        try {
          const record = await store.getSubmissionBySlug(slug);
          await notifyTransferOffered({
            uid: recipient.uid,
            slug,
            gameTitle: record?.title ?? slug,
            invitedAt: result.createdAt,
          });
        } catch (error) {
          request.log.error({ err: error, slug }, 'transfer proposal notification failed');
        }
      }
      return reply.send({
        transfer: {
          slug,
          invitationId: result.invitationId,
          status: result.status,
          you: 'sender',
          counterparty: { profileName: await describeParticipant(store, recipient.uid) },
          createdAt: result.createdAt,
          expiresAt: result.expiresAt,
        },
      });
    },
  );
}
