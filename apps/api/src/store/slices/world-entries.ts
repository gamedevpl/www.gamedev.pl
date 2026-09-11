import type { Firestore } from '@google-cloud/firestore';
import type { WorldEntryRecord } from '../records/player-data.js';

// More shards, less contention, more documents per revision check.
const REVISION_SHARDS = 8;

export interface WorldEntriesStore {
  // Every entry in one shared world. The public read -- no uid involved.
  listWorldEntries(worldId: string): Promise<WorldEntryRecord[]>;

  // Changes on every write; equal tokens mean nothing changed.
  getWorldRevision(worldId: string): Promise<string>;

  // One entry, or null. Used to settle ownership before a write.
  getWorldEntry(worldId: string, key: string): Promise<WorldEntryRecord | null>;

  // Atomic claim/update; transaction prevents two racers both passing the check.
  putWorldEntry(options: {
    worldId: string;
    key: string;
    uid: string;
    fields: Record<string, string | number | boolean>;
    maxPerPlayer: number;
    maxEntries: number;
  }): Promise<{ ok: true; entry: WorldEntryRecord } | { ok: false; reason: 'conflict' | 'quota' | 'full' }>;

  // Deletes an entry the player owns; false if missing/not theirs.
  deleteWorldEntry(worldId: string, key: string, uid: string): Promise<boolean>;

  // How many entries a player owns in one world -- the quota read.
  countWorldEntries(worldId: string, uid: string): Promise<number>;

  // Worlds where a person has written something -- the erase path's read.
  listWorldsForUser(uid: string): Promise<string[]>;

  // Deletes everything one person wrote across every world. Returns how many went.
  deleteWorldEntriesForUser(uid: string): Promise<number>;
}

export class InMemoryWorldEntriesStore implements WorldEntriesStore {
  private worldEntries = new Map<string, Map<string, WorldEntryRecord>>();
  private revisions = new Map<string, number>();

  private bump(worldId: string): void {
    this.revisions.set(worldId, (this.revisions.get(worldId) ?? 0) + 1);
  }

  private token(worldId: string): string {
    const n = this.revisions.get(worldId) ?? 0;
    return n === 0 ? '' : String(n);
  }

  async listWorldEntries(worldId: string): Promise<WorldEntryRecord[]> {
    return [...(this.worldEntries.get(worldId)?.values() ?? [])].map((entry) => ({ ...entry }));
  }

  async getWorldRevision(worldId: string): Promise<string> {
    return this.token(worldId);
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
    this.bump(options.worldId);
    return { ok: true, entry: { ...entry } };
  }

  async deleteWorldEntry(worldId: string, key: string, uid: string): Promise<boolean> {
    const world = this.worldEntries.get(worldId);
    const existing = world?.get(key);
    if (!existing || existing.ownerUid !== uid) return false;
    world!.delete(key);
    this.bump(worldId);
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
    for (const [worldId, world] of this.worldEntries) {
      let touched = false;
      for (const entry of [...world.values()]) {
        if (entry.ownerUid !== uid) continue;
        world.delete(entry.key);
        removed += 1;
        touched = true;
      }
      if (touched) this.bump(worldId);
    }
    return removed;
  }
}

export class FirestoreWorldEntriesStore implements WorldEntriesStore {
  constructor(private db: Firestore) {}

  // Worlds are top-level (not per-user); worldId is opaque, today == slug.
  private worldCollection(worldId: string) {
    return this.db.collection('worlds').doc(worldId).collection('worldEntries');
  }

  // Sharded, so concurrent writers rarely touch the same document.
  private revisionShards(worldId: string) {
    return this.db.collection('worlds').doc(worldId).collection('revision');
  }

  private revisionShard(worldId: string) {
    return this.revisionShards(worldId).doc(String(Math.floor(Math.random() * REVISION_SHARDS)));
  }

  // Unique per write, so two writes never collapse into one token.
  private stamp() {
    return { at: `${new Date().toISOString()}:${Math.random().toString(36).slice(2, 10)}` };
  }

  async getWorldRevision(worldId: string): Promise<string> {
    const snap = await this.revisionShards(worldId).get();
    return snap.docs
      .map((doc) => `${doc.id}=${String(doc.data().at ?? '')}`)
      .sort()
      .join('|');
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
    // Transaction: check-then-write would let two racers double-claim a plot.
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? this.toWorldEntry(options.key, snap.data() ?? {}) : null;
      if (existing && existing.ownerUid !== options.uid) return { ok: false as const, reason: 'conflict' as const };

      if (!existing) {
        // Counted only on a new claim; re-editing owned entries is free.
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
      // No merge -- fields is the whole entry, not a partial patch.
      tx.set(ref, {
        fields: entry.fields,
        ownerUid: entry.ownerUid,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      });
      // Same transaction, so no reader sees one without the other.
      tx.set(this.revisionShard(options.worldId), this.stamp(), { merge: true });
      return { ok: true as const, entry };
    });
  }

  async deleteWorldEntry(worldId: string, key: string, uid: string): Promise<boolean> {
    const ref = this.worldCollection(worldId).doc(key);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      // Re-checked inside the transaction, ordered against a concurrent write.
      if (this.toWorldEntry(key, snap.data() ?? {}).ownerUid !== uid) return false;
      tx.delete(ref);
      tx.set(this.revisionShard(worldId), this.stamp(), { merge: true });
      return true;
    });
  }

  async countWorldEntries(worldId: string, uid: string): Promise<number> {
    const snap = await this.worldCollection(worldId).where('ownerUid', '==', uid).count().get();
    return snap.data().count;
  }

  // Collection-group query; needs the COLLECTION_GROUP index in setup-gcp.sh.
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
    // Chunked batches (400/batch), like deleteGameSaves -- an accepted erasure request.
    for (let index = 0; index < snap.docs.length; index += 400) {
      const batch = this.db.batch();
      const chunk = snap.docs.slice(index, index + 400);
      for (const doc of chunk) batch.delete(doc.ref);
      // Same batch: the rows and the token invalidating them go together.
      for (const worldId of new Set(chunk.map((doc) => doc.ref.parent.parent?.id).filter(Boolean) as string[])) {
        batch.set(this.revisionShard(worldId), this.stamp(), { merge: true });
      }
      await batch.commit();
    }
    return snap.docs.length;
  }
}
