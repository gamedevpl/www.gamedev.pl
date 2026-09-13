import type { Firestore } from '@google-cloud/firestore';
import type { GameAgentKeyRecord } from '../records/agent-keys.js';

// Slug-keyed: who may open a round, plus the lock.

// Game authority, not an account credential -- see the GO-01 permission inventory.
export interface GameAdmissionStore {
  // BY-23 opener state; null when no key issued for this slug.
  getGameAgentKey(slug: string): Promise<GameAgentKeyRecord | null>;

  // Creates gen 1 if absent; null if slug belongs to someone else.
  ensureGameAgentKey(slug: string, ownerUid: string, at: string): Promise<GameAgentKeyRecord | null>;

  // Bumps keyGeneration for an owned slug; null if missing/not owned.
  rotateGameAgentKey(slug: string, ownerUid: string, at: string): Promise<GameAgentKeyRecord | null>;

  // BY-24: admits one in-flight open_round per slug; false if locked.
  beginAgentOpenRound(slug: string, at: string): Promise<boolean>;

  // BY-24: release the admission lock after open_round completes or aborts.
  finishAgentOpenRound(slug: string, at: string): Promise<void>;
}

export class InMemoryGameAdmissionStore implements GameAdmissionStore {
  // Not private -- deleteAccountIdentity reaches across these (documented exception, see PR).
  gameAgentKeys = new Map<string, GameAgentKeyRecord>();

  async getGameAgentKey(slug: string): Promise<GameAgentKeyRecord | null> {
    const record = this.gameAgentKeys.get(slug);
    return record ? { ...record } : null;
  }

  async ensureGameAgentKey(slug: string, ownerUid: string, at: string): Promise<GameAgentKeyRecord | null> {
    const existing = this.gameAgentKeys.get(slug);
    if (existing) {
      if (existing.ownerUid !== ownerUid) return null;
      return { ...existing };
    }
    const created: GameAgentKeyRecord = {
      slug,
      ownerUid,
      keyGeneration: 1,
      createdAt: at,
      updatedAt: at,
    };
    this.gameAgentKeys.set(slug, created);
    return { ...created };
  }

  async rotateGameAgentKey(slug: string, ownerUid: string, at: string): Promise<GameAgentKeyRecord | null> {
    const existing = this.gameAgentKeys.get(slug);
    if (!existing || existing.ownerUid !== ownerUid) return null;
    const next: GameAgentKeyRecord = {
      ...existing,
      keyGeneration: existing.keyGeneration + 1,
      updatedAt: at,
    };
    this.gameAgentKeys.set(slug, next);
    return { ...next };
  }

  async beginAgentOpenRound(slug: string, at: string): Promise<boolean> {
    const existing = this.gameAgentKeys.get(slug);
    if (!existing || existing.agentOpenRoundPending) return false;
    this.gameAgentKeys.set(slug, { ...existing, agentOpenRoundPending: true, updatedAt: at });
    return true;
  }

  async finishAgentOpenRound(slug: string, at: string): Promise<void> {
    const existing = this.gameAgentKeys.get(slug);
    if (!existing?.agentOpenRoundPending) return;
    const next: GameAgentKeyRecord = { ...existing, updatedAt: at };
    delete next.agentOpenRoundPending;
    this.gameAgentKeys.set(slug, next);
  }
}

export class FirestoreGameAdmissionStore implements GameAdmissionStore {
  constructor(private db: Firestore) {}

  async getGameAgentKey(slug: string): Promise<GameAgentKeyRecord | null> {
    const snap = await this.db.collection('gameAgentKeys').doc(slug).get();
    if (!snap.exists) return null;
    return snap.data() as GameAgentKeyRecord;
  }

  async ensureGameAgentKey(slug: string, ownerUid: string, at: string): Promise<GameAgentKeyRecord | null> {
    const docRef = this.db.collection('gameAgentKeys').doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (snap.exists) {
        const existing = snap.data() as GameAgentKeyRecord;
        if (existing.ownerUid !== ownerUid) return null;
        return existing;
      }
      const created: GameAgentKeyRecord = {
        slug,
        ownerUid,
        keyGeneration: 1,
        createdAt: at,
        updatedAt: at,
      };
      tx.create(docRef, created);
      return created;
    });
  }

  async rotateGameAgentKey(slug: string, ownerUid: string, at: string): Promise<GameAgentKeyRecord | null> {
    const docRef = this.db.collection('gameAgentKeys').doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return null;
      const existing = snap.data() as GameAgentKeyRecord;
      if (existing.ownerUid !== ownerUid) return null;
      const next: GameAgentKeyRecord = {
        ...existing,
        keyGeneration: existing.keyGeneration + 1,
        updatedAt: at,
      };
      tx.set(docRef, next);
      return next;
    });
  }

  async beginAgentOpenRound(slug: string, at: string): Promise<boolean> {
    const docRef = this.db.collection('gameAgentKeys').doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return false;
      const existing = snap.data() as GameAgentKeyRecord;
      if (existing.agentOpenRoundPending) return false;
      const next: GameAgentKeyRecord = { ...existing, agentOpenRoundPending: true, updatedAt: at };
      tx.set(docRef, next);
      return true;
    });
  }

  async finishAgentOpenRound(slug: string, at: string): Promise<void> {
    const docRef = this.db.collection('gameAgentKeys').doc(slug);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return;
      const existing = snap.data() as GameAgentKeyRecord;
      if (!existing.agentOpenRoundPending) return;
      const next: GameAgentKeyRecord = { ...existing, updatedAt: at };
      delete next.agentOpenRoundPending;
      tx.set(docRef, next);
    });
  }
}
