import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { gameAccessAuthoritative } from '../platform/game-access-cutover.js';
import { ownsGame, resolveGameAccess } from '../platform/game-access-resolve.js';
import type { GameTransferInvitation } from '../platform/store.js';
import type { Store } from '../platform/store.js';

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
  senderUid: string;
  recipientUid: string;
  createdAt: string;
  expiresAt: string;
}

const TransferBody = z.object({ recipientCode: z.string().min(1).max(64) });

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

function toSummary(invite: GameTransferInvitation): TransferSummary {
  return {
    slug: invite.slug,
    status: invite.status,
    senderUid: invite.senderUid,
    recipientUid: invite.recipientUid,
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
      const { slug } = request.params as { slug: string };
      const body = TransferBody.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: 'invalid request' });

      const uid = request.user!.uid;
      const access = await resolveGameAccess(store, slug);
      if (!ownsGame(access, uid)) return reply.status(403).send({ error: 'not_owner' });

      const recipient = await store.getUserByRecipientCode(body.data.recipientCode);
      if (!recipient) return reply.status(400).send({ error: 'invalid_code' });
      if (recipient.uid === uid) return reply.status(400).send({ error: 'cannot_transfer_to_self' });
      if (recipient.tier === 'blocked' || recipient.deletionScheduledFor) {
        return reply.status(400).send({ error: 'recipient_ineligible' });
      }

      const at = new Date(now()).toISOString();
      const result = await store.createGameTransferInvitation(slug, uid, recipient.uid, access.accessRevision, at);
      if (result === 'busy') return reply.status(409).send({ error: 'busy' });
      return reply.send({ transfer: toSummary(result) });
    },
  );

  app.post(
    '/api/me/studio/games/:slug/transfer/cancel',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      if (!gameAccessAuthoritative()) return reply.status(404).send({ error: 'not_found' });
      const { slug } = request.params as { slug: string };
      const at = new Date(now()).toISOString();
      const result = await store.cancelGameTransferInvitation(slug, request.user!.uid, at);
      if (!result) return reply.status(404).send({ error: 'not_found' });
      return reply.send({ transfer: toSummary(result) });
    },
  );

  app.get(
    '/api/me/studio/games/:slug/transfer',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      if (!gameAccessAuthoritative()) return reply.status(404).send({ error: 'not_found' });
      const { slug } = request.params as { slug: string };
      const at = new Date(now()).toISOString();
      const invite = await store.getActiveGameTransfer(slug, at);
      const uid = request.user!.uid;

      // A non-participant gets the same shape a truly empty slug would.
      const visible = invite && (invite.senderUid === uid || invite.recipientUid === uid) ? invite : null;
      return reply.send({ transfer: visible ? toSummary(visible) : null });
    },
  );

  app.get(
    '/api/me/transfers/incoming',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      if (!gameAccessAuthoritative()) return reply.send({ transfers: [] });
      const at = new Date(now()).toISOString();
      const invites = await store.listPendingGameTransfersForRecipient(request.user!.uid, at);
      return reply.send({ transfers: invites.map(toSummary) });
    },
  );

  app.post(
    '/api/me/transfers/:slug/reject',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      if (!gameAccessAuthoritative()) return reply.status(404).send({ error: 'not_found' });
      const { slug } = request.params as { slug: string };
      const at = new Date(now()).toISOString();
      const result = await store.rejectGameTransferInvitation(slug, request.user!.uid, at);
      if (!result) return reply.status(404).send({ error: 'not_found' });
      return reply.send({ transfer: toSummary(result) });
    },
  );
}
