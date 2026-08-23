import type { Firestore } from '@google-cloud/firestore';
import type { GameAgentKeyRecord, CreatorAgentKeyRecord } from '../records/agent-keys.js';

export interface AgentKeysStore {
  /**
   * Durable per-game opener state (BY-23). Returns null when no key has been issued
   * for this slug yet.
   */
  getGameAgentKey(slug: string): Promise<GameAgentKeyRecord | null>;

  /**
   * Ensures a gameAgentKeys doc exists for (slug, ownerUid), creating generation 1
   * when absent. If the doc exists for a different owner, returns null (caller must
   * refuse — the slug is not theirs to key).
   */
  ensureGameAgentKey(slug: string, ownerUid: string, at: string): Promise<GameAgentKeyRecord | null>;

  /**
   * Transactionally bumps `keyGeneration` for an owned slug. Returns the new record,
   * or null when missing / not owned by `ownerUid`.
   */
  rotateGameAgentKey(slug: string, ownerUid: string, at: string): Promise<GameAgentKeyRecord | null>;

  /**
   * BY-24: admit at most one in-flight `open_round` per slug. Returns false when another
   * caller already holds the lock.
   */
  beginAgentOpenRound(slug: string, at: string): Promise<boolean>;

  /** BY-24: release the admission lock after `open_round` completes or aborts. */
  finishAgentOpenRound(slug: string, at: string): Promise<void>;

  /** Creator-wide opener record, or null when the creator has never minted one. */
  getCreatorAgentKey(ownerUid: string): Promise<CreatorAgentKeyRecord | null>;

  /**
   * Ensures a creatorAgentKeys doc exists for ownerUid, creating generation 1 when
   * absent. Does not clear `revokedAt` — mint after revoke is an explicit reactivate.
   */
  ensureCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord>;

  /**
   * Clears `revokedAt` so a post-revoke mint can issue at the current (already bumped)
   * generation. Creates generation 1 when absent. Does not bump `keyGeneration`.
   */
  reactivateCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord>;

  /**
   * Transactionally bumps `keyGeneration` and clears `revokedAt`. Returns the new
   * record, or null when the creator has no key yet (caller should ensure first).
   */
  rotateCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null>;

  /**
   * Transactionally bumps `keyGeneration` and sets `revokedAt`. Returns the new
   * record, or null when missing. Keeps the doc so generation never resets to 1.
   */
  revokeCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null>;

  /**
   * Re-dates a generation without bumping it, so it mints a valid key again.
   *
   * Mints are anchored to `updatedAt` (one generation, one key), which means a
   * generation older than the key TTL would otherwise mint an expired key forever —
   * and the only escape the panel offers is the destructive Rotate. Re-dating keeps
   * the generation, so nothing that was already dead comes back: every key of this
   * generation had expired before this could run.
   */
  touchCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null>;
}

export class InMemoryAgentKeysStore implements AgentKeysStore {
  // Not private -- deleteAccountIdentity reaches across these (documented exception, see PR).
  gameAgentKeys = new Map<string, GameAgentKeyRecord>();
  creatorAgentKeys = new Map<string, CreatorAgentKeyRecord>();

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

  async getCreatorAgentKey(ownerUid: string): Promise<CreatorAgentKeyRecord | null> {
    const record = this.creatorAgentKeys.get(ownerUid);
    return record ? { ...record } : null;
  }

  async ensureCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord> {
    const existing = this.creatorAgentKeys.get(ownerUid);
    if (existing) return { ...existing };
    const created: CreatorAgentKeyRecord = {
      ownerUid,
      keyGeneration: 1,
      createdAt: at,
      updatedAt: at,
    };
    this.creatorAgentKeys.set(ownerUid, created);
    return { ...created };
  }

  async reactivateCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord> {
    const existing = this.creatorAgentKeys.get(ownerUid);
    if (!existing) {
      return this.ensureCreatorAgentKey(ownerUid, at);
    }
    if (!existing.revokedAt) return { ...existing };
    const cleared: CreatorAgentKeyRecord = {
      ownerUid: existing.ownerUid,
      keyGeneration: existing.keyGeneration,
      createdAt: existing.createdAt,
      updatedAt: at,
    };
    this.creatorAgentKeys.set(ownerUid, cleared);
    return { ...cleared };
  }

