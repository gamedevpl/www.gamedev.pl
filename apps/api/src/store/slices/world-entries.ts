import type { Firestore } from '@google-cloud/firestore';
import type { WorldEntryRecord } from '../records/player-data.js';

export interface WorldEntriesStore {
  /** Every entry in one shared world. The public read — no uid involved. */
  listWorldEntries(worldId: string): Promise<WorldEntryRecord[]>;

  /** One entry, or null. Used to settle ownership before a write. */
  getWorldEntry(worldId: string, key: string): Promise<WorldEntryRecord | null>;

  /**
   * Claims or updates one entry, atomically.
   *
   * Returns `conflict` when the key already belongs to somebody else, and `quota` when
   * this would take the player past `maxPerPlayer`. Both are decided inside the same
   * transaction as the write: checking first and writing after would let two browsers
   * on one account, or two players racing for the same plot, both pass the check.
   */
  putWorldEntry(options: {
    worldId: string;
    key: string;
    uid: string;
    fields: Record<string, string | number | boolean>;
    maxPerPlayer: number;
    maxEntries: number;
  }): Promise<{ ok: true; entry: WorldEntryRecord } | { ok: false; reason: 'conflict' | 'quota' | 'full' }>;

  /** Deletes an entry the player owns. False when it is missing or somebody else's. */
  deleteWorldEntry(worldId: string, key: string, uid: string): Promise<boolean>;

  /** How many entries a player owns in one world — the quota read. */
  countWorldEntries(worldId: string, uid: string): Promise<number>;

  /** Worlds where a person has written something — the erase path's read. */
  listWorldsForUser(uid: string): Promise<string[]>;

  /** Deletes everything one person wrote across every world. Returns how many went. */
  deleteWorldEntriesForUser(uid: string): Promise<number>;
}

export class InMemoryWorldEntriesStore implements WorldEntriesStore {
  private worldEntries = new Map<string, Map<string, WorldEntryRecord>>();

  async listWorldEntries(worldId: string): Promise<WorldEntryRecord[]> {
    return [...(this.worldEntries.get(worldId)?.values() ?? [])].map((entry) => ({ ...entry }));
  }

  async getWorldEntry(worldId: string, key: string): Promise<WorldEntryRecord | null> {
    const found = this.worldEntries.get(worldId)?.get(key);
    return found ? { ...found } : null;
  }

  async putWorldEntry(options: {
    worldId: string;
    key: string;
    uid: string;
    fields: Record<string, string | number | boolean>;
    maxPerPlayer: number;
    maxEntries: number;
  }): Promise<{ ok: true; entry: WorldEntryRecord } | { ok: false; reason: 'conflict' | 'quota' | 'full' }> {
    const world = this.worldEntries.get(options.worldId) ?? new Map<string, WorldEntryRecord>();
    const existing = world.get(options.key);
    if (existing && existing.ownerUid !== options.uid) return { ok: false, reason: 'conflict' };
    if (!existing) {
      if (world.size >= options.maxEntries) return { ok: false, reason: 'full' };
      let owned = 0;
      for (const entry of world.values()) if (entry.ownerUid === options.uid) owned += 1;
      if (owned >= options.maxPerPlayer) return { ok: false, reason: 'quota' };
    }
    const now = new Date().toISOString();
    const entry: WorldEntryRecord = {
      key: options.key,
      fields: options.fields,
      ownerUid: options.uid,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    world.set(options.key, entry);
    this.worldEntries.set(options.worldId, world);
    return { ok: true, entry: { ...entry } };
  }

  async deleteWorldEntry(worldId: string, key: string, uid: string): Promise<boolean> {
    const world = this.worldEntries.get(worldId);
    const existing = world?.get(key);
    if (!existing || existing.ownerUid !== uid) return false;
    world!.delete(key);
    return true;
  }

  async countWorldEntries(worldId: string, uid: string): Promise<number> {
    let owned = 0;
    for (const entry of this.worldEntries.get(worldId)?.values() ?? []) {
      if (entry.ownerUid === uid) owned += 1;
    }
    return owned;
  }

  async listWorldsForUser(uid: string): Promise<string[]> {
    const touched: string[] = [];
    for (const [worldId, world] of this.worldEntries) {
      if ([...world.values()].some((entry) => entry.ownerUid === uid)) touched.push(worldId);
    }
    return touched.sort();
  }

  async deleteWorldEntriesForUser(uid: string): Promise<number> {
    let removed = 0;
    for (const world of this.worldEntries.values()) {
      for (const entry of [...world.values()]) {
        if (entry.ownerUid !== uid) continue;
        world.delete(entry.key);
        removed += 1;
      }
    }
    return removed;
  }
}

export class FirestoreWorldEntriesStore implements WorldEntriesStore {
  constructor(private db: Firestore) {}

  // Worlds are top-level, not under a user: a world belongs to a game and outlives
  // every individual player of it. `worldId` is opaque (today it equals the slug), so
  // per-creator or seasonal worlds later are a new id rather than a migration.
  private worldCollection(worldId: string) {
    return this.db.collection('worlds').doc(worldId).collection('worldEntries');
  }

