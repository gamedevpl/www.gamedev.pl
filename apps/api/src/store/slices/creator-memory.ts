import type { Firestore } from '@google-cloud/firestore';

// One vendor memory store per creator, shared by their managed rounds.
export interface CreatorMemoryRecord {
  ownerUid: string;
  vendor: string;
  storeId: string;
  createdAt: string;
}

export interface CreatorMemoryStore {
  getCreatorMemory(ownerUid: string, vendor: string): Promise<CreatorMemoryRecord | null>;
  // First writer wins; returns the record that holds the slot.
  claimCreatorMemory(record: CreatorMemoryRecord): Promise<CreatorMemoryRecord>;
  // Every vendor's record for a creator, for account erasure.
  listCreatorMemory(ownerUid: string): Promise<CreatorMemoryRecord[]>;
  deleteCreatorMemory(ownerUid: string, vendor: string): Promise<void>;
}

const key = (ownerUid: string, vendor: string) => `${vendor}:${ownerUid}`;

export class InMemoryCreatorMemoryStore implements CreatorMemoryStore {
  private records = new Map<string, CreatorMemoryRecord>();

  async getCreatorMemory(ownerUid: string, vendor: string): Promise<CreatorMemoryRecord | null> {
    const record = this.records.get(key(ownerUid, vendor));
    return record ? { ...record } : null;
  }

  async claimCreatorMemory(record: CreatorMemoryRecord): Promise<CreatorMemoryRecord> {
    const existing = this.records.get(key(record.ownerUid, record.vendor));
    if (existing) return { ...existing };
    this.records.set(key(record.ownerUid, record.vendor), { ...record });
    return { ...record };
  }

  async listCreatorMemory(ownerUid: string): Promise<CreatorMemoryRecord[]> {
    return [...this.records.values()].filter((record) => record.ownerUid === ownerUid).map((record) => ({ ...record }));
  }

  async deleteCreatorMemory(ownerUid: string, vendor: string): Promise<void> {
    this.records.delete(key(ownerUid, vendor));
  }
}

export class FirestoreCreatorMemoryStore implements CreatorMemoryStore {
  constructor(private db: Firestore) {}

  private doc(ownerUid: string, vendor: string) {
    return this.db.collection('creatorMemoryStores').doc(key(ownerUid, vendor));
  }

  async getCreatorMemory(ownerUid: string, vendor: string): Promise<CreatorMemoryRecord | null> {
    const snap = await this.doc(ownerUid, vendor).get();
    return snap.exists ? (snap.data() as CreatorMemoryRecord) : null;
  }

  async claimCreatorMemory(record: CreatorMemoryRecord): Promise<CreatorMemoryRecord> {
    const ref = this.doc(record.ownerUid, record.vendor);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return snap.data() as CreatorMemoryRecord;
      tx.create(ref, record);
      return record;
    });
  }

  async listCreatorMemory(ownerUid: string): Promise<CreatorMemoryRecord[]> {
    // Single-field equality; indexed without configuration.
    const snap = await this.db.collection('creatorMemoryStores').where('ownerUid', '==', ownerUid).get();
    return snap.docs.map((doc) => doc.data() as CreatorMemoryRecord);
  }

  async deleteCreatorMemory(ownerUid: string, vendor: string): Promise<void> {
    await this.doc(ownerUid, vendor).delete();
  }
}