  async rotateCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null> {
    const existing = this.creatorAgentKeys.get(ownerUid);
    if (!existing) return null;
    const next: CreatorAgentKeyRecord = {
      ownerUid: existing.ownerUid,
      keyGeneration: existing.keyGeneration + 1,
      createdAt: existing.createdAt,
      updatedAt: at,
    };
    this.creatorAgentKeys.set(ownerUid, next);
    return { ...next };
  }

  async touchCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null> {
    const existing = this.creatorAgentKeys.get(ownerUid);
    if (!existing || existing.revokedAt) return null;
    const next: CreatorAgentKeyRecord = { ...existing, updatedAt: at };
    this.creatorAgentKeys.set(ownerUid, next);
    return { ...next };
  }

  async revokeCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null> {
    const existing = this.creatorAgentKeys.get(ownerUid);
    if (!existing) return null;
    const next: CreatorAgentKeyRecord = {
      ownerUid: existing.ownerUid,
      keyGeneration: existing.keyGeneration + 1,
      createdAt: existing.createdAt,
      updatedAt: at,
      revokedAt: at,
    };
    this.creatorAgentKeys.set(ownerUid, next);
    return { ...next };
  }
}

export class FirestoreAgentKeysStore implements AgentKeysStore {
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

  async getCreatorAgentKey(ownerUid: string): Promise<CreatorAgentKeyRecord | null> {
    const snap = await this.db.collection('creatorAgentKeys').doc(ownerUid).get();
    if (!snap.exists) return null;
    return snap.data() as CreatorAgentKeyRecord;
  }

  async ensureCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord> {
    const docRef = this.db.collection('creatorAgentKeys').doc(ownerUid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (snap.exists) {
        return snap.data() as CreatorAgentKeyRecord;
      }
      const created: CreatorAgentKeyRecord = {
        ownerUid,
        keyGeneration: 1,
        createdAt: at,
        updatedAt: at,
      };
      tx.create(docRef, created);
      return created;
    });
  }

  async reactivateCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord> {
    const docRef = this.db.collection('creatorAgentKeys').doc(ownerUid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) {
        const created: CreatorAgentKeyRecord = {
          ownerUid,
          keyGeneration: 1,
          createdAt: at,
          updatedAt: at,
        };
        tx.create(docRef, created);
        return created;
      }
      const existing = snap.data() as CreatorAgentKeyRecord;
      if (!existing.revokedAt) return existing;
      const cleared: CreatorAgentKeyRecord = {
        ownerUid: existing.ownerUid,
        keyGeneration: existing.keyGeneration,
        createdAt: existing.createdAt,
        updatedAt: at,
      };
      tx.set(docRef, cleared);
      return cleared;
    });
  }

  async rotateCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null> {
    const docRef = this.db.collection('creatorAgentKeys').doc(ownerUid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return null;
      const existing = snap.data() as CreatorAgentKeyRecord;
      const next: CreatorAgentKeyRecord = {
        ownerUid: existing.ownerUid,
        keyGeneration: existing.keyGeneration + 1,
        createdAt: existing.createdAt,
        updatedAt: at,
      };
      tx.set(docRef, next);
      return next;
    });
  }

  async touchCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null> {
    const docRef = this.db.collection('creatorAgentKeys').doc(ownerUid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return null;
      const existing = snap.data() as CreatorAgentKeyRecord;
      if (existing.revokedAt) return null;
      const next: CreatorAgentKeyRecord = { ...existing, updatedAt: at };
      tx.set(docRef, next);
      return next;
    });
  }

  async revokeCreatorAgentKey(ownerUid: string, at: string): Promise<CreatorAgentKeyRecord | null> {
    const docRef = this.db.collection('creatorAgentKeys').doc(ownerUid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return null;
      const existing = snap.data() as CreatorAgentKeyRecord;
      const next: CreatorAgentKeyRecord = {
        ownerUid: existing.ownerUid,
        keyGeneration: existing.keyGeneration + 1,
        createdAt: existing.createdAt,
        updatedAt: at,
        revokedAt: at,
      };
      tx.set(docRef, next);
      return next;
    });
  }
}
