import type { GuardedFirestore } from '../shelf-guard-firestore.js';
import { erasedInTransaction } from './erasure-fence.js';
import type { StoredPlayJournal } from '../../platform/play-journal.js';
export interface PlayJournalsStore {
  putPlayJournal(record: StoredPlayJournal): Promise<void>;
  getPlayJournal(jobId: number, id: string): Promise<StoredPlayJournal | null>;
  deletePlayJournalsByOwner(uid: string): Promise<void>;
}
const key = (jobId: number, id: string) => `${jobId}:${id}`;
export class InMemoryPlayJournalsStore implements PlayJournalsStore {
  constructor(private erased: (uid: string) => boolean = () => false) {}
  private records = new Map<string, StoredPlayJournal>();
  async putPlayJournal(record: StoredPlayJournal) {
    if (this.erased(record.uid)) throw Error('account erased');
    if (this.records.has(key(record.jobId, record.id))) throw Error('journal already exists');
    this.records.set(key(record.jobId, record.id), structuredClone(record));
  }
  async getPlayJournal(jobId: number, id: string) {
    const record = this.records.get(key(jobId, id));
    return record && record.expiresAt.getTime() > Date.now() ? structuredClone(record) : null;
  }
  async deletePlayJournalsByOwner(uid: string) {
    for (const [id, record] of this.records) if (record.uid === uid) this.records.delete(id);
  }
}
export class FirestorePlayJournalsStore implements PlayJournalsStore {
  constructor(private db: GuardedFirestore) {}
  async putPlayJournal(record: StoredPlayJournal) {
    await this.db.runTransaction(async (tx) => {
      if (await erasedInTransaction(this.db, tx, record.uid)) throw Error('account erased');
      tx.create(this.db.collection('playJournals').doc(key(record.jobId, record.id)), record);
    });
  }
  async getPlayJournal(jobId: number, id: string) {
    const snapshot = await this.db.collection('playJournals').doc(key(jobId, id)).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data()!;
    const expiresAt = typeof data.expiresAt?.toDate === 'function' ? data.expiresAt.toDate() : new Date(data.expiresAt);
    return expiresAt.getTime() > Date.now() ? ({ ...data, expiresAt } as StoredPlayJournal) : null;
  }
  async deletePlayJournalsByOwner(uid: string) {
    for (;;) {
      const page = await this.db.collection('playJournals').where('uid', '==', uid).limit(100).get();
      if (page.empty) return;
      const batch = this.db.batch();
      for (const doc of page.docs) batch.delete(doc.ref);
      await batch.commit();
    }
  }
}
