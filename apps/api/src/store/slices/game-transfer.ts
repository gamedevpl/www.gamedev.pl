import type { Firestore } from '@google-cloud/firestore';
import {
  effectiveStatus,
  isPending,
  newTransferInvitation,
  type GameTransferInvitation,
} from '../records/game-transfer.js';

export interface GameTransferStore {
  // Status is materialized against `at`; a stale pending row reads as expired.
  getActiveGameTransfer(slug: string, at: string): Promise<GameTransferInvitation | null>;

  // 'busy': already pending. 'ineligible': a party's erasure has begun.
  createGameTransferInvitation(
    slug: string,
    senderUid: string,
    recipientUid: string,
    accessRevision: number,
    at: string,
  ): Promise<GameTransferInvitation | 'busy' | 'ineligible'>;

  // Null when nothing pending, or the caller did not send it.
  cancelGameTransferInvitation(slug: string, senderUid: string, at: string): Promise<GameTransferInvitation | null>;

  // Null when nothing pending, or the caller is not its recipient.
  rejectGameTransferInvitation(slug: string, recipientUid: string, at: string): Promise<GameTransferInvitation | null>;

  // Every invitation still pending for uid as recipient.
  listPendingGameTransfersForRecipient(uid: string, at: string): Promise<GameTransferInvitation[]>;
}

const clone = (invite: GameTransferInvitation): GameTransferInvitation => ({ ...invite });

export class InMemoryGameTransferStore implements GameTransferStore {
  // Not private -- deleteAccountIdentity reaches across this on erasure.
  transfers = new Map<string, GameTransferInvitation>();

  constructor(private isErased: (uid: string) => boolean = () => false) {}

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
  ): Promise<GameTransferInvitation | 'busy' | 'ineligible'> {
    if (this.isErased(senderUid) || this.isErased(recipientUid)) return 'ineligible';
    if (isPending(this.transfers.get(slug) ?? null, at)) return 'busy';
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
  ): Promise<GameTransferInvitation | 'busy' | 'ineligible'> {
    const ref = this.doc(slug);
    return this.db.runTransaction(async (tx) => {
      const [snap, senderFence, recipientFence] = await Promise.all([
        tx.get(ref),
        tx.get(this.erasureFence(senderUid)),
        tx.get(this.erasureFence(recipientUid)),
      ]);
      if (senderFence.exists || recipientFence.exists) return 'ineligible';
      const existing = snap.exists ? (snap.data() as GameTransferInvitation) : null;
      if (isPending(existing, at)) return 'busy';
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
  private static readonly PAGE_SIZE = 200;
  private static readonly SCAN_CAP = 2_000;

  async listPendingGameTransfersForRecipient(uid: string, at: string): Promise<GameTransferInvitation[]> {
    const base = this.db.collection('gameTransfers').where('recipientUid', '==', uid).where('status', '==', 'pending');

    const active: GameTransferInvitation[] = [];
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    let scanned = 0;
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
      scanned += snap.size;
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.size < FirestoreGameTransferStore.PAGE_SIZE || scanned >= FirestoreGameTransferStore.SCAN_CAP) break;
    }
    return active;
  }
}
