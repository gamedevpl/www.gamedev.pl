import type { Firestore } from '@google-cloud/firestore';
import type { PublicationHealthCheck, PublicationRecord } from '../../games-store.js';

export interface PublicationStore {
  // Currently published for a slug, or null when nothing ever was.
  getPublication(slug: string): Promise<PublicationRecord | null>;

  // Publishes (or re-publishes) a slug at a specific stored version.
  setPublication(record: PublicationRecord): Promise<void>;

  // Withdraws a game, recording why and when (the DSA statement source).
  takedownPublication(slug: string, reason: string, at: string): Promise<boolean>;

  archivePublication(slug: string, reason: string, at: string): Promise<boolean>;

  // Records the health re-gate; false when the slug has no publication.
  setPublicationHealthCheck(slug: string, check: PublicationHealthCheck): Promise<boolean>;

  // Every slug currently live -- the input the snapshot bake reads.
  listPublications(): Promise<PublicationRecord[]>;
}

export class InMemoryPublicationStore implements PublicationStore {
  private publications = new Map<string, PublicationRecord>();

  async getPublication(slug: string): Promise<PublicationRecord | null> {
    const record = this.publications.get(slug);
    return record ? { ...record } : null;
  }

  async setPublication(record: PublicationRecord): Promise<void> {
    this.publications.set(record.slug, { ...record });
  }

  async setPublicationHealthCheck(slug: string, check: PublicationHealthCheck): Promise<boolean> {
    const record = this.publications.get(slug);
    if (!record) return false;
    this.publications.set(slug, { ...record, healthCheck: { ...check } });
    return true;
  }

  async takedownPublication(slug: string, reason: string, at: string): Promise<boolean> {
    const record = this.publications.get(slug);
    if (!record) return false;
    this.publications.set(slug, { ...record, state: 'disabled', takedownAt: at, takedownReason: reason });
    return true;
  }

  async archivePublication(slug: string, reason: string, at: string): Promise<boolean> {
    const record = this.publications.get(slug);
    if (!record) return false;
    this.publications.set(slug, { ...record, state: 'archived', takedownAt: at, takedownReason: reason });
    return true;
  }

  async listPublications(): Promise<PublicationRecord[]> {
    return Array.from(this.publications.values()).map((record) => ({ ...record }));
  }
}

export class FirestorePublicationStore implements PublicationStore {
  constructor(private db: Firestore) {}

  async getPublication(slug: string): Promise<PublicationRecord | null> {
    const snap = await this.db.collection('games').doc(slug).get();
    const publication = (snap.data() as { publication?: PublicationRecord } | undefined)?.publication;
    return publication ?? null;
  }

  async setPublication(record: PublicationRecord): Promise<void> {
    // Merged onto the game doc -- votes/feedback/scorecards already live there too.
    await this.db.collection('games').doc(record.slug).set({ publication: record }, { merge: true });
  }

  async setPublicationHealthCheck(slug: string, check: PublicationHealthCheck): Promise<boolean> {
    const ref = this.db.collection('games').doc(slug);
    // Transactional -- a stale read could resurrect an overwritten check.
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = (snap.data() as { publication?: PublicationRecord } | undefined)?.publication;
      if (!current) return false;
      tx.set(ref, { publication: { ...current, healthCheck: check } }, { merge: true });
      return true;
    });
  }

  async takedownPublication(slug: string, reason: string, at: string): Promise<boolean> {
    const ref = this.db.collection('games').doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = (snap.data() as { publication?: PublicationRecord } | undefined)?.publication;
      if (!current) return false;
      tx.set(
        ref,
        { publication: { ...current, state: 'disabled', takedownAt: at, takedownReason: reason } },
        { merge: true },
      );
      return true;
    });
  }

  async archivePublication(slug: string, reason: string, at: string): Promise<boolean> {
    const ref = this.db.collection('games').doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = (snap.data() as { publication?: PublicationRecord } | undefined)?.publication;
      if (!current) return false;
      tx.set(
        ref,
        { publication: { ...current, state: 'archived', takedownAt: at, takedownReason: reason } },
        { merge: true },
      );
      return true;
    });
  }

  async listPublications(): Promise<PublicationRecord[]> {
    const snap = await this.db.collection('games').get();
    return snap.docs
      .map((doc) => (doc.data() as { publication?: PublicationRecord }).publication)
      .filter((publication): publication is PublicationRecord => Boolean(publication));
  }
}
