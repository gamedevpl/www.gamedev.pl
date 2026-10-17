import type { Firestore } from '@google-cloud/firestore';

// One vendor memory store per game, shared by its managed rounds.
export interface GameMemoryRecord {
  slug: string;
  vendor: string;
  storeId: string;
  createdAt: string;
}

export interface GameMemoryStore {
  getGameMemory(slug: string, vendor: string): Promise<GameMemoryRecord | null>;
  // First writer wins; returns the record that holds the slot.
  claimGameMemory(record: GameMemoryRecord): Promise<GameMemoryRecord>;
}

const key = (slug: string, vendor: string) => `${vendor}:${slug}`;

export class InMemoryGameMemoryStore implements GameMemoryStore {
  private records = new Map<string, GameMemoryRecord>();

  async getGameMemory(slug: string, vendor: string): Promise<GameMemoryRecord | null> {
    const record = this.records.get(key(slug, vendor));
    return record ? { ...record } : null;
  }

  async claimGameMemory(record: GameMemoryRecord): Promise<GameMemoryRecord> {
    const existing = this.records.get(key(record.slug, record.vendor));
    if (existing) return { ...existing };
    this.records.set(key(record.slug, record.vendor), { ...record });
    return { ...record };
  }
}

export class FirestoreGameMemoryStore implements GameMemoryStore {
  constructor(private db: Firestore) {}

  private doc(slug: string, vendor: string) {
    return this.db.collection('gameMemoryStores').doc(key(slug, vendor));
  }

  async getGameMemory(slug: string, vendor: string): Promise<GameMemoryRecord | null> {
    const snap = await this.doc(slug, vendor).get();
    return snap.exists ? (snap.data() as GameMemoryRecord) : null;
  }

  async claimGameMemory(record: GameMemoryRecord): Promise<GameMemoryRecord> {
    const ref = this.doc(record.slug, record.vendor);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return snap.data() as GameMemoryRecord;
      tx.create(ref, record);
      return record;
    });
  }
}
