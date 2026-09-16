import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canActOnGame } from '../platform/game-access-permissions.js';
import { resolveGameAccess } from '../platform/game-access-resolve.js';
import { isRecipientCodeShape } from '../platform/recipient-code.js';
import { isCanonicalSlug } from '../platform/slug-policy.js';
import type { GameTransferInvitation } from '../platform/store.js';
import type { Store } from '../platform/store.js';
import { invalidateTransferInboxCache, readIncomingTransfersCached } from './transfer-inbox-cache.js';
import { registerGameTransferProposalRoutes } from './game-transfer-proposal-routes.js';

// Never the counterparty's raw uid -- a stable login identifier.

// GO-02 transfer: initiate, cancel, inspect, list-incoming, accept, reject.

export interface GameTransferRoutesOptions {
  store: Store;
  now?: () => number;
  // Catalog attribution joins from GameAccess, but caches per slug.
  invalidatePublishedGameCaches?: (slug: string) => void;
  // Tells the recipient. Optional: without it, transfers stay silent.
  notifyTransferOffered?: (event: { uid: string; slug: string; gameTitle: string; invitedAt: string }) => Promise<void>;
}

export interface TransferSummary {
  slug: string;
  // Names the offer a response must answer. Absent on pre-migration rows.
  invitationId?: string;
  status: GameTransferInvitation['status'];
  you: 'sender' | 'recipient';
  counterparty: { profileName: string | null };
  createdAt: string;
  expiresAt: string;
}

const TransferBody = z.object({ recipientCode: z.string().min(1).max(64) });

// A response says which offer it answers.

// Optional only for invitations written before ids existed; the store

// admits an id-less answer only against an id-less row.
const RespondBody = z.object({ invitationId: z.string().min(1).max(128).optional() });

const SlugParams = z.object({ slug: z.string().max(61).refine(isCanonicalSlug) });

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

// Null rather than a name we invent in one language.
async function describeParticipant(store: Store, uid: string): Promise<string | null> {
  const user = await store.getUser(uid);
  return user?.profileName?.trim() || user?.handle || null;
}

async function toSummary(store: Store, invite: GameTransferInvitation, viewerUid: string): Promise<TransferSummary> {
  const isSender = invite.senderUid === viewerUid;
  const counterpartyUid = isSender ? invite.recipientUid : invite.senderUid;
  return {
    slug: invite.slug,
    invitationId: invite.invitationId,
    status: invite.status,
    you: isSender ? 'sender' : 'recipient',
    counterparty: { profileName: await describeParticipant(store, counterpartyUid) },
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
  };
}

// No offer named, but the caller's pending one has an id.

// Says reload rather than "gone": their offer is still there.

// A stranger learns nothing: only a participant's pending row counts.
async function staleClientRefusal(
  store: Store,
  slug: string,
  uid: string,
  at: string,
  invitationId: string | undefined,
): Promise<boolean> {
  if (invitationId !== undefined) return false;
  const live = await store.getActiveGameTransfer(slug, at);
  if (!live || live.status !== 'pending' || live.invitationId === undefined) return false;
  return live.senderUid === uid || live.recipientUid === uid;
}

