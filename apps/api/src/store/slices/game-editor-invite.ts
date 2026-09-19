import type { Firestore } from '@google-cloud/firestore';
import {
  fencedOut,
  MAX_GAME_MEMBERS,
  membersOf,
  withEditorAdded,
  type GameAccessRecord,
} from '../records/game-access.js';
import {
  editorInviteDocId,
  effectiveEditorInviteStatus,
  isPendingEditorInvite,
  newEditorInvitation,
  type GameEditorInvitation,
} from '../records/game-editor-invite.js';
import { newMembershipAudit, type GameMembershipAuditRecord } from '../records/game-membership-audit.js';
import { tombstoneShelf, type ShelfDocument } from '../records/shelf.js';

export type EditorInviteCreateResult =
  GameEditorInvitation | 'busy' | 'ineligible' | 'stale_owner' | 'already_member' | 'member_cap';

export type EditorInviteAcceptResult =
  GameEditorInvitation | 'ineligible' | 'stale_owner' | 'already_member' | 'member_cap' | null;

export interface GameEditorInviteStore {
  getEditorInvite(slug: string, recipientUid: string, at: string): Promise<GameEditorInvitation | null>;

  createEditorInvitation(
    slug: string,
    senderUid: string,
    recipientUid: string,
    at: string,
    recipientCode?: string,
  ): Promise<EditorInviteCreateResult>;

  acceptEditorInvitation(
    slug: string,
    recipientUid: string,
    at: string,
    inviteId: string,
  ): Promise<EditorInviteAcceptResult>;

  cancelEditorInvitation(
    slug: string,
    senderUid: string,
    recipientUid: string,
    at: string,
    inviteId: string,
  ): Promise<GameEditorInvitation | null>;

  rejectEditorInvitation(
    slug: string,
    recipientUid: string,
    at: string,
    inviteId: string,
  ): Promise<GameEditorInvitation | null>;

  listPendingEditorInvitesForRecipient(uid: string, at: string): Promise<GameEditorInvitation[]>;

  listPendingEditorInvitesForSlug(slug: string, at: string): Promise<GameEditorInvitation[]>;

  cancelPendingEditorInvitesForSlug(slug: string, at: string): Promise<void>;

  cancelPendingEditorInvitesForUid(uid: string, at: string): Promise<void>;
}

const clone = (invite: GameEditorInvitation): GameEditorInvitation => ({ ...invite });

function erasedIncarnation(user: { createdAt?: string } | null, erasedAt: string | null): boolean {
  return erasedAt !== null && (!user?.createdAt || fencedOut(erasedAt, user.createdAt));
}

function fenceAt(snap: { exists: boolean; data: () => unknown }): string | null {
  return snap.exists ? ((snap.data() as { at?: string }).at ?? null) : null;
}

function recipientEligible(recipient: { tier: string; deletionScheduledFor?: string } | null): boolean {
  if (!recipient) return true;
  return recipient.tier !== 'blocked' && !recipient.deletionScheduledFor;
}

function senderIsOwner(access: GameAccessRecord | null, senderUid: string): boolean {
  return access !== null && access.ownerUid === senderUid;
}

function atMemberCap(access: GameAccessRecord): boolean {
  return membersOf(access.ownerUid, access.editorUids).length >= MAX_GAME_MEMBERS;
}

function alreadyMember(access: GameAccessRecord, uid: string): boolean {
  return access.ownerUid === uid || access.editorUids.includes(uid);
}

export class InMemoryGameEditorInviteStore implements GameEditorInviteStore {
  invites = new Map<string, GameEditorInvitation>();
  audits: GameMembershipAuditRecord[] = [];

