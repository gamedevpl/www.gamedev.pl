import type { Firestore } from '@google-cloud/firestore';
import type { GameAccessRecord } from '../records/game-access.js';
import {
  effectiveStatus,
  isPending,
  newTransferInvitation,
  type GameTransferInvitation,
} from '../records/game-transfer.js';

export interface GameTransferStore {
  // Status is materialized against `at`; a stale pending row reads as expired.
  getActiveGameTransfer(slug: string, at: string): Promise<GameTransferInvitation | null>;

  // 'busy'/'ineligible'/'stale_owner': pending, an erased party, a stale owner.
  createGameTransferInvitation(
    slug: string,
    senderUid: string,
    recipientUid: string,
    accessRevision: number,
    at: string,
  ): Promise<GameTransferInvitation | 'busy' | 'ineligible' | 'stale_owner'>;

  // Null when nothing pending, or the caller did not send it.
  cancelGameTransferInvitation(slug: string, senderUid: string, at: string): Promise<GameTransferInvitation | null>;

  // Null when nothing pending, or the caller is not its recipient.
  rejectGameTransferInvitation(slug: string, recipientUid: string, at: string): Promise<GameTransferInvitation | null>;

  // Every invitation still pending for uid as recipient.
  listPendingGameTransfersForRecipient(uid: string, at: string): Promise<GameTransferInvitation[]>;
}

const clone = (invite: GameTransferInvitation): GameTransferInvitation => ({ ...invite });

// No record: only revision 0 (derived ownership) counts as current.
function ownerMatches(access: GameAccessRecord | null, uid: string, revision: number): boolean {
  if (access) return access.ownerUid === uid && access.accessRevision === revision;
  return revision === 0;
}

export class InMemoryGameTransferStore implements GameTransferStore {
  // Not private -- deleteAccountIdentity reaches across this on erasure.
  transfers = new Map<string, GameTransferInvitation>();

  constructor(
    private isErased: (uid: string) => boolean = () => false,
    private getGameAccess: (slug: string) => GameAccessRecord | null = () => null,
  ) {}

  async getActiveGameTransfer(slug: string, at: string): Promise<GameTransferInvitation | null> {
    const existing = this.transfers.get(slug);
    if (!existing) return null;
    return { ...clone(existing), status: effectiveStatus(existing, at) };
  }

  async createGameTransferInvitation(
    slug: string,
    senderUid: string,
    recipientUid: string,
    accessRevision: number,
    at: string,
  ): Promise<GameTransferInvitation | 'busy' | 'ineligible' | 'stale_owner'> {
    if (this.isErased(senderUid) || this.isErased(recipientUid)) return 'ineligible';
    const access = this.getGameAccess(slug);
    if (!ownerMatches(access, senderUid, accessRevision)) return 'stale_owner';

    // A pending row from a superseded owner does not block this one.
    const existing = this.transfers.get(slug) ?? null;
    const existingCurrent = existing !== null && ownerMatches(access, existing.senderUid, existing.accessRevision);
    if (existingCurrent && isPending(existing, at)) return 'busy';

    const invite = newTransferInvitation(slug, senderUid, recipientUid, accessRevision, at);
    this.transfers.set(slug, invite);
    return clone(invite);
  }

  async cancelGameTransferInvitation(
    slug: string,
    senderUid: string,
    at: string,
  ): Promise<GameTransferInvitation | null> {
    const existing = this.transfers.get(slug) ?? null;
    if (!isPending(existing, at) || existing.senderUid !== senderUid) return null;
    const updated: GameTransferInvitation = { ...existing, status: 'cancelled', respondedAt: at };
    this.transfers.set(slug, updated);
    return clone(updated);
  }

  async rejectGameTransferInvitation(
    slug: string,
    recipientUid: string,
    at: string,
  ): Promise<GameTransferInvitation | null> {
    const existing = this.transfers.get(slug) ?? null;
    if (!isPending(existing, at) || existing.recipientUid !== recipientUid) return null;
    const updated: GameTransferInvitation = { ...existing, status: 'rejected', respondedAt: at };
    this.transfers.set(slug, updated);
    return clone(updated);
  }

