import type { Firestore } from '@google-cloud/firestore';
import {
  fencedOut,
  newGameAccess,
  settledOver,
  settlementWins,
  withMemberErased,
  type GameAccessRecord,
} from '../records/game-access.js';
import { DELETED_ACCOUNT_UID } from '../records/identity.js';

// Read plus conditional creates, each fenced against account erasure.
export interface GameAccessStore {
  getGameAccess(slug: string): Promise<GameAccessRecord | null>;

  // workAt is when the work began: pre-erasure work stays refused forever.
  ensureGameAccess(slug: string, ownerUid: string, workAt: string, at: string): Promise<GameAccessRecord | null>;

  // Settlement: corrects a record only while nothing but settlement has written it.

  // A transferred, shared, or newer job's record is left alone.
  recordSettledOwner(
    slug: string,
    ownerUid: string,
    jobId: number,
    workAt: string,
    at: string,
  ): Promise<GameAccessRecord | null>;

  // Backfill: records an owner only while that account still exists.

  // Null when the account is gone: the caller quarantines rather than guessing.
  backfillGameAccess(
    slug: string,
    ownerUid: string,
    jobId: number,
    workAt: string,
    checkAccount: boolean,
    at: string,
  ): Promise<GameAccessRecord | null>;

  // What a dry run reads to match the write's verdict.
  getAccountErasure(uid: string): Promise<string | null>;

  accountExists(uid: string): Promise<boolean>;

  // The shelf query collaboration needs.
  listGameAccessByMember(uid: string): Promise<GameAccessRecord[]>;

  // Erasure's first act: no writer may name the uid after it.
  beginAccountErasure(uid: string, at: string): Promise<void>;

  // Erasure's scrub, run after the fence.
  eraseMemberFromAllGameAccess(uid: string, at: string): Promise<string[]>;
}

// Written by slug settlement and nothing else: no transfer, no membership change.
const isPristine = (record: GameAccessRecord): boolean => record.accessRevision === 1 && record.editorUids.length === 0;

const clone = (record: GameAccessRecord): GameAccessRecord => ({
  ...record,
  editorUids: [...record.editorUids],
  memberUids: [...record.memberUids],
});

export class InMemoryGameAccessStore implements GameAccessStore {
  constructor(private hasAccount: (uid: string) => boolean = () => true) {}

  // Not private -- deleteAccountIdentity reaches across these, as it does for agent keys.
  access = new Map<string, GameAccessRecord>();

  // Not private -- InMemoryGameTransferStore fences new invitations against this.
  erasedAt = new Map<string, string>();

  async beginAccountErasure(uid: string, at: string): Promise<void> {
    this.erasedAt.set(uid, at);
  }

  async getAccountErasure(uid: string): Promise<string | null> {
    return this.erasedAt.get(uid) ?? null;
  }

  async accountExists(uid: string): Promise<boolean> {
    return this.hasAccount(uid);
  }

  async eraseMemberFromAllGameAccess(uid: string, at: string): Promise<string[]> {
    const touched: string[] = [];
    for (const [slug, record] of [...this.access]) {
      const erased = withMemberErased(record, uid, DELETED_ACCOUNT_UID, at);
      if (!erased) continue;
      this.access.set(slug, erased);
      touched.push(slug);
    }
    return touched;
  }

  async getGameAccess(slug: string): Promise<GameAccessRecord | null> {
    const record = this.access.get(slug);
    return record ? clone(record) : null;
  }

  async ensureGameAccess(slug: string, ownerUid: string, workAt: string, at: string): Promise<GameAccessRecord | null> {
    const existing = this.access.get(slug);
    if (existing) return clone(existing);
    if (fencedOut(this.erasedAt.get(ownerUid) ?? null, workAt)) return null;
    const record = newGameAccess(slug, ownerUid, at);
    this.access.set(slug, record);
    return clone(record);
  }

  async recordSettledOwner(
    slug: string,
    ownerUid: string,
    jobId: number,
    workAt: string,
    at: string,
  ): Promise<GameAccessRecord | null> {
    const existing = this.access.get(slug);
    if (existing && (!isPristine(existing) || !settlementWins(existing, jobId))) return clone(existing);
    if (existing?.ownerUid === ownerUid && existing.settledJobId === jobId) return clone(existing);
    if (fencedOut(this.erasedAt.get(ownerUid) ?? null, workAt)) return existing ? clone(existing) : null;
    const record = settledOver(existing ?? null, slug, ownerUid, at, jobId);
    this.access.set(slug, record);
    return clone(record);
  }