  constructor(
    private erasedAt: (uid: string) => string | null = () => null,
    private getGameAccess: (slug: string) => GameAccessRecord | null = () => null,
    private getUser: (uid: string) => { tier: string; deletionScheduledFor?: string; createdAt?: string } | null = () =>
      null,
    private getRecipientCodeOwner: (code: string) => string | null = () => null,
    private writeGameAccess: (slug: string, record: GameAccessRecord) => void = () => {},
    // Same write as the access change; neither lands alone.
    private invalidateShelf: (ownerUid: string, at: string) => void = () => {},
  ) {}

  private read(slug: string, recipientUid: string, at: string): GameEditorInvitation | null {
    const existing = this.invites.get(editorInviteDocId(slug, recipientUid));
    if (!existing) return null;
    return { ...clone(existing), status: effectiveEditorInviteStatus(existing, at) };
  }

  async getEditorInvite(slug: string, recipientUid: string, at: string): Promise<GameEditorInvitation | null> {
    return this.read(slug, recipientUid, at);
  }

  async createEditorInvitation(
    slug: string,
    senderUid: string,
    recipientUid: string,
    at: string,
    recipientCode?: string,
  ): Promise<EditorInviteCreateResult> {
    if ([senderUid, recipientUid].some((uid) => erasedIncarnation(this.getUser(uid), this.erasedAt(uid))))
      return 'ineligible';
    if (!recipientEligible(this.getUser(recipientUid))) return 'ineligible';
    if (recipientCode !== undefined && this.getRecipientCodeOwner(recipientCode) !== recipientUid) return 'ineligible';
    const access = this.getGameAccess(slug);
    if (!senderIsOwner(access, senderUid)) return 'stale_owner';
    if (alreadyMember(access!, recipientUid)) return 'already_member';
    if (atMemberCap(access!)) return 'member_cap';

    const existing = this.invites.get(editorInviteDocId(slug, recipientUid)) ?? null;
    if (isPendingEditorInvite(existing, at)) return 'busy';

    const invite = newEditorInvitation(slug, senderUid, recipientUid, at);
    this.invites.set(editorInviteDocId(slug, recipientUid), invite);
    this.audits.push(newMembershipAudit(slug, 'invite_created', senderUid, recipientUid, at));
    return clone(invite);
  }

  async acceptEditorInvitation(
    slug: string,
    recipientUid: string,
    at: string,
    inviteId: string,
  ): Promise<EditorInviteAcceptResult> {
    const key = editorInviteDocId(slug, recipientUid);
    const existing = this.invites.get(key) ?? null;
    if (!existing || existing.recipientUid !== recipientUid || existing.inviteId !== inviteId) return null;
    if (existing.status === 'accepted') return clone(existing);
    if (!isPendingEditorInvite(existing, at)) return null;

    if ([existing.senderUid, recipientUid].some((uid) => fencedOut(this.erasedAt(uid), existing.createdAt)))
      return 'ineligible';
    if (!recipientEligible(this.getUser(recipientUid))) return 'ineligible';

    const access = this.getGameAccess(slug);
    if (!senderIsOwner(access, existing.senderUid)) return 'stale_owner';
    if (alreadyMember(access!, recipientUid)) return 'already_member';
    if (atMemberCap(access!)) return 'member_cap';

    const next = withEditorAdded(access!, recipientUid, at);
    if (!next) return 'member_cap';
    this.writeGameAccess(slug, next);
    this.invalidateShelf(recipientUid, at);
    const accepted: GameEditorInvitation = { ...existing, status: 'accepted', respondedAt: at };
    this.invites.set(key, accepted);
    this.audits.push(newMembershipAudit(slug, 'editor_accepted', recipientUid, recipientUid, at));
    return clone(accepted);
  }

  async cancelEditorInvitation(
    slug: string,
    senderUid: string,
    recipientUid: string,
    at: string,
    inviteId: string,
  ): Promise<GameEditorInvitation | null> {
    const key = editorInviteDocId(slug, recipientUid);
    const existing = this.invites.get(key) ?? null;
    if (!isPendingEditorInvite(existing, at) || existing.senderUid !== senderUid || existing.inviteId !== inviteId) {
      return null;
    }
    const updated: GameEditorInvitation = { ...existing, status: 'cancelled', respondedAt: at };
    this.invites.set(key, updated);
    this.audits.push(newMembershipAudit(slug, 'invite_cancelled', senderUid, recipientUid, at));
    return clone(updated);
  }

