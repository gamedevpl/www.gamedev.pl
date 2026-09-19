import type { Firestore } from '@google-cloud/firestore';
import {
  fencedOut,
  newGameAccess,
  settledOver,
  settlementWins,
  withMemberErased,
  type GameAccessRecord,
} from '../records/game-access.js';
import { DELETED_ACCOUNT_UID } from '../records/identity.js';
import { tombstoneShelf, type ShelfDocument } from '../records/shelf.js';
import { TRANSFER_MARKER_RESCAN_INTERVAL_MS, backfillTransferMarkers } from '../transfer-marker-backfill.js';

// Read plus conditional creates, each fenced against account erasure.
export interface GameAccessStore {
  getGameAccess(slug: string): Promise<GameAccessRecord | null>;

  // workAt is when the work began: pre-erasure work stays refused forever.
  ensureGameAccess(slug: string, ownerUid: string, workAt: string, at: string): Promise<GameAccessRecord | null>;

  // Settlement: corrects a record only while nothing but settlement has written it.

  // A transferred, shared, or newer job's record is left alone.
  recordSettledOwner(
    slug: string,
    ownerUid: string,
    jobId: number,
    workAt: string,
    at: string,
  ): Promise<GameAccessRecord | null>;

  // Backfill: records an owner only while that account still exists.

  // Null when the account is gone: the caller quarantines rather than guessing.
  backfillGameAccess(
    slug: string,
    ownerUid: string,
    jobId: number,
    workAt: string,
    checkAccount: boolean,
    at: string,
  ): Promise<GameAccessRecord | null>;

  // What a dry run reads to match the write's verdict.
  getAccountErasure(uid: string): Promise<string | null>;

  accountExists(uid: string): Promise<boolean>;

  // The shelf query collaboration needs.
  listGameAccessByMember(uid: string): Promise<GameAccessRecord[]>;

  // Erasure's first act: no writer may name the uid after it.
  beginAccountErasure(uid: string, at: string): Promise<void>;

  // Erasure's scrub, run after the fence.
  eraseMemberFromAllGameAccess(uid: string, at: string): Promise<string[]>;
}

// Written by slug settlement and nothing else: no transfer, no membership change.
const isPristine = (record: GameAccessRecord): boolean => record.accessRevision === 1 && record.editorUids.length === 0;

const clone = (record: GameAccessRecord): GameAccessRecord => ({
  ...record,
  editorUids: [...record.editorUids],
  memberUids: [...record.memberUids],
});

export class InMemoryGameAccessStore implements GameAccessStore {
  constructor(
    private hasAccount: (uid: string) => boolean = () => true,
    // Same write as the access change; neither lands alone.
    private invalidateShelf: (ownerUid: string, at: string) => void = () => {},
    // Every ownerUid with a round on the slug.
    private authorsOf: (slug: string) => string[] = () => [],
  ) {}

  // The first canonical row strips every other legacy author.
  private invalidateOtherAuthors(slug: string, ownerUid: string, at: string): void {
    for (const uid of new Set(this.authorsOf(slug))) {
      if (uid !== ownerUid) this.invalidateShelf(uid, at);
    }
  }

  // Not private -- deleteAccountIdentity reaches across these, as it does for agent keys.
  access = new Map<string, GameAccessRecord>();

  // Not private -- InMemoryGameTransferStore fences new invitations against this.
  erasedAt = new Map<string, string>();

  async beginAccountErasure(uid: string, at: string): Promise<void> {
    this.erasedAt.set(uid, at);
    this.invalidateShelf(uid, at);
  }

  async getAccountErasure(uid: string): Promise<string | null> {
    return this.erasedAt.get(uid) ?? null;
  }

  async accountExists(uid: string): Promise<boolean> {
    return this.hasAccount(uid);
  }

  async eraseMemberFromAllGameAccess(uid: string, at: string): Promise<string[]> {
    const touched: string[] = [];
    for (const [slug, record] of [...this.access]) {
      const erased = withMemberErased(record, uid, DELETED_ACCOUNT_UID, at);
      if (!erased) continue;
      this.access.set(slug, erased);
      touched.push(slug);
    }
    return touched;
  }

  async getGameAccess(slug: string): Promise<GameAccessRecord | null> {
    const record = this.access.get(slug);
    return record ? clone(record) : null;
  }

  async ensureGameAccess(slug: string, ownerUid: string, workAt: string, at: string): Promise<GameAccessRecord | null> {
    const existing = this.access.get(slug);
    if (existing) return clone(existing);
    if (fencedOut(this.erasedAt.get(ownerUid) ?? null, workAt)) return null;
    const record = newGameAccess(slug, ownerUid, at);
    this.access.set(slug, record);
    this.invalidateOtherAuthors(slug, ownerUid, at);
    return clone(record);
  }

