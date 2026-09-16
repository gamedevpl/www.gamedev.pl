import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canActOnGame, memberKey, viewerRoleOnGame } from '../platform/game-access-permissions.js';
import { resolveGameAccess } from '../platform/game-access-resolve.js';
import { isRecipientCodeShape } from '../platform/recipient-code.js';
import { isCanonicalSlug } from '../platform/slug-policy.js';
import type { GameEditorInvitation } from '../platform/store.js';
import type { Store } from '../platform/store.js';
import { invalidateEditorInviteInboxCache, readIncomingEditorInvitesCached } from './editor-invite-inbox-cache.js';

export interface GameEditorInviteRoutesOptions {
  store: Store;
  now?: () => number;
  notifyShare?: (event: ShareNotice) => Promise<void>;
}

export interface ShareNotice {
  type: 'share.offered' | 'share.accepted' | 'share.removed' | 'share.left';
  uid: string;
  slug: string;
  gameTitle: string;
  actorName: string;
}

export interface EditorInviteSummary {
  slug: string;
  status: GameEditorInvitation['status'];
  you: 'sender' | 'recipient';
  counterparty: { profileName: string };
  memberKey: string;
  createdAt: string;
  expiresAt: string;
}

const InviteBody = z.object({ recipientCode: z.string().min(1).max(64) });
const SlugParams = z.object({ slug: z.string().max(61).refine(isCanonicalSlug) });
const MemberParams = SlugParams.extend({ memberKey: z.string().min(8).max(64) });

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

async function describeParticipant(store: Store, uid: string): Promise<string> {
  const user = await store.getUser(uid);
  return user?.profileName?.trim() || user?.handle || 'a creator';
}

async function gameTitle(store: Store, slug: string): Promise<string> {
  const tip = await store.getSubmissionBySlug(slug);
  return tip?.title?.trim() || slug;
}

async function toSummary(store: Store, invite: GameEditorInvitation, viewerUid: string): Promise<EditorInviteSummary> {
  const isSender = invite.senderUid === viewerUid;
  const counterpartyUid = isSender ? invite.recipientUid : invite.senderUid;
  return {
    slug: invite.slug,
    status: invite.status,
    you: isSender ? 'sender' : 'recipient',
    counterparty: { profileName: await describeParticipant(store, counterpartyUid) },
    memberKey: memberKey(invite.slug, invite.recipientUid),
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
  };
}

async function safeNotify(
  notifyShare: GameEditorInviteRoutesOptions['notifyShare'],
  event: ShareNotice,
): Promise<void> {
  if (!notifyShare) return;
  try {
    await notifyShare(event);
  } catch {
    // A mailer fault must not undo membership.
  }
}