export async function registerGameTransferRoutes(
  app: FastifyInstance,
  options: GameTransferRoutesOptions,
): Promise<void> {
  const { store, invalidatePublishedGameCaches, notifyTransferOffered } = options;
  const now = options.now ?? Date.now;

  app.post(
    '/api/me/studio/games/:slug/transfer',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const params = SlugParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
      const { slug } = params.data;
      const body = TransferBody.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: 'invalid request' });

      const uid = request.user!.uid;
      const access = await resolveGameAccess(store, slug);
      if (!canActOnGame(access, uid, 'transfer')) return reply.status(403).send({ error: 'not_owner' });

      if (!isRecipientCodeShape(body.data.recipientCode)) return reply.status(400).send({ error: 'invalid_code' });
      const recipient = await store.getUserByRecipientCode(body.data.recipientCode);
      if (!recipient) return reply.status(400).send({ error: 'invalid_code' });
      if (recipient.uid === uid) return reply.status(400).send({ error: 'cannot_transfer_to_self' });
      if (recipient.tier === 'blocked' || recipient.deletionScheduledFor) {
        return reply.status(400).send({ error: 'recipient_ineligible' });
      }

      const at = new Date(now()).toISOString();
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
      invalidateTransferInboxCache(store, recipient.uid);
      // After the invitation exists, so a failure cannot lose it.
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
          request.log.error({ err: error, slug }, 'transfer invitation notification failed');
        }
      }
      return reply.send({ transfer: await toSummary(store, result, uid) });
    },
  );

  app.post(
    '/api/me/studio/games/:slug/transfer/cancel',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const params = SlugParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
      const { slug } = params.data;
      const body = RespondBody.safeParse(request.body ?? {});
      if (!body.success) return reply.status(400).send({ error: 'invalid_invitation' });
      const at = new Date(now()).toISOString();
      const result = await store.cancelGameTransferInvitation(slug, request.user!.uid, at, body.data.invitationId);
      if (!result) {
        const stale = await staleClientRefusal(store, slug, request.user!.uid, at, body.data.invitationId);
        return reply.status(stale ? 409 : 404).send({ error: stale ? 'stale_client' : 'not_found' });
      }
      invalidateTransferInboxCache(store, result.recipientUid);
      return reply.send({ transfer: await toSummary(store, result, request.user!.uid) });
    },
  );

  app.get(
    '/api/me/studio/games/:slug/transfer',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const params = SlugParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
      const { slug } = params.data;
      const at = new Date(now()).toISOString();
      const invite = await store.getActiveGameTransfer(slug, at);
      const uid = request.user!.uid;

      // A non-participant gets the same shape a truly empty slug would.
      const visible = invite && (invite.senderUid === uid || invite.recipientUid === uid) ? invite : null;
      return reply.send({ transfer: visible ? await toSummary(store, visible, uid) : null });
    },
  );

  app.get(
    '/api/me/transfers/incoming',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const at = new Date(now()).toISOString();
      const uid = request.user!.uid;
      const invites = await readIncomingTransfersCached(store, uid, at);
      return reply.send({ transfers: await Promise.all(invites.map((invite) => toSummary(store, invite, uid))) });
    },
  );

  app.post(
    '/api/me/transfers/:slug/accept',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const params = SlugParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
      const { slug } = params.data;
      const uid = request.user!.uid;
      const body = RespondBody.safeParse(request.body ?? {});
      if (!body.success) return reply.status(400).send({ error: 'invalid_invitation' });
      const at = new Date(now()).toISOString();
      const result = await store.acceptGameTransferInvitation(slug, uid, at, body.data.invitationId);
      if (result === 'busy') return reply.status(409).send({ error: 'busy' });
      if (result === 'ineligible') return reply.status(400).send({ error: 'recipient_ineligible' });
      if (result === 'stale_owner') return reply.status(409).send({ error: 'stale_owner' });
      if (!result) {
        const stale = await staleClientRefusal(store, slug, request.user!.uid, at, body.data.invitationId);
        return reply.status(stale ? 409 : 404).send({ error: stale ? 'stale_client' : 'not_found' });
      }
      invalidateTransferInboxCache(store, uid);
      invalidatePublishedGameCaches?.(slug);
      await Promise.all([store.rebuildShelf(result.senderUid), store.rebuildShelf(result.recipientUid)]);
      return reply.send({ transfer: await toSummary(store, result, uid) });
    },
  );

  app.post(
    '/api/me/transfers/:slug/reject',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const params = SlugParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
      const { slug } = params.data;
      const body = RespondBody.safeParse(request.body ?? {});
      if (!body.success) return reply.status(400).send({ error: 'invalid_invitation' });
      const at = new Date(now()).toISOString();
      const result = await store.rejectGameTransferInvitation(slug, request.user!.uid, at, body.data.invitationId);
      if (!result) {
        const stale = await staleClientRefusal(store, slug, request.user!.uid, at, body.data.invitationId);
        return reply.status(stale ? 409 : 404).send({ error: stale ? 'stale_client' : 'not_found' });
      }
      invalidateTransferInboxCache(store, result.recipientUid);
      return reply.send({ transfer: await toSummary(store, result, request.user!.uid) });
    },
  );

  await registerGameTransferProposalRoutes(app, options);
}