  private toWorldEntry(id: string, data: Record<string, unknown>): WorldEntryRecord {
    const fields = data.fields;
    return {
      key: id,
      fields: (fields && typeof fields === 'object' && !Array.isArray(fields)
        ? fields
        : {}) as WorldEntryRecord['fields'],
      ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : '',
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
    };
  }

  async listWorldEntries(worldId: string): Promise<WorldEntryRecord[]> {
    const snap = await this.worldCollection(worldId).get();
    return snap.docs.map((doc) => this.toWorldEntry(doc.id, doc.data()));
  }

  async getWorldEntry(worldId: string, key: string): Promise<WorldEntryRecord | null> {
    const snap = await this.worldCollection(worldId).doc(key).get();
    if (!snap.exists) return null;
    return this.toWorldEntry(key, snap.data() ?? {});
  }

  async putWorldEntry(options: {
    worldId: string;
    key: string;
    uid: string;
    fields: Record<string, string | number | boolean>;
    maxPerPlayer: number;
    maxEntries: number;
  }): Promise<{ ok: true; entry: WorldEntryRecord } | { ok: false; reason: 'conflict' | 'quota' | 'full' }> {
    const ref = this.worldCollection(options.worldId).doc(options.key);
    // A transaction, because both rules this enforces are exactly the kind that a
    // check-then-write silently loses: two players claiming the same empty plot in the
    // same second, and one player with two tabs open spending their last quota slot
    // twice. Reading inside the transaction is what makes the decision binding.
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? this.toWorldEntry(options.key, snap.data() ?? {}) : null;
      if (existing && existing.ownerUid !== options.uid) return { ok: false as const, reason: 'conflict' as const };

      if (!existing) {
        // Counted only when claiming a new key. Re-editing an entry the player already
        // owns cannot change either total, and charging a read for it would make the
        // common case — a player tidying their own plot — the expensive one.
        const [owned, total] = await Promise.all([
          tx.get(this.worldCollection(options.worldId).where('ownerUid', '==', options.uid).count()),
          tx.get(this.worldCollection(options.worldId).count()),
        ]);
        if (total.data().count >= options.maxEntries) return { ok: false as const, reason: 'full' as const };
        if (owned.data().count >= options.maxPerPlayer) return { ok: false as const, reason: 'quota' as const };
      }

      const now = new Date().toISOString();
      const entry: WorldEntryRecord = {
        key: options.key,
        fields: options.fields,
        ownerUid: options.uid,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      // No merge: `fields` is the whole entry, and merging would leave a value from a
      // shape the game has since stopped writing alive next to the current one.
      tx.set(ref, {
        fields: entry.fields,
        ownerUid: entry.ownerUid,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      });
      return { ok: true as const, entry };
    });
  }

  async deleteWorldEntry(worldId: string, key: string, uid: string): Promise<boolean> {
    const ref = this.worldCollection(worldId).doc(key);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      // Ownership re-read inside the transaction: the route checked it too, but only
      // this read is ordered against a concurrent write to the same key.
      if (this.toWorldEntry(key, snap.data() ?? {}).ownerUid !== uid) return false;
      tx.delete(ref);
      return true;
    });
  }

  async countWorldEntries(worldId: string, uid: string): Promise<number> {
    const snap = await this.worldCollection(worldId).where('ownerUid', '==', uid).count().get();
    return snap.data().count;
  }

  /**
   * A collection-group query, because erasure has to reach into every world at once and
   * there is no list of which ones a person touched. Needs the COLLECTION_GROUP index on
   * `worldEntries.ownerUid` provisioned in infra/setup-gcp.sh — Firestore's automatic
   * single-field indexes are COLLECTION scope only, so this is the one query here that
   * does not get an index for free.
   */
  private worldEntriesOwnedBy(uid: string) {
    return this.db.collectionGroup('worldEntries').where('ownerUid', '==', uid);
  }

  async listWorldsForUser(uid: string): Promise<string[]> {
    const snap = await this.worldEntriesOwnedBy(uid).get();
    const touched = new Set<string>();
    for (const doc of snap.docs) {
      // worlds/{worldId}/worldEntries/{key} — the grandparent names the world.
      const worldId = doc.ref.parent.parent?.id;
      if (worldId) touched.add(worldId);
    }
    return [...touched].sort();
  }

  async deleteWorldEntriesForUser(uid: string): Promise<number> {
    const snap = await this.worldEntriesOwnedBy(uid).get();
    if (snap.empty) return 0;
    // Chunked batches, same as `deleteGameSaves`: this runs inside an erasure request
    // an operator has already accepted, and somebody who built in several worlds is
    // exactly the person whose deletion would otherwise be a long run of round trips.
    // 400 per batch leaves headroom under Firestore's 500-write limit.
    for (let index = 0; index < snap.docs.length; index += 400) {
      const batch = this.db.batch();
      for (const doc of snap.docs.slice(index, index + 400)) batch.delete(doc.ref);
      await batch.commit();
    }
    return snap.docs.length;
  }
}
