import type { Firestore } from '@google-cloud/firestore';
import {
  MAX_PLAY_AFFINITY_GAMES,
  MAX_PLAY_AFFINITY_OPENS,
  type EditorDraftRecord,
  type GameSaveRecord,
  type PlayAffinityRecord,
} from '../records/player-data.js';

export interface PlayerDataStore {
  // One player's save for one game, null if none exists.
  getGameSave(uid: string, slug: string): Promise<GameSaveRecord | null>;

  // Writes/replaces one save; caller has already size-checked data.
  putGameSave(uid: string, slug: string, data: string, version: number): Promise<GameSaveRecord>;

  deleteGameSave(uid: string, slug: string): Promise<void>;

  // Every save a person has, across games -- the erase path's read.
  listGameSaves(uid: string): Promise<GameSaveRecord[]>;

  // Deletes every save a person has. Returns how many went.
  deleteGameSaves(uid: string): Promise<number>;

  // A creator's editor draft for one game, null if none exists.
  getEditorDraft(uid: string, slug: string): Promise<EditorDraftRecord | null>;

  // Increments revision; expectedRevision makes multi-tab writes compare-and-swap.
  putEditorDraft(
    uid: string,
    slug: string,
    content: string,
    expectedRevision?: number,
  ): Promise<{ conflict: false; record: EditorDraftRecord } | { conflict: true; revision: number }>;

  deleteEditorDraft(uid: string, slug: string): Promise<void>;

  // Every editor draft a person has -- erase path's preview + real read.
  listEditorDrafts(uid: string): Promise<EditorDraftRecord[]>;

  // Deletes every editor draft a person has (erase path).
  deleteEditorDrafts(uid: string): Promise<number>;

  // Upserts affinity on open, bumps openCount, trims oldest past the ceiling.
  recordPlayAffinity(uid: string, slug: string, at?: string): Promise<PlayAffinityRecord>;

  // Every game a person has opened while signed in -- recommendations + erase read.
  listPlayAffinity(uid: string): Promise<PlayAffinityRecord[]>;

  // Deletes every play-affinity row a person has. Returns how many went.
  deletePlayAffinity(uid: string): Promise<number>;
}

export class InMemoryPlayerDataStore implements PlayerDataStore {
  // Not private -- deleteAccountIdentity reaches across these (documented exception, see PR).
  gameSaves = new Map<string, Map<string, GameSaveRecord>>();
  editorDrafts = new Map<string, Map<string, EditorDraftRecord>>();
  playAffinity = new Map<string, Map<string, PlayAffinityRecord>>();

  async getGameSave(uid: string, slug: string): Promise<GameSaveRecord | null> {
    const found = this.gameSaves.get(uid)?.get(slug);
    return found ? { ...found } : null;
  }

  async putGameSave(uid: string, slug: string, data: string, version: number): Promise<GameSaveRecord> {
    const record: GameSaveRecord = { slug, data, version, updatedAt: new Date().toISOString() };
    const forUser = this.gameSaves.get(uid) ?? new Map<string, GameSaveRecord>();
    forUser.set(slug, record);
    this.gameSaves.set(uid, forUser);
    return { ...record };
  }

  async deleteGameSave(uid: string, slug: string): Promise<void> {
    this.gameSaves.get(uid)?.delete(slug);
  }

  async listGameSaves(uid: string): Promise<GameSaveRecord[]> {
    return [...(this.gameSaves.get(uid)?.values() ?? [])].map((record) => ({ ...record }));
  }

  async deleteGameSaves(uid: string): Promise<number> {
    const count = this.gameSaves.get(uid)?.size ?? 0;
    this.gameSaves.delete(uid);
    return count;
  }

  async getEditorDraft(uid: string, slug: string): Promise<EditorDraftRecord | null> {
    const found = this.editorDrafts.get(uid)?.get(slug);
    return found ? { ...found } : null;
  }

  async putEditorDraft(
    uid: string,
    slug: string,
    content: string,
    expectedRevision?: number,
  ): Promise<{ conflict: false; record: EditorDraftRecord } | { conflict: true; revision: number }> {
    const forUser = this.editorDrafts.get(uid) ?? new Map<string, EditorDraftRecord>();
    const current = forUser.get(slug)?.revision ?? 0;
    if (expectedRevision !== undefined && current !== expectedRevision) {
      return { conflict: true, revision: current };
    }
    const record: EditorDraftRecord = {
      slug,
      content,
      revision: current + 1,
      updatedAt: new Date().toISOString(),
    };
    forUser.set(slug, record);
    this.editorDrafts.set(uid, forUser);
    return { conflict: false, record: { ...record } };
  }

  async deleteEditorDraft(uid: string, slug: string): Promise<void> {
    this.editorDrafts.get(uid)?.delete(slug);
  }

