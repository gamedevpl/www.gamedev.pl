import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { gameAccessAuthoritative } from '../platform/game-access-cutover.js';
import { ownsGame, resolveGameAccess } from '../platform/game-access-resolve.js';
import { isRecipientCodeShape } from '../platform/recipient-code.js';
import { isCanonicalSlug } from '../platform/slug-policy.js';
import type { GameTransferInvitation } from '../platform/store.js';
import type { Store } from '../platform/store.js';
import { invalidateTransferInboxCache, readIncomingTransfersCached } from './transfer-inbox-cache.js';

// Never the counterparty's raw uid -- a stable login identifier.

// GO-02 transfer: initiate, cancel, inspect, list-incoming, reject.

// Acceptance is a later PR -- it needs the idle-only commit protocol.

// Inert while GAME_ACCESS_AUTHORITATIVE is off: no canonical owner to check.

export interface GameTransferRoutesOptions {
  store: Store;
  now?: () => number;
}

export interface TransferSummary {
  slug: string;
  status: GameTransferInvitation['status'];
  you: 'sender' | 'recipient';
  counterparty: { profileName: string };
  createdAt: string;
  expiresAt: string;
}

const TransferBody = z.object({ recipientCode: z.string().min(1).max(64) });

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

// No handle claimed yet is exactly the case recipient codes exist for.
async function describeParticipant(store: Store, uid: string): Promise<string> {
  const user = await store.getUser(uid);
  return user?.profileName?.trim() || user?.handle || 'a creator';
}

async function toSummary(store: Store, invite: GameTransferInvitation, viewerUid: string): Promise<TransferSummary> {
  const isSender = invite.senderUid === viewerUid;
  const counterpartyUid = isSender ? invite.recipientUid : invite.senderUid;
  return {
    slug: invite.slug,
    status: invite.status,
    you: isSender ? 'sender' : 'recipient',
    counterparty: { profileName: await describeParticipant(store, counterpartyUid) },
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
  };
}

export async function registerGameTransferRoutes(
  app: FastifyInstance,
  options: GameTransferRoutesOptions,
): Promise<void> {
  const { store } = options;
  const now = options.now ?? Date.now;

  app.post(
    '/api/me/studio/games/:slug/transfer',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      if (!gameAccessAuthoritative()) return reply.status(404).send({ error: 'not_found' });
      const params = SlugParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
      const { slug } = params.data;
      const body = TransferBody.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: 'invalid request' });

      const uid = request.user!.uid;
      const access = await resolveGameAccess(store, slug);
      if (!ownsGame(access, uid)) return reply.status(403).send({ error: 'not_owner' });

      if (!isRecipientCodeShape(body.data.recipientCode)) return reply.status(400).send({ error: 'invalid_code' });
      const recipient = await store.getUserByRecipientCode(body.data.recipientCode);
      if (!recipient) return reply.status(400).send({ error: 'invalid_code' });
      if (recipient.uid === uid) return reply.status(400).send({ error: 'cannot_transfer_to_self' });
      if (recipient.tier === 'blocked' || recipient.deletionScheduledFor) {
        return reply.status(400).send({ error: 'recipient_ineligible' });
      }

      const at = new Date(now()).toISOString();
      const result = await store.createGameTransferInvitation(slug, uid, recipient.uid, access.accessRevision, at);
      if (result === 'busy') return reply.status(409).send({ error: 'busy' });
      if (result === 'ineligible') return reply.status(400).send({ error: 'recipient_ineligible' });
      if (result === 'stale_owner') return reply.status(409).send({ error: 'stale_owner' });
      invalidateTransferInboxCache(store, recipient.uid);
      return reply.send({ transfer: await toSummary(store, result, uid) });
    },
  );

  app.post(
    '/api/me/studio/games/:slug/transfer/cancel',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      if (!gameAccessAuthoritative()) return reply.status(404).send({ error: 'not_found' });
      const params = SlugParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
      const { slug } = params.data;
      const at = new Date(now()).toISOString();
      const result = await store.cancelGameTransferInvitation(slug, request.user!.uid, at);
      if (!result) return reply.status(404).send({ error: 'not_found' });
      invalidateTransferInboxCache(store, result.recipientUid);
      return reply.send({ transfer: await toSummary(store, result, request.user!.uid) });
    },
  );

  app.get(
    '/api/me/studio/games/:slug/transfer',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      if (!gameAccessAuthoritative()) return reply.status(404).send({ error: 'not_found' });
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
      if (!gameAccessAuthoritative()) return reply.status(404).send({ error: 'not_found' });
      const at = new Date(now()).toISOString();
      const uid = request.user!.uid;
      const invites = await readIncomingTransfersCached(store, uid, at);
      return reply.send({ transfers: await Promise.all(invites.map((invite) => toSummary(store, invite, uid))) });
    },
  );

  app.post(
    '/api/me/transfers/:slug/reject',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      if (!gameAccessAuthoritative()) return reply.status(404).send({ error: 'not_found' });
      const params = SlugParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
      const { slug } = params.data;
      const at = new Date(now()).toISOString();
      const result = await store.rejectGameTransferInvitation(slug, request.user!.uid, at);
      if (!result) return reply.status(404).send({ error: 'not_found' });
      invalidateTransferInboxCache(store, result.recipientUid);
      return reply.send({ transfer: await toSummary(store, result, request.user!.uid) });
    },
  );
}
