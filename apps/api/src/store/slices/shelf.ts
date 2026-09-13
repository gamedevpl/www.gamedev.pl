import type { Firestore } from '@google-cloud/firestore';
import type { ShelfDocument } from '../records/shelf.js';

export interface ShelfDocumentStore {
  getShelf(ownerUid: string): Promise<ShelfDocument | null>;
  putShelf(ownerUid: string, shelf: ShelfDocument): Promise<void>;
  deleteShelf(ownerUid: string): Promise<void>;

  // How many rounds the owner has, for the one-read agreement check.
  countSubmissionsByOwner(ownerUid: string): Promise<number>;

  // Owners whose shelf is older than the cutoff, oldest first.
  listStaleShelfOwners(builtBefore: string, limit: number): Promise<string[]>;

}

// The Store adds the rebuild; the document store cannot.
export interface ShelfStoreSlice extends ShelfDocumentStore {
  rebuildShelf(ownerUid: string): Promise<void>;
}

export class InMemoryShelfStore implements ShelfDocumentStore {
  constructor(
    private shelves: Map<string, ShelfDocument>,
    private countFor: (ownerUid: string) => number,
  ) {}

  async getShelf(ownerUid: string): Promise<ShelfDocument | null> {
    const shelf = this.shelves.get(ownerUid);
    return shelf ? structuredClone(shelf) : null;
  }

  async putShelf(ownerUid: string, shelf: ShelfDocument): Promise<void> {
    this.shelves.set(ownerUid, structuredClone(shelf));
  }

  async deleteShelf(ownerUid: string): Promise<void> {
    this.shelves.delete(ownerUid);
  }

  async countSubmissionsByOwner(ownerUid: string): Promise<number> {
    return this.countFor(ownerUid);
  }

  async listStaleShelfOwners(builtBefore: string, limit: number): Promise<string[]> {
    return [...this.shelves.entries()]
      .filter(([, shelf]) => shelf.builtAt < builtBefore)
      .sort((a, b) => a[1].builtAt.localeCompare(b[1].builtAt))
      .slice(0, limit)
      .map(([ownerUid]) => ownerUid);
  }
}

export class FirestoreShelfStore implements ShelfDocumentStore {
  constructor(private db: Firestore) {}

  private ref(ownerUid: string) {
    return this.db.collection('shelves').doc(ownerUid);
  }

  async getShelf(ownerUid: string): Promise<ShelfDocument | null> {
    const snap = await this.ref(ownerUid).get();
    return snap.exists ? (snap.data() as ShelfDocument) : null;
  }

  async putShelf(ownerUid: string, shelf: ShelfDocument): Promise<void> {
    // Replaced whole: a merge would keep stale rounds.
    await this.ref(ownerUid).set(shelf);
  }

  async deleteShelf(ownerUid: string): Promise<void> {
    await this.ref(ownerUid).delete();
  }

  async countSubmissionsByOwner(ownerUid: string): Promise<number> {
    const snap = await this.db.collection('submissions').where('ownerUid', '==', ownerUid).count().get();
    return snap.data().count;
  }

  async listStaleShelfOwners(builtBefore: string, limit: number): Promise<string[]> {
    // Single-field inequality with its own orderBy; Firestore indexes this unaided.
    const snap = await this.db
      .collection('shelves')
      .where('builtAt', '<', builtBefore)
      .orderBy('builtAt', 'asc')
      .limit(limit)
      .get();
    return snap.docs.map((doc) => doc.id);
  }
}