  async listEditorDrafts(uid: string): Promise<EditorDraftRecord[]> {
    return [...(this.editorDrafts.get(uid)?.values() ?? [])].map((record) => ({ ...record }));
  }

  async deleteEditorDrafts(uid: string): Promise<number> {
    const count = this.editorDrafts.get(uid)?.size ?? 0;
    this.editorDrafts.delete(uid);
    return count;
  }

  async recordPlayAffinity(uid: string, slug: string, at?: string): Promise<PlayAffinityRecord> {
    const when = at ?? new Date().toISOString();
    const forUser = this.playAffinity.get(uid) ?? new Map<string, PlayAffinityRecord>();
    const existing = forUser.get(slug);
    const record: PlayAffinityRecord = {
      slug,
      openCount: Math.min(MAX_PLAY_AFFINITY_OPENS, (existing?.openCount ?? 0) + 1),
      lastPlayedAt: when,
    };
    forUser.set(slug, record);
    if (forUser.size > MAX_PLAY_AFFINITY_GAMES) {
      const oldest = [...forUser.values()]
        .filter((entry) => entry.slug !== slug)
        .sort((a, b) => a.lastPlayedAt.localeCompare(b.lastPlayedAt) || a.slug.localeCompare(b.slug));
      const overflow = forUser.size - MAX_PLAY_AFFINITY_GAMES;
      for (const entry of oldest.slice(0, overflow)) forUser.delete(entry.slug);
    }
    this.playAffinity.set(uid, forUser);
    return { ...record };
  }

  async listPlayAffinity(uid: string): Promise<PlayAffinityRecord[]> {
    return [...(this.playAffinity.get(uid)?.values() ?? [])]
      .map((record) => ({ ...record }))
      .sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt) || a.slug.localeCompare(b.slug));
  }

  async deletePlayAffinity(uid: string): Promise<number> {
    const count = this.playAffinity.get(uid)?.size ?? 0;
    this.playAffinity.delete(uid);
    return count;
  }
}

export class FirestorePlayerDataStore implements PlayerDataStore {
  constructor(private db: Firestore) {}

  // Under the player, keyed by slug (see GameSaveRecord for why).
  private gameSaveRef(uid: string, slug: string) {
    return this.db.collection('users').doc(uid).collection('gameSaves').doc(slug);
  }

  async getGameSave(uid: string, slug: string): Promise<GameSaveRecord | null> {
    const snap = await this.gameSaveRef(uid, slug).get();
    if (!snap.exists) return null;
    const data = snap.data() ?? {};
    return {
      slug,
      data: typeof data.data === 'string' ? data.data : '',
      version: typeof data.version === 'number' ? data.version : 0,
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
    };
  }

  async putGameSave(uid: string, slug: string, data: string, version: number): Promise<GameSaveRecord> {
    const record: GameSaveRecord = { slug, data, version, updatedAt: new Date().toISOString() };
    // set without merge -- a save is a whole snapshot, not a patch.
    await this.gameSaveRef(uid, slug).set({ data, version, updatedAt: record.updatedAt });
    return record;
  }

  async deleteGameSave(uid: string, slug: string): Promise<void> {
    await this.gameSaveRef(uid, slug).delete();
  }

  async listGameSaves(uid: string): Promise<GameSaveRecord[]> {
    const snap = await this.db.collection('users').doc(uid).collection('gameSaves').get();
    return snap.docs.map((doc) => {
      const data = doc.data();
      return {
        slug: doc.id,
        data: typeof data.data === 'string' ? data.data : '',
        version: typeof data.version === 'number' ? data.version : 0,
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
      };
    });
  }

  async deleteGameSaves(uid: string): Promise<number> {
    // listDocuments -- only refs are needed; saves can be large.
    const refs = await this.db.collection('users').doc(uid).collection('gameSaves').listDocuments();
    if (refs.length === 0) return 0;

    // Chunked batches (400/batch), like deletePlayerFeedbackByUid -- accepted erasure.
    for (let index = 0; index < refs.length; index += 400) {
      const batch = this.db.batch();
      for (const ref of refs.slice(index, index + 400)) batch.delete(ref);
      await batch.commit();
    }
    return refs.length;
  }

  // Under the creator, keyed by slug -- same placement as gameSaves.
  private editorDraftRef(uid: string, slug: string) {
    return this.db.collection('users').doc(uid).collection('editorDrafts').doc(slug);
  }

  async getEditorDraft(uid: string, slug: string): Promise<EditorDraftRecord | null> {
    const snap = await this.editorDraftRef(uid, slug).get();
    if (!snap.exists) return null;
    const data = snap.data() ?? {};
    return {
      slug,
      content: typeof data.content === 'string' ? data.content : '',
      revision: typeof data.revision === 'number' ? data.revision : 0,
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
    };
  }