  async rejectEditorInvitation(
    slug: string,
    recipientUid: string,
    at: string,
    inviteId: string,
  ): Promise<GameEditorInvitation | null> {
    const key = editorInviteDocId(slug, recipientUid);
    const existing = this.invites.get(key) ?? null;
    if (
      !isPendingEditorInvite(existing, at) ||
      existing.recipientUid !== recipientUid ||
      existing.inviteId !== inviteId
    ) {
      return null;
    }
    const updated: GameEditorInvitation = { ...existing, status: 'rejected', respondedAt: at };
    this.invites.set(key, updated);
    this.audits.push(newMembershipAudit(slug, 'invite_rejected', recipientUid, recipientUid, at));
    return clone(updated);
  }

  async listPendingEditorInvitesForRecipient(uid: string, at: string): Promise<GameEditorInvitation[]> {
    return [...this.invites.values()]
      .filter((row) => row.recipientUid === uid && isPendingEditorInvite(row, at))
      .map(clone);
  }

  async listPendingEditorInvitesForSlug(slug: string, at: string): Promise<GameEditorInvitation[]> {
    return [...this.invites.values()].filter((row) => row.slug === slug && isPendingEditorInvite(row, at)).map(clone);
  }

  async cancelPendingEditorInvitesForSlug(slug: string, at: string): Promise<void> {
    for (const [key, invite] of [...this.invites]) {
      if (invite.slug !== slug || !isPendingEditorInvite(invite, at)) continue;
      this.invites.set(key, { ...invite, status: 'cancelled', respondedAt: at });
    }
  }

  async cancelPendingEditorInvitesForUid(uid: string, at: string): Promise<void> {
    for (const [key, invite] of [...this.invites]) {
      const party = invite.senderUid === uid || invite.recipientUid === uid;
      if (!party || !isPendingEditorInvite(invite, at)) continue;
      this.invites.set(key, { ...invite, status: 'cancelled', respondedAt: at });
    }
  }
}

export class FirestoreGameEditorInviteStore implements GameEditorInviteStore {
  constructor(private db: Firestore) {}

  private doc(slug: string, recipientUid: string) {
    return this.db.collection('gameEditorInvites').doc(editorInviteDocId(slug, recipientUid));
  }

  private erasureFence(uid: string) {
    return this.db.collection('erasedAccounts').doc(uid);
  }

  private auditRef() {
    return this.db.collection('gameMembershipAudit').doc();
  }

  async getEditorInvite(slug: string, recipientUid: string, at: string): Promise<GameEditorInvitation | null> {
    const snap = await this.doc(slug, recipientUid).get();
    if (!snap.exists) return null;
    const record = snap.data() as GameEditorInvitation;
    return { ...record, status: effectiveEditorInviteStatus(record, at) };
  }

