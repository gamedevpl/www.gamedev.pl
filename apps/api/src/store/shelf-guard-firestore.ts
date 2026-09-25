// The Firestore seam: a transaction that invalidates what it writes.

// A slice takes GuardedFirestore, so an unguarded handle will not type-check.

import { FieldValue, Firestore } from '@google-cloud/firestore';
import type { DocumentReference, Transaction } from '@google-cloud/firestore';

// The store takes its handle here, so guarding is not optional.
export { FieldValue, Firestore };
import { SHELF_MIRRORED_FIELDS, SHELF_VERSION } from './records/shelf.js';
import { noteReadTally } from './read-meter.js';

declare const shelfGuarded: unique symbol;

// Branded, not aliased: the brand is what makes the guard unavoidable.
export type GuardedFirestore = Firestore & { readonly [shelfGuarded]: true };

export interface ShelfGuardLog {
  warn(context: object, message: string): void;
}

// A swallowed failure leaves a servable stale shelf with no signal.

// Never optional: the store builds the guard without passing one.
const defaultLog: ShelfGuardLog = {
  warn(context, message) {
    console.warn(JSON.stringify({ level: 'warn', msg: message, ...context }));
  },
};

type Data = Record<string, unknown>;

const GUARDED = new Set(['submissions', 'gameAccess']);
const WRITES = new Set(['set', 'update', 'create', 'delete']);

// Blind: FieldValue.increment needs no read, so no read ordering to respect.
function blindTombstone(builtAt: string): Data {
  return {
    version: SHELF_VERSION,
    builtAt,
    sourceCount: 0,
    ownedCount: 0,
    rounds: [],
    stale: true,
    // Never a delete: that resets seq and lets a stale rebuild win.
    seq: FieldValue.increment(1),
  };
}

// A top-level document in one of the two collections, or nothing.
function guardedPath(ref: unknown): { collection: string; id: string } | null {
  const path = (ref as { path?: unknown } | null)?.path;
  if (typeof path !== 'string') return null;
  const segments = path.split('/');
  if (segments.length !== 2) return null;
  const [collection, id] = segments as [string, string];
  return GUARDED.has(collection) ? { collection, id } : null;
}