  async putEditorDraft(
    uid: string,
    slug: string,
    content: string,
    expectedRevision?: number,
  ): Promise<{ conflict: false; record: EditorDraftRecord } | { conflict: true; revision: number }> {
    const ref = this.editorDraftRef(uid, slug);
    // Transaction, not read-then-set -- two tabs must not both silently win.
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? (snap.data() ?? {}) : {};
      const current = typeof data.revision === 'number' ? data.revision : 0;
      if (expectedRevision !== undefined && current !== expectedRevision) {
        return { conflict: true as const, revision: current };
      }
      const record: EditorDraftRecord = {
        slug,
        content,
        revision: current + 1,
        updatedAt: new Date().toISOString(),
      };
      // set without merge, like saves -- a draft is a whole snapshot.
      tx.set(ref, { content, revision: record.revision, updatedAt: record.updatedAt });
      return { conflict: false as const, record };
    });
  }

  async deleteEditorDraft(uid: string, slug: string): Promise<void> {
    await this.editorDraftRef(uid, slug).delete();
  }

  async listEditorDrafts(uid: string): Promise<EditorDraftRecord[]> {
    const snap = await this.db.collection('users').doc(uid).collection('editorDrafts').get();
    return snap.docs.map((doc) => {
      const data = doc.data();
      return {
        slug: doc.id,
        content: typeof data.content === 'string' ? data.content : '',
        revision: typeof data.revision === 'number' ? data.revision : 0,
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
      };
    });
  }

  async deleteEditorDrafts(uid: string): Promise<number> {
    const refs = await this.db.collection('users').doc(uid).collection('editorDrafts').listDocuments();
    if (refs.length === 0) return 0;
    for (let index = 0; index < refs.length; index += 400) {
      const batch = this.db.batch();
      for (const ref of refs.slice(index, index + 400)) batch.delete(ref);
      await batch.commit();
    }
    return refs.length;
  }

  private playAffinityRef(uid: string, slug: string) {
    return this.db.collection('users').doc(uid).collection('playAffinity').doc(slug);
  }

  async recordPlayAffinity(uid: string, slug: string, at?: string): Promise<PlayAffinityRecord> {
    const when = at ?? new Date().toISOString();
    const ref = this.playAffinityRef(uid, slug);
    const record = await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? snap.data() : null;
      const openCount = Math.min(
        MAX_PLAY_AFFINITY_OPENS,
        (typeof existing?.openCount === 'number' ? existing.openCount : 0) + 1,
      );
      const next: PlayAffinityRecord = { slug, openCount, lastPlayedAt: when };
      tx.set(ref, { openCount: next.openCount, lastPlayedAt: next.lastPlayedAt });
      return next;
    });

    // Trimmed outside the transaction -- ceiling is a soft bound.
    const col = this.db.collection('users').doc(uid).collection('playAffinity');
    const listed = await col.get();
    if (listed.size > MAX_PLAY_AFFINITY_GAMES) {
      const oldest = listed.docs
        .filter((doc) => doc.id !== slug)
        .map((doc) => ({
          id: doc.id,
          lastPlayedAt: typeof doc.data().lastPlayedAt === 'string' ? doc.data().lastPlayedAt : '',
        }))
        .sort((a, b) => a.lastPlayedAt.localeCompare(b.lastPlayedAt) || a.id.localeCompare(b.id));
      const overflow = listed.size - MAX_PLAY_AFFINITY_GAMES;
      for (let index = 0; index < overflow; index += 400) {
        const batch = this.db.batch();
        for (const entry of oldest.slice(index, Math.min(index + 400, overflow))) {
          batch.delete(col.doc(entry.id));
        }
        await batch.commit();
      }
    }

    return record;
  }

  async listPlayAffinity(uid: string): Promise<PlayAffinityRecord[]> {
    const snap = await this.db.collection('users').doc(uid).collection('playAffinity').get();
    return snap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          slug: doc.id,
          openCount: typeof data.openCount === 'number' ? data.openCount : 0,
          lastPlayedAt: typeof data.lastPlayedAt === 'string' ? data.lastPlayedAt : '',
        };
      })
      .sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt) || a.slug.localeCompare(b.slug));
  }

  async deletePlayAffinity(uid: string): Promise<number> {
    const refs = await this.db.collection('users').doc(uid).collection('playAffinity').listDocuments();
    if (refs.length === 0) return 0;
    for (let index = 0; index < refs.length; index += 400) {
      const batch = this.db.batch();
      for (const ref of refs.slice(index, index + 400)) batch.delete(ref);
      await batch.commit();
    }
    return refs.length;
  }
}
