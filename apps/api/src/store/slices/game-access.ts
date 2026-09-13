import type { Firestore } from '@google-cloud/firestore';
import { newGameAccess, settlementWins, type GameAccessRecord } from '../records/game-access.js';

// Read plus one conditional create.
export interface GameAccessStore {
  getGameAccess(slug: string): Promise<GameAccessRecord | null>;

  // Returns the record in force; rerun cannot restore an older owner.
  ensureGameAccess(slug: string, ownerUid: string, at: string): Promise<GameAccessRecord>;

  // Settlement: corrects a record only while nothing but settlement has written it.

  // A transferred, shared, or newer job's record is left alone.
  recordSettledOwner(slug: string, ownerUid: string, jobId: number, at: string): Promise<GameAccessRecord>;

  // Backfill: records an owner only while that account still exists.

  // Null when the account is gone: the caller quarantines rather than guessing.
  backfillGameAccess(
    slug: string,
    ownerUid: string,
    checkAccount: boolean,
    at: string,
  ): Promise<GameAccessRecord | null>;

  // The shelf query collaboration needs.
  listGameAccessByMember(uid: string): Promise<GameAccessRecord[]>;
}

// Written by slug settlement and nothing else: no transfer, no membership change.
const isPristine = (record: GameAccessRecord): boolean => record.accessRevision === 1 && record.editorUids.length === 0;

const clone = (record: GameAccessRecord): GameAccessRecord => ({
  ...record,
  editorUids: [...record.editorUids],
  memberUids: [...record.memberUids],
});

export class InMemoryGameAccessStore implements GameAccessStore {
  constructor(private accountExists: (uid: string) => boolean = () => true) {}

  // Not private -- deleteAccountIdentity reaches across these, as it does for agent keys.
  access = new Map<string, GameAccessRecord>();

  async getGameAccess(slug: string): Promise<GameAccessRecord | null> {
    const record = this.access.get(slug);
    return record ? clone(record) : null;
  }

  async ensureGameAccess(slug: string, ownerUid: string, at: string): Promise<GameAccessRecord> {
    const existing = this.access.get(slug);
    if (existing) return clone(existing);
    const record = newGameAccess(slug, ownerUid, at);
    this.access.set(slug, record);
    return clone(record);
  }

  async recordSettledOwner(slug: string, ownerUid: string, jobId: number, at: string): Promise<GameAccessRecord> {
    const existing = this.access.get(slug);
    if (existing && (!isPristine(existing) || !settlementWins(existing, jobId))) return clone(existing);
    if (existing?.ownerUid === ownerUid && existing.settledJobId === jobId) return clone(existing);
    const record = newGameAccess(slug, ownerUid, at, jobId);
    this.access.set(slug, record);
    return clone(record);
  }

  async backfillGameAccess(
    slug: string,
    ownerUid: string,
    checkAccount: boolean,
    at: string,
  ): Promise<GameAccessRecord | null> {
    const existing = this.access.get(slug);
    if (existing) return clone(existing);
    if (checkAccount && !this.accountExists(ownerUid)) return null;
    const record = newGameAccess(slug, ownerUid, at);
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

  async getGameAccess(slug: string): Promise<GameAccessRecord | null> {
    const snap = await this.doc(slug).get();
    return snap.exists ? (snap.data() as GameAccessRecord) : null;
  }

  async ensureGameAccess(slug: string, ownerUid: string, at: string): Promise<GameAccessRecord> {
    const ref = this.doc(slug);

    // Transaction, not create-and-catch: creation races the backfill.
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return snap.data() as GameAccessRecord;
      const record = newGameAccess(slug, ownerUid, at);
      tx.create(ref, record);
      return record;
    });
  }

  async recordSettledOwner(slug: string, ownerUid: string, jobId: number, at: string): Promise<GameAccessRecord> {
    const ref = this.doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? (snap.data() as GameAccessRecord) : null;
      if (existing && (!isPristine(existing) || !settlementWins(existing, jobId))) return existing;
      if (existing?.ownerUid === ownerUid && existing.settledJobId === jobId) return existing;
      const record = newGameAccess(slug, ownerUid, at, jobId);
      if (existing) tx.set(ref, record);
      else tx.create(ref, record);
      return record;
    });
  }

  async backfillGameAccess(
    slug: string,
    ownerUid: string,
    checkAccount: boolean,
    at: string,
  ): Promise<GameAccessRecord | null> {
    const ref = this.doc(slug);

    // The account read joins this transaction; erasure cannot slip between.
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return snap.data() as GameAccessRecord;
      if (checkAccount && !(await tx.get(this.db.collection('users').doc(ownerUid))).exists) return null;
      const record = newGameAccess(slug, ownerUid, at);
      tx.create(ref, record);
      return record;
    });
  }

  async listGameAccessByMember(uid: string): Promise<GameAccessRecord[]> {
    const snap = await this.db.collection('gameAccess').where('memberUids', 'array-contains', uid).get();
    return snap.docs.map((doc) => doc.data() as GameAccessRecord);
  }
}