  async createEditorInvitation(
    slug: string,
    senderUid: string,
    recipientUid: string,
    at: string,
    recipientCode?: string,
  ): Promise<EditorInviteCreateResult> {
    const ref = this.doc(slug, recipientUid);
    const accessRef = this.db.collection('gameAccess').doc(slug);
    const recipientRef = this.db.collection('users').doc(recipientUid);
    const codeRef = recipientCode !== undefined ? this.db.collection('recipientCodes').doc(recipientCode) : null;
    return this.db.runTransaction(async (tx) => {
      const [snap, senderFence, recipientFence, accessSnap, recipientSnap, codeSnap, senderSnap] = await Promise.all([
        tx.get(ref),
        tx.get(this.erasureFence(senderUid)),
        tx.get(this.erasureFence(recipientUid)),
        tx.get(accessRef),
        tx.get(recipientRef),
        codeRef ? tx.get(codeRef) : Promise.resolve(null),
        tx.get(this.db.collection('users').doc(senderUid)),
      ]);

      const recipient = recipientSnap.exists
        ? (recipientSnap.data() as { tier: string; deletionScheduledFor?: string; createdAt?: string })
        : null;
      const sender = senderSnap.exists ? (senderSnap.data() as { createdAt?: string }) : null;
      if (erasedIncarnation(sender, fenceAt(senderFence)) || erasedIncarnation(recipient, fenceAt(recipientFence)))
        return 'ineligible';
      if (!recipientEligible(recipient)) return 'ineligible';
      if (codeSnap && (!codeSnap.exists || (codeSnap.data() as { uid: string }).uid !== recipientUid)) {
        return 'ineligible';
      }
      const access = accessSnap.exists ? (accessSnap.data() as GameAccessRecord) : null;
      if (!senderIsOwner(access, senderUid)) return 'stale_owner';
      if (alreadyMember(access!, recipientUid)) return 'already_member';
      if (atMemberCap(access!)) return 'member_cap';
      const existing = snap.exists ? (snap.data() as GameEditorInvitation) : null;
      if (isPendingEditorInvite(existing, at)) return 'busy';
      const invite = newEditorInvitation(slug, senderUid, recipientUid, at);
      tx.set(ref, invite);
      tx.set(this.auditRef(), newMembershipAudit(slug, 'invite_created', senderUid, recipientUid, at));
      return invite;
    });
  }