export async function registerGameEditorInviteRoutes(
  app: FastifyInstance,
  options: GameEditorInviteRoutesOptions,
): Promise<void> {
  const { store } = options;
  const now = options.now ?? Date.now;

  app.post(
    '/api/me/studio/games/:slug/editors/invites',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const params = SlugParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
      const { slug } = params.data;
      const body = InviteBody.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: 'invalid request' });
      const uid = request.user!.uid;
      const access = await resolveGameAccess(store, slug);
      if (!canActOnGame(access, uid, 'manageMembers')) return reply.status(403).send({ error: 'not_owner' });
      if (!isRecipientCodeShape(body.data.recipientCode)) return reply.status(400).send({ error: 'invalid_code' });
      const recipient = await store.getUserByRecipientCode(body.data.recipientCode);
      if (!recipient) return reply.status(400).send({ error: 'invalid_code' });
      if (recipient.uid === uid) return reply.status(400).send({ error: 'cannot_invite_self' });
      if (recipient.tier === 'blocked' || recipient.deletionScheduledFor) {
        return reply.status(400).send({ error: 'recipient_ineligible' });
      }
      const at = new Date(now()).toISOString();
      const result = await store.createEditorInvitation(slug, uid, recipient.uid, at, body.data.recipientCode);
      if (result === 'busy') return reply.status(409).send({ error: 'busy' });
      if (result === 'ineligible') return reply.status(400).send({ error: 'recipient_ineligible' });
      if (result === 'stale_owner') return reply.status(409).send({ error: 'stale_owner' });
      if (result === 'already_member') return reply.status(409).send({ error: 'already_member' });
      if (result === 'member_cap') return reply.status(409).send({ error: 'member_cap' });
      invalidateEditorInviteInboxCache(store, recipient.uid);
      await safeNotify(options.notifyShare, {
        type: 'share.offered',
        uid: recipient.uid,
        slug,
        gameTitle: await gameTitle(store, slug),
        actorName: await describeParticipant(store, uid),
      });
      return reply.send({ invite: await toSummary(store, result, uid) });
    },
  );

  app.get(
    '/api/me/studio/games/:slug/editors',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const params = SlugParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
      const { slug } = params.data;
      const uid = request.user!.uid;
      const access = await resolveGameAccess(store, slug);
      if (!canActOnGame(access, uid, 'read')) return reply.status(403).send({ error: 'not_member' });
      const at = new Date(now()).toISOString();
      const ownerUid = access.owner.kind === 'creator' ? access.owner.uid : null;
      const owner = ownerUid
        ? {
            memberKey: memberKey(slug, ownerUid),
            role: 'owner' as const,
            profileName: await describeParticipant(store, ownerUid),
            you: ownerUid === uid,
          }
        : null;
      const editors = await Promise.all(
        access.editorUids.map(async (editorUid) => ({
          memberKey: memberKey(slug, editorUid),
          role: 'editor' as const,
          profileName: await describeParticipant(store, editorUid),
          you: editorUid === uid,
        })),
      );
      const pending =
        canActOnGame(access, uid, 'manageMembers') || access.editorUids.includes(uid)
          ? await Promise.all(
              (await store.listPendingEditorInvitesForSlug(slug, at)).map((invite) => toSummary(store, invite, uid)),
            )
          : [];
      return reply.send({
        viewerRole: viewerRoleOnGame(access, uid),
        owner,
        editors,
        invites: pending,
      });
    },
  );

  app.post(
    '/api/me/studio/games/:slug/editors/invites/:memberKey/cancel',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const params = MemberParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
      const { slug, memberKey: key } = params.data;
      const uid = request.user!.uid;
      const at = new Date(now()).toISOString();
      const pending = await store.listPendingEditorInvitesForSlug(slug, at);
      const match = pending.find((invite) => invite.senderUid === uid && memberKey(slug, invite.recipientUid) === key);
      if (!match) return reply.status(404).send({ error: 'not_found' });
      const result = await store.cancelEditorInvitation(slug, uid, match.recipientUid, at);
      if (!result) return reply.status(404).send({ error: 'not_found' });
      invalidateEditorInviteInboxCache(store, result.recipientUid);
      return reply.send({ invite: await toSummary(store, result, uid) });
    },
  );

  app.get(
    '/api/me/editor-invites/incoming',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const at = new Date(now()).toISOString();
      const uid = request.user!.uid;
      const invites = await readIncomingEditorInvitesCached(store, uid, at);
      return reply.send({ invites: await Promise.all(invites.map((invite) => toSummary(store, invite, uid))) });
    },
  );

  app.post(
    '/api/me/editor-invites/:slug/accept',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const params = SlugParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
      const { slug } = params.data;
      const uid = request.user!.uid;
      const at = new Date(now()).toISOString();
      const result = await store.acceptEditorInvitation(slug, uid, at);
      if (result === 'ineligible') return reply.status(400).send({ error: 'recipient_ineligible' });
      if (result === 'stale_owner') return reply.status(409).send({ error: 'stale_owner' });
      if (result === 'already_member') return reply.status(409).send({ error: 'already_member' });
      if (result === 'member_cap') return reply.status(409).send({ error: 'member_cap' });
      if (!result) return reply.status(404).send({ error: 'not_found' });
      invalidateEditorInviteInboxCache(store, uid);
      await safeNotify(options.notifyShare, {
        type: 'share.accepted',
        uid: result.senderUid,
        slug,
        gameTitle: await gameTitle(store, slug),
        actorName: await describeParticipant(store, uid),
      });
      return reply.send({ invite: await toSummary(store, result, uid) });
    },
  );

  app.post(
    '/api/me/editor-invites/:slug/reject',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const params = SlugParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
      const { slug } = params.data;
      const at = new Date(now()).toISOString();
      const result = await store.rejectEditorInvitation(slug, request.user!.uid, at);
      if (!result) return reply.status(404).send({ error: 'not_found' });
      invalidateEditorInviteInboxCache(store, result.recipientUid);
      return reply.send({ invite: await toSummary(store, result, request.user!.uid) });
    },
  );

  app.post(
    '/api/me/studio/games/:slug/editors/:memberKey/remove',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const params = MemberParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
      const { slug, memberKey: key } = params.data;
      const uid = request.user!.uid;
      const access = await resolveGameAccess(store, slug);
      if (!canActOnGame(access, uid, 'manageMembers')) return reply.status(403).send({ error: 'not_owner' });
      const target = access.editorUids.find((editorUid) => memberKey(slug, editorUid) === key);
      if (!target) return reply.status(404).send({ error: 'not_found' });
      const at = new Date(now()).toISOString();
      const result = await store.removeEditor(slug, uid, target, at);
      if (result === 'stale_owner') return reply.status(409).send({ error: 'stale_owner' });
      if (result === 'not_editor' || !result) return reply.status(404).send({ error: 'not_found' });
      invalidateEditorInviteInboxCache(store, target);
      await safeNotify(options.notifyShare, {
        type: 'share.removed',
        uid: target,
        slug,
        gameTitle: await gameTitle(store, slug),
        actorName: await describeParticipant(store, uid),
      });
      return reply.send({ ok: true });
    },
  );

  app.post(
    '/api/me/studio/games/:slug/editors/leave',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return reply;
      const params = SlugParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
      const { slug } = params.data;
      const uid = request.user!.uid;
      const access = await resolveGameAccess(store, slug);
      if (!canActOnGame(access, uid, 'leave')) return reply.status(403).send({ error: 'not_editor' });
      const at = new Date(now()).toISOString();
      const result = await store.leaveGame(slug, uid, at);
      if (result === 'not_editor' || !result) return reply.status(404).send({ error: 'not_found' });
      const ownerUid = access.owner.kind === 'creator' ? access.owner.uid : null;
      if (ownerUid) {
        await safeNotify(options.notifyShare, {
          type: 'share.left',
          uid: ownerUid,
          slug,
          gameTitle: await gameTitle(store, slug),
          actorName: await describeParticipant(store, uid),
        });
      }
      return reply.send({ ok: true });
    },
  );
}