  async listPendingGameTransfersForRecipient(uid: string, at: string): Promise<GameTransferInvitation[]> {
    return [...this.transfers.values()].filter((t) => t.recipientUid === uid && isPending(t, at)).map(clone);
  }
}

export class FirestoreGameTransferStore implements GameTransferStore {
  constructor(private db: Firestore) {}

  private doc(slug: string) {
    return this.db.collection('gameTransfers').doc(slug);
  }

  // Same fence collection gameAccessStore writes on erasure.
  private erasureFence(uid: string) {
    return this.db.collection('erasedAccounts').doc(uid);
  }

  async getActiveGameTransfer(slug: string, at: string): Promise<GameTransferInvitation | null> {
    const snap = await this.doc(slug).get();
    if (!snap.exists) return null;
    const record = snap.data() as GameTransferInvitation;
    return { ...record, status: effectiveStatus(record, at) };
  }

  async createGameTransferInvitation(
    slug: string,
    senderUid: string,
    recipientUid: string,
    accessRevision: number,
    at: string,
  ): Promise<GameTransferInvitation | 'busy' | 'ineligible' | 'stale_owner'> {
    const ref = this.doc(slug);
    const accessRef = this.db.collection('gameAccess').doc(slug);
    return this.db.runTransaction(async (tx) => {
      const [snap, senderFence, recipientFence, accessSnap] = await Promise.all([
        tx.get(ref),
        tx.get(this.erasureFence(senderUid)),
        tx.get(this.erasureFence(recipientUid)),
        tx.get(accessRef),
      ]);
      if (senderFence.exists || recipientFence.exists) return 'ineligible';

      const access = accessSnap.exists ? (accessSnap.data() as GameAccessRecord) : null;
      if (!ownerMatches(access, senderUid, accessRevision)) return 'stale_owner';

      // A pending row from a superseded owner does not block this one.
      const existing = snap.exists ? (snap.data() as GameTransferInvitation) : null;
      const existingCurrent = existing !== null && ownerMatches(access, existing.senderUid, existing.accessRevision);
      if (existingCurrent && isPending(existing, at)) return 'busy';

      const invite = newTransferInvitation(slug, senderUid, recipientUid, accessRevision, at);
      tx.set(ref, invite);
      return invite;
    });
  }

  async cancelGameTransferInvitation(
    slug: string,
    senderUid: string,
    at: string,
  ): Promise<GameTransferInvitation | null> {
    const ref = this.doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? (snap.data() as GameTransferInvitation) : null;
      if (!isPending(existing, at) || existing.senderUid !== senderUid) return null;
      const updated: GameTransferInvitation = { ...existing, status: 'cancelled', respondedAt: at };
      tx.set(ref, updated);
      return updated;
    });
  }

  async rejectGameTransferInvitation(
    slug: string,
    recipientUid: string,
    at: string,
  ): Promise<GameTransferInvitation | null> {
    const ref = this.doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? (snap.data() as GameTransferInvitation) : null;
      if (!isPending(existing, at) || existing.recipientUid !== recipientUid) return null;
      const updated: GameTransferInvitation = { ...existing, status: 'rejected', respondedAt: at };
      tx.set(ref, updated);
      return updated;
    });
  }

  // A plain `.limit()` can return only stale rows, hiding an active one.

  // Pages by document-snapshot cursor instead -- no composite index needed.

  // No cap: a partial scan can silently drop a real invitation.
  private static readonly PAGE_SIZE = 200;

  async listPendingGameTransfersForRecipient(uid: string, at: string): Promise<GameTransferInvitation[]> {
    const base = this.db.collection('gameTransfers').where('recipientUid', '==', uid).where('status', '==', 'pending');

    const active: GameTransferInvitation[] = [];
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      const page = cursor
        ? base.startAfter(cursor).limit(FirestoreGameTransferStore.PAGE_SIZE)
        : base.limit(FirestoreGameTransferStore.PAGE_SIZE);
      const snap = await page.get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        const invite = doc.data() as GameTransferInvitation;
        if (isPending(invite, at)) active.push(invite);
      }
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.size < FirestoreGameTransferStore.PAGE_SIZE) break;
    }
    return active;
  }
}