  async acceptEditorInvitation(
    slug: string,
    recipientUid: string,
    at: string,
    inviteId: string,
  ): Promise<EditorInviteAcceptResult> {
    const ref = this.doc(slug, recipientUid);
    const accessRef = this.db.collection('gameAccess').doc(slug);
    const shelfRef = this.db.collection('shelves').doc(recipientUid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? (snap.data() as GameEditorInvitation) : null;
      if (!existing || existing.recipientUid !== recipientUid || existing.inviteId !== inviteId) return null;
      if (existing.status === 'accepted') return existing;
      if (!isPendingEditorInvite(existing, at)) return null;

      const [senderFence, recipientFence, recipientSnap, accessSnap, shelfSnap] = await Promise.all([
        tx.get(this.erasureFence(existing.senderUid)),
        tx.get(this.erasureFence(recipientUid)),
        tx.get(this.db.collection('users').doc(recipientUid)),
        tx.get(accessRef),
        tx.get(shelfRef),
      ]);
      if (fencedOut(fenceAt(senderFence), existing.createdAt) || fencedOut(fenceAt(recipientFence), existing.createdAt))
        return 'ineligible';
      const recipient = recipientSnap.exists
        ? (recipientSnap.data() as { tier: string; deletionScheduledFor?: string; createdAt?: string })
        : null;
      if (!recipientEligible(recipient)) return 'ineligible';
      const access = accessSnap.exists ? (accessSnap.data() as GameAccessRecord) : null;
      if (!senderIsOwner(access, existing.senderUid)) return 'stale_owner';
      if (alreadyMember(access!, recipientUid)) return 'already_member';
      const next = withEditorAdded(access!, recipientUid, at);
      if (!next) return 'member_cap';
      tx.set(accessRef, next);
      // Atomic with the access change; gaining a game moves no ownerUid.
      const shelf = shelfSnap.exists ? (shelfSnap.data() as ShelfDocument) : null;
      tx.set(shelfRef, tombstoneShelf(at, (shelf?.seq ?? 0) + 1));
      const accepted: GameEditorInvitation = { ...existing, status: 'accepted', respondedAt: at };
      tx.set(ref, accepted);
      tx.set(this.auditRef(), newMembershipAudit(slug, 'editor_accepted', recipientUid, recipientUid, at));
      return accepted;
    });
  }

  async cancelEditorInvitation(
    slug: string,
    senderUid: string,
    recipientUid: string,
    at: string,
    inviteId: string,
  ): Promise<GameEditorInvitation | null> {
    const ref = this.doc(slug, recipientUid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? (snap.data() as GameEditorInvitation) : null;
      if (!isPendingEditorInvite(existing, at) || existing.senderUid !== senderUid || existing.inviteId !== inviteId) {
        return null;
      }
      const updated: GameEditorInvitation = { ...existing, status: 'cancelled', respondedAt: at };
      tx.set(ref, updated);
      tx.set(this.auditRef(), newMembershipAudit(slug, 'invite_cancelled', senderUid, recipientUid, at));
      return updated;
    });
  }

  async rejectEditorInvitation(
    slug: string,
    recipientUid: string,
    at: string,
    inviteId: string,
  ): Promise<GameEditorInvitation | null> {
    const ref = this.doc(slug, recipientUid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? (snap.data() as GameEditorInvitation) : null;
      if (
        !isPendingEditorInvite(existing, at) ||
        existing.recipientUid !== recipientUid ||
        existing.inviteId !== inviteId
      ) {
        return null;
      }
      const updated: GameEditorInvitation = { ...existing, status: 'rejected', respondedAt: at };
      tx.set(ref, updated);
      tx.set(this.auditRef(), newMembershipAudit(slug, 'invite_rejected', recipientUid, recipientUid, at));
      return updated;
    });
  }

  private static readonly PAGE_SIZE = 200;

  private async listPending(
    field: 'recipientUid' | 'slug',
    value: string,
    at: string,
  ): Promise<GameEditorInvitation[]> {
    const base = this.db.collection('gameEditorInvites').where(field, '==', value).where('status', '==', 'pending');
    const active: GameEditorInvitation[] = [];
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      const page = cursor
        ? base.startAfter(cursor).limit(FirestoreGameEditorInviteStore.PAGE_SIZE)
        : base.limit(FirestoreGameEditorInviteStore.PAGE_SIZE);
      const snap = await page.get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        const invite = doc.data() as GameEditorInvitation;
        if (isPendingEditorInvite(invite, at)) active.push(invite);
      }
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.size < FirestoreGameEditorInviteStore.PAGE_SIZE) break;
    }
    return active;
  }

  async listPendingEditorInvitesForRecipient(uid: string, at: string): Promise<GameEditorInvitation[]> {
    return this.listPending('recipientUid', uid, at);
  }

  async listPendingEditorInvitesForSlug(slug: string, at: string): Promise<GameEditorInvitation[]> {
    return this.listPending('slug', slug, at);
  }

  async cancelPendingEditorInvitesForSlug(slug: string, at: string): Promise<void> {
    const pending = await this.listPendingEditorInvitesForSlug(slug, at);
    await Promise.all(
      pending.map((invite) =>
        this.cancelEditorInvitation(invite.slug, invite.senderUid, invite.recipientUid, at, invite.inviteId),
      ),
    );
  }

  async cancelPendingEditorInvitesForUid(uid: string, at: string): Promise<void> {
    const incoming = await this.listPendingEditorInvitesForRecipient(uid, at);
    const outgoingSnap = await this.db
      .collection('gameEditorInvites')
      .where('senderUid', '==', uid)
      .where('status', '==', 'pending')
      .get();
    const outgoing = outgoingSnap.docs
      .map((doc) => doc.data() as GameEditorInvitation)
      .filter((row) => isPendingEditorInvite(row, at));
    await Promise.all([
      ...incoming.map((invite) => this.rejectEditorInvitation(invite.slug, uid, at, invite.inviteId)),
      ...outgoing.map((invite) =>
        this.cancelEditorInvitation(invite.slug, uid, invite.recipientUid, at, invite.inviteId),
      ),
    ]);
  }
}