function isData(value: unknown): value is Data {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Only the mirrored keys the patch actually names, against what was read.
function changesShelf(before: Data | null, patch: unknown): boolean {
  if (!isData(patch)) return true;
  const named = SHELF_MIRRORED_FIELDS.filter((key) => key in patch);
  if (named.length === 0) return false;
  if (!before) return true;
  return named.some((key) => patch[key] !== before[key]);
}

// Deduplicated: memberUids and editorUids overlap, and each costs a write.
function membersOf(record: Data | null): string[] {
  if (!record) return [];
  const uids = [
    record.ownerUid,
    ...((record.memberUids as string[]) ?? []),
    ...((record.editorUids as string[]) ?? []),
  ];
  return [...new Set(uids.filter((uid): uid is string => typeof uid === 'string'))];
}

// Only a read can answer these, so they wait for commit.
export interface DeferredInvalidation {
  jobIds: string[];
  // Owners of any round on the slug, which only a query finds.
  claimantSlugs: string[];
  // A shared game's co-editors, from the access document.
  memberSlugs: string[];
}

interface Session {
  tx: Transaction;
  flush(): void;
  deferred: DeferredInvalidation;
  flushedOwners: string[];
}

// Everything the transaction read, so resolving owners costs no read.
function createSession(real: Transaction, db: Firestore, at: string): Session {
  const seen = new Map<string, Data | null>();
  const owners = new Set<string>();
  const unread = new Set<string>();
  const claimantSlugs = new Set<string>();
  const memberSlugs = new Set<string>();

  const remember = (snap: unknown): void => {
    const target = guardedPath((snap as { ref?: unknown }).ref);
    if (!target) return;
    const data = (snap as { exists?: boolean; data: () => Data | undefined }).data();
    seen.set(`${target.collection}/${target.id}`, data ?? null);
  };

  const noteRead = (result: unknown): void => {
    if (!result || typeof result !== 'object') return;
    const docs = (result as { docs?: unknown[] }).docs;
    if (Array.isArray(docs)) for (const doc of docs) remember(doc);
    else remember(result);
  };

  const noteWrite = (method: string, ref: unknown, patch: unknown): void => {
    const target = guardedPath(ref);
    if (!target) return;
    const before = seen.get(`${target.collection}/${target.id}`) ?? null;

    if (target.collection === 'gameAccess') {
      // Membership is exactly what the reader's count cannot see.
      for (const uid of membersOf(before)) owners.add(uid);
      for (const uid of membersOf(isData(patch) ? patch : null)) owners.add(uid);
      // Canonical access drops the slug from every non-member's shelf.
      claimantSlugs.add(target.id);
      return;
    }
    if (method !== 'delete' && !changesShelf(before, patch)) return;
    // A round this transaction never read: owner resolved after commit.
    if (!before) {
      unread.add(String(target.id));
      return;
    }
    if (typeof before.ownerUid === 'string') owners.add(before.ownerUid);

    // A shared game's co-editors see this round too.
    const slug = (isData(patch) && typeof patch.slug === 'string' ? patch.slug : before.slug) as string | undefined;
    if (typeof slug !== 'string') return;
    const access = seen.get(`gameAccess/${slug}`);
    // Free when the transaction read it; one read after commit otherwise.
    if (access === undefined) memberSlugs.add(slug);
    else for (const uid of membersOf(access)) owners.add(uid);
  };

  const handler: ProxyHandler<Transaction> = {
    get(target, prop) {
      if (prop === 'get' || prop === 'getAll') {
        return async (...args: unknown[]) => {
          const result = await (Reflect.get(target, prop, target) as (...a: unknown[]) => Promise<unknown>).apply(
            target,
            args,
          );
          if (Array.isArray(result)) for (const entry of result) noteRead(entry);
          else noteRead(result);
          return result;
        };
      }
      if (typeof prop === 'string' && WRITES.has(prop)) {
        return (ref: unknown, ...rest: unknown[]) => {
          noteWrite(prop, ref, rest[0]);
          return (Reflect.get(target, prop, target) as (...a: unknown[]) => unknown).apply(target, [ref, ...rest]);
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  };

  return {
    tx: new Proxy(real, handler),
    flush() {
      for (const uid of owners) {
        real.set(db.collection('shelves').doc(uid) as DocumentReference, blindTombstone(at));
      }
    },
    get deferred() {
      return { jobIds: [...unread], claimantSlugs: [...claimantSlugs], memberSlugs: [...memberSlugs] };
    },
    get flushedOwners() {
      return [...owners];
    },
  };
}

// Nothing per call site: a slice writes as it always did.

// Owners come from what the transaction already read, so no extra read.

// See ops repo docs/firestore-read-cost.md for why this seam exists.
export function createGuardedFirestore(db: Firestore, log: ShelfGuardLog = defaultLog): GuardedFirestore {
  const tombstone = async (ownerUid: string, at: string): Promise<void> => {
    await db.collection('shelves').doc(ownerUid).set(blindTombstone(at));
  };

  // Counted as well as logged, so a sweep of failures is visible.
  const attempt = async (context: object, work: () => Promise<void>): Promise<void> => {
    try {
      await work();
    } catch (error) {
      noteReadTally('shelfGuardDeferredFailed', true);
      log.warn({ ...context, err: error }, 'shelf guard could not invalidate after commit');
    }
  };

  const resolveDeferred = async (pending: DeferredInvalidation, at: string, flushedOwners: string[]): Promise<void> => {
    const tombstoned = new Set(flushedOwners);
    const tombstoneOnce = async (uid: string): Promise<void> => {
      if (tombstoned.has(uid)) return;
      await tombstone(uid, at);
      tombstoned.add(uid);
    };
    const slugs = new Set(pending.memberSlugs);
    for (const jobId of pending.jobIds) {
      await attempt({ jobId }, async () => {
        const record = (await db.collection('submissions').doc(jobId).get()).data() as Data | undefined;
        if (typeof record?.ownerUid === 'string') await tombstoneOnce(record.ownerUid);
        if (typeof record?.slug === 'string') slugs.add(record.slug);
      });
    }
    for (const slug of slugs) {
      await attempt({ slug }, async () => {
        const access = (await db.collection('gameAccess').doc(slug).get()).data() as Data | undefined;
        for (const uid of membersOf(access ?? null)) await tombstoneOnce(uid);
      });
    }
    for (const slug of pending.claimantSlugs) {
      await attempt({ slug }, async () => {
        const snap = await db.collection('submissions').where('slug', '==', slug).select('ownerUid').get();
        const claimants = new Set(snap.docs.map((doc) => (doc.data() as Data).ownerUid));
        for (const uid of claimants) if (typeof uid === 'string') await tombstoneOnce(uid);
      });
    }
  };

  const runTransaction = async <T>(updateFunction: (tx: Transaction) => Promise<T>, options?: unknown): Promise<T> => {
    const at = new Date().toISOString();
    let pending: DeferredInvalidation = { jobIds: [], claimantSlugs: [], memberSlugs: [] };
    let flushedOwners: string[] = [];
    const result = await (db.runTransaction as (fn: (tx: Transaction) => Promise<T>, o?: unknown) => Promise<T>)(
      async (real) => {
        const session = createSession(real, db, at);
        const value = await updateFunction(session.tx);
        // After the callback, so every write is known; no read follows.
        session.flush();
        pending = session.deferred;
        flushedOwners = session.flushedOwners;
        return value;
      },
      options,
    );
    const deferred = pending.jobIds.length + pending.claimantSlugs.length + pending.memberSlugs.length;
    if (deferred > 0) await resolveDeferred(pending, at, flushedOwners);
    return result;
  };

  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'runTransaction') return runTransaction;
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as GuardedFirestore;
}