  async recordSettledOwner(
    slug: string,
    ownerUid: string,
    jobId: number,
    workAt: string,
    at: string,
  ): Promise<GameAccessRecord | null> {
    const existing = this.access.get(slug);
    if (existing && (!isPristine(existing) || !settlementWins(existing, jobId))) return clone(existing);
    if (existing?.ownerUid === ownerUid && existing.settledJobId === jobId) return clone(existing);
    if (fencedOut(this.erasedAt.get(ownerUid) ?? null, workAt)) return existing ? clone(existing) : null;
    const record = settledOver(existing ?? null, slug, ownerUid, at, jobId);
    this.access.set(slug, record);
    // Settlement moved the name; the loser keeps serving it otherwise.
    if (existing && existing.ownerUid !== ownerUid) {
      this.invalidateShelf(existing.ownerUid, at);
      this.invalidateShelf(ownerUid, at);
    }
    if (!existing) this.invalidateOtherAuthors(slug, ownerUid, at);
    return clone(record);
  }

  async backfillGameAccess(
    slug: string,
    ownerUid: string,
    jobId: number,
    workAt: string,
    checkAccount: boolean,
    at: string,
  ): Promise<GameAccessRecord | null> {
    const existing = this.access.get(slug);
    if (existing) return clone(existing);
    if (fencedOut(this.erasedAt.get(ownerUid) ?? null, workAt)) return null;
    if (checkAccount && !this.hasAccount(ownerUid)) return null;

    // Settled by its own job: a migrated record is not tentative.
    const record = newGameAccess(slug, ownerUid, at, jobId);
    this.access.set(slug, record);
    this.invalidateOtherAuthors(slug, ownerUid, at);
    return clone(record);
  }

  async listGameAccessByMember(uid: string): Promise<GameAccessRecord[]> {
    return [...this.access.values()].filter((record) => record.memberUids.includes(uid)).map(clone);
  }
}

export class FirestoreGameAccessStore implements GameAccessStore {
  constructor(private db: Firestore) {}

  private doc(slug: string) {
    return this.db.collection('gameAccess').doc(slug);
  }

  private erasureFence(uid: string) {
    return this.db.collection('erasedAccounts').doc(uid);
  }

  private async fenceAt(tx: FirebaseFirestore.Transaction, uid: string): Promise<string | null> {
    const snap = await tx.get(this.erasureFence(uid));
    return snap.exists ? ((snap.data() as { at?: string }).at ?? null) : null;
  }

  // With the fence: a post-commit tombstone can fail on its own.
  async beginAccountErasure(uid: string, at: string): Promise<void> {
    const shelfRef = this.db.collection('shelves').doc(uid);
    await this.db.runTransaction(async (tx) => {
      const shelfSnap = await tx.get(shelfRef);
      const shelf = shelfSnap.exists ? (shelfSnap.data() as ShelfDocument) : null;
      tx.set(this.erasureFence(uid), { uid, at });
      tx.set(shelfRef, tombstoneShelf(at, (shelf?.seq ?? 0) + 1));
    });
  }

  async getAccountErasure(uid: string): Promise<string | null> {
    const snap = await this.erasureFence(uid).get();
    return snap.exists ? ((snap.data() as { at?: string }).at ?? null) : null;
  }

  async accountExists(uid: string): Promise<boolean> {
    return (await this.db.collection('users').doc(uid).get()).exists;
  }

  async eraseMemberFromAllGameAccess(uid: string, at: string): Promise<string[]> {
    const snap = await this.db.collection('gameAccess').where('memberUids', 'array-contains', uid).get();
    const touched: string[] = [];

    // Per record: the snapshot may be stale, and batches cap at 500.
    for (const doc of snap.docs) {
      const slug = await this.db.runTransaction(async (tx) => {
        const current = await tx.get(doc.ref);
        if (!current.exists) return null;
        const erased = withMemberErased(current.data() as GameAccessRecord, uid, DELETED_ACCOUNT_UID, at);
        if (!erased) return null;
        tx.set(doc.ref, erased);
        return erased.slug;
      });
      if (slug) touched.push(slug);
    }
    return touched;
  }

  private migration: Promise<unknown> | null = null;
  private migratedAt = 0;

  // A record read before the pass could answer a capability check unfenced.
  private async migrated(): Promise<void> {
    if (this.migration) {
      await this.migration;
      return;
    }
    if (Date.now() - this.migratedAt < TRANSFER_MARKER_RESCAN_INTERVAL_MS) return;
    // A failed pass leaves migratedAt alone, so the next read retries it.
    this.migration = backfillTransferMarkers(this.db)
      .then(() => {
        this.migratedAt = Date.now();
      })
      .finally(() => {
        this.migration = null;
      });
    await this.migration;
  }