  async backfillGameAccess(
    slug: string,
    ownerUid: string,
    jobId: number,
    workAt: string,
    checkAccount: boolean,
    at: string,
  ): Promise<GameAccessRecord | null> {
    const existing = this.access.get(slug);
    if (existing) return clone(existing);
    if (fencedOut(this.erasedAt.get(ownerUid) ?? null, workAt)) return null;
    if (checkAccount && !this.hasAccount(ownerUid)) return null;

    // Settled by its own job: a migrated record is not tentative.
    const record = newGameAccess(slug, ownerUid, at, jobId);
    this.access.set(slug, record);
    return clone(record);
  }

  async listGameAccessByMember(uid: string): Promise<GameAccessRecord[]> {
    return [...this.access.values()].filter((record) => record.memberUids.includes(uid)).map(clone);
  }
}

export class FirestoreGameAccessStore implements GameAccessStore {
  constructor(private db: Firestore) {}

  private doc(slug: string) {
    return this.db.collection('gameAccess').doc(slug);
  }

  private erasureFence(uid: string) {
    return this.db.collection('erasedAccounts').doc(uid);
  }

  private async fenceAt(tx: FirebaseFirestore.Transaction, uid: string): Promise<string | null> {
    const snap = await tx.get(this.erasureFence(uid));
    return snap.exists ? ((snap.data() as { at?: string }).at ?? null) : null;
  }

  async beginAccountErasure(uid: string, at: string): Promise<void> {
    await this.erasureFence(uid).set({ uid, at });
  }

  async getAccountErasure(uid: string): Promise<string | null> {
    const snap = await this.erasureFence(uid).get();
    return snap.exists ? ((snap.data() as { at?: string }).at ?? null) : null;
  }

  async accountExists(uid: string): Promise<boolean> {
    return (await this.db.collection('users').doc(uid).get()).exists;
  }

  async eraseMemberFromAllGameAccess(uid: string, at: string): Promise<string[]> {
    const snap = await this.db.collection('gameAccess').where('memberUids', 'array-contains', uid).get();
    const touched: string[] = [];

    // Per record: the snapshot may be stale, and batches cap at 500.
    for (const doc of snap.docs) {
      const slug = await this.db.runTransaction(async (tx) => {
        const current = await tx.get(doc.ref);
        if (!current.exists) return null;
        const erased = withMemberErased(current.data() as GameAccessRecord, uid, DELETED_ACCOUNT_UID, at);
        if (!erased) return null;
        tx.set(doc.ref, erased);
        return erased.slug;
      });
      if (slug) touched.push(slug);
    }
    return touched;
  }

  async getGameAccess(slug: string): Promise<GameAccessRecord | null> {
    const snap = await this.doc(slug).get();
    return snap.exists ? (snap.data() as GameAccessRecord) : null;
  }

  async ensureGameAccess(slug: string, ownerUid: string, workAt: string, at: string): Promise<GameAccessRecord | null> {
    const ref = this.doc(slug);

    // Transaction, not create-and-catch: creation races the backfill.
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return snap.data() as GameAccessRecord;

      // Reading the fence here is what orders this write against erasure.
      if (fencedOut(await this.fenceAt(tx, ownerUid), workAt)) return null;
      const record = newGameAccess(slug, ownerUid, at);
      tx.create(ref, record);
      return record;
    });
  }

  async recordSettledOwner(
    slug: string,
    ownerUid: string,
    jobId: number,
    workAt: string,
    at: string,
  ): Promise<GameAccessRecord | null> {
    const ref = this.doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? (snap.data() as GameAccessRecord) : null;
      if (existing && (!isPristine(existing) || !settlementWins(existing, jobId))) return existing;
      if (existing?.ownerUid === ownerUid && existing.settledJobId === jobId) return existing;
      if (fencedOut(await this.fenceAt(tx, ownerUid), workAt)) return existing;
      const record = settledOver(existing, slug, ownerUid, at, jobId);
      if (existing) tx.set(ref, record);
      else tx.create(ref, record);
      return record;
    });
  }

  async backfillGameAccess(
    slug: string,
    ownerUid: string,
    jobId: number,
    workAt: string,
    checkAccount: boolean,
    at: string,
  ): Promise<GameAccessRecord | null> {
    const ref = this.doc(slug);

    // The account read joins this transaction; erasure cannot slip between.
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return snap.data() as GameAccessRecord;
      if (fencedOut(await this.fenceAt(tx, ownerUid), workAt)) return null;
      if (checkAccount && !(await tx.get(this.db.collection('users').doc(ownerUid))).exists) return null;

      // Settled by its own job: a migrated record is not tentative.
      const record = newGameAccess(slug, ownerUid, at, jobId);
      tx.create(ref, record);
      return record;
    });
  }

  async listGameAccessByMember(uid: string): Promise<GameAccessRecord[]> {
    const snap = await this.db.collection('gameAccess').where('memberUids', 'array-contains', uid).get();
    return snap.docs.map((doc) => doc.data() as GameAccessRecord);
  }
}
