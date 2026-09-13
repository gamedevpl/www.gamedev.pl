import type { Firestore } from '@google-cloud/firestore';
import { newGameAccess, type GameAccessRecord } from '../records/game-access.js';

// Read plus one conditional create.
export interface GameAccessStore {
  getGameAccess(slug: string): Promise<GameAccessRecord | null>;

  // Returns the record in force; rerun cannot restore an older owner.
  ensureGameAccess(slug: string, ownerUid: string, at: string): Promise<GameAccessRecord>;

  // The shelf query collaboration needs.
  listGameAccessByMember(uid: string): Promise<GameAccessRecord[]>;
}

const clone = (record: GameAccessRecord): GameAccessRecord => ({
  ...record,
  editorUids: [...record.editorUids],
  memberUids: [...record.memberUids],
});

export class InMemoryGameAccessStore implements GameAccessStore {
  private access = new Map<string, GameAccessRecord>();

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

  async listGameAccessByMember(uid: string): Promise<GameAccessRecord[]> {
    const snap = await this.db.collection('gameAccess').where('memberUids', 'array-contains', uid).get();
    return snap.docs.map((doc) => doc.data() as GameAccessRecord);
  }
}