  async getGameAccess(slug: string): Promise<GameAccessRecord | null> {
    await this.migrated();
    const snap = await this.doc(slug).get();
    return snap.exists ? (snap.data() as GameAccessRecord) : null;
  }

  // Reads only; the caller writes tombstones after its own writes.
  private async otherAuthorShelves(
    tx: FirebaseFirestore.Transaction,
    slug: string,
    ownerUid: string,
  ): Promise<Array<{ ref: FirebaseFirestore.DocumentReference; seq: number }>> {
    const rounds = await tx.get(this.db.collection('submissions').where('slug', '==', slug));
    const authors = new Set(rounds.docs.map((doc) => (doc.data() as { ownerUid?: string }).ownerUid));
    authors.delete(ownerUid);
    authors.delete(undefined);
    return Promise.all(
      [...authors].map(async (uid) => {
        const ref = this.db.collection('shelves').doc(uid!);
        const snap = await tx.get(ref);
        return { ref, seq: snap.exists ? ((snap.data() as ShelfDocument).seq ?? 0) : 0 };
      }),
    );
  }

  private tombstoneAll(
    tx: FirebaseFirestore.Transaction,
    shelves: Array<{ ref: FirebaseFirestore.DocumentReference; seq: number }>,
    at: string,
  ): void {
    for (const { ref, seq } of shelves) tx.set(ref, tombstoneShelf(at, seq + 1));
  }

  async ensureGameAccess(slug: string, ownerUid: string, workAt: string, at: string): Promise<GameAccessRecord | null> {
    const ref = this.doc(slug);

    // Transaction, not create-and-catch: creation races the backfill.
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return snap.data() as GameAccessRecord;

      // Reading the fence here is what orders this write against erasure.
      if (fencedOut(await this.fenceAt(tx, ownerUid), workAt)) return null;
      const others = await this.otherAuthorShelves(tx, slug, ownerUid);
      const record = newGameAccess(slug, ownerUid, at);
      tx.create(ref, record);
      this.tombstoneAll(tx, others, at);
      return record;
    });
  }

  async recordSettledOwner(
    slug: string,
    ownerUid: string,
    jobId: number,
    workAt: string,
    at: string,
  ): Promise<GameAccessRecord | null> {
    const ref = this.doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? (snap.data() as GameAccessRecord) : null;
      if (existing && (!isPristine(existing) || !settlementWins(existing, jobId))) return existing;
      if (existing?.ownerUid === ownerUid && existing.settledJobId === jobId) return existing;
      if (fencedOut(await this.fenceAt(tx, ownerUid), workAt)) return existing;

      // Settlement moved the name; read before writing below.
      const moved = Boolean(existing && existing.ownerUid !== ownerUid);
      const shelves = moved
        ? await Promise.all(
            [existing!.ownerUid, ownerUid].map(async (uid) => {
              const shelfRef = this.db.collection('shelves').doc(uid);
              const shelfSnap = await tx.get(shelfRef);
              return { shelfRef, shelf: shelfSnap.exists ? (shelfSnap.data() as ShelfDocument) : null };
            }),
          )
        : [];

      const others = existing ? [] : await this.otherAuthorShelves(tx, slug, ownerUid);

      const record = settledOver(existing, slug, ownerUid, at, jobId);
      if (existing) tx.set(ref, record);
      else tx.create(ref, record);
      for (const { shelfRef, shelf } of shelves) tx.set(shelfRef, tombstoneShelf(at, (shelf?.seq ?? 0) + 1));
      this.tombstoneAll(tx, others, at);
      return record;
    });
  }

  async backfillGameAccess(
    slug: string,
    ownerUid: string,
    jobId: number,
    workAt: string,
    checkAccount: boolean,
    at: string,
  ): Promise<GameAccessRecord | null> {
    const ref = this.doc(slug);

    // The account read joins this transaction; erasure cannot slip between.
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return snap.data() as GameAccessRecord;
      if (fencedOut(await this.fenceAt(tx, ownerUid), workAt)) return null;
      if (checkAccount && !(await tx.get(this.db.collection('users').doc(ownerUid))).exists) return null;
      const others = await this.otherAuthorShelves(tx, slug, ownerUid);

      // Settled by its own job: a migrated record is not tentative.
      const record = newGameAccess(slug, ownerUid, at, jobId);
      tx.create(ref, record);
      this.tombstoneAll(tx, others, at);
      return record;
    });
  }

  async listGameAccessByMember(uid: string): Promise<GameAccessRecord[]> {
    const snap = await this.db.collection('gameAccess').where('memberUids', 'array-contains', uid).get();
    return snap.docs.map((doc) => doc.data() as GameAccessRecord);
  }
}
