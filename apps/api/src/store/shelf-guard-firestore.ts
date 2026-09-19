// The Firestore seam: a transaction that invalidates what it writes.

// A slice takes GuardedFirestore, so an unguarded handle will not type-check.

import { FieldValue, Firestore } from '@google-cloud/firestore';
import type { DocumentReference, Transaction } from '@google-cloud/firestore';

// The store takes its handle here, so guarding is not optional.
export { FieldValue, Firestore };
import { SHELF_MIRRORED_FIELDS, SHELF_VERSION } from './records/shelf.js';

declare const shelfGuarded: unique symbol;

// Branded, not aliased: the brand is what makes the guard unavoidable.
export type GuardedFirestore = Firestore & { readonly [shelfGuarded]: true };

export interface ShelfGuardLog {
  warn(context: object, message: string): void;
}

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

function membersOf(record: Data | null): string[] {
  if (!record) return [];
  const uids = [
    record.ownerUid,
    ...((record.memberUids as string[]) ?? []),
    ...((record.editorUids as string[]) ?? []),
  ];
  return uids.filter((uid): uid is string => typeof uid === 'string');
}

// Only a query can answer these, so they wait for commit.
export interface DeferredInvalidation {
  jobIds: string[];
  slugs: string[];
}

interface Session {
  tx: Transaction;
  flush(): void;
  deferred: DeferredInvalidation;
}

// Everything the transaction read, so resolving owners costs no read.
function createSession(real: Transaction, db: Firestore, at: string): Session {
  const seen = new Map<string, Data | null>();
  const owners = new Set<string>();
  const unread = new Set<string>();
  const slugs = new Set<string>();

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
      slugs.add(target.id);
      return;
    }
    if (method !== 'delete' && !changesShelf(before, patch)) return;
    // A round this transaction never read: owner resolved after commit.
    if (!before) unread.add(String(target.id));
    else for (const uid of membersOf(before)) owners.add(uid);
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
      return { jobIds: [...unread], slugs: [...slugs] };
    },
  };
}

/**
 * Wraps a Firestore handle so its transactions invalidate the shelves they touch.
 *
 * Nothing per call site: a slice writes `submissions` or `gameAccess` as it always
 * did, and the shelves that write can be seen on are tombstoned in the same
 * transaction. Owners come from what the transaction already read, so the guard
 * costs one small write and no read.
 *
 * Co-editors of a shared game stay `shelf-mirror.afterJobWrite`'s job: expanding
 * membership here would mean a `gameAccess` read on every round write.
 */
export function createGuardedFirestore(db: Firestore, log?: ShelfGuardLog): GuardedFirestore {
  const tombstone = async (ownerUid: string, at: string): Promise<void> => {
    await db.collection('shelves').doc(ownerUid).set(blindTombstone(at));
  };

  const resolveDeferred = async (pending: DeferredInvalidation, at: string): Promise<void> => {
    for (const jobId of pending.jobIds) {
      try {
        const snap = await db.collection('submissions').doc(jobId).get();
        const ownerUid = (snap.data() as Data | undefined)?.ownerUid;
        if (typeof ownerUid === 'string') await tombstone(ownerUid, at);
      } catch (error) {
        log?.warn({ jobId, err: error }, 'shelf guard could not invalidate after commit');
      }
    }
    for (const slug of pending.slugs) {
      try {
        const snap = await db.collection('submissions').where('slug', '==', slug).select('ownerUid').get();
        const claimants = new Set(snap.docs.map((doc) => (doc.data() as Data).ownerUid));
        for (const uid of claimants) if (typeof uid === 'string') await tombstone(uid, at);
      } catch (error) {
        log?.warn({ slug, err: error }, 'shelf guard could not invalidate claimants');
      }
    }
  };

  const runTransaction = async <T>(updateFunction: (tx: Transaction) => Promise<T>, options?: unknown): Promise<T> => {
    const at = new Date().toISOString();
    let pending: DeferredInvalidation = { jobIds: [], slugs: [] };
    const result = await (db.runTransaction as (fn: (tx: Transaction) => Promise<T>, o?: unknown) => Promise<T>)(
      async (real) => {
        const session = createSession(real, db, at);
        const value = await updateFunction(session.tx);
        // After the callback, so every write is known; no read follows.
        session.flush();
        pending = session.deferred;
        return value;
      },
      options,
    );
    if (pending.jobIds.length > 0 || pending.slugs.length > 0) await resolveDeferred(pending, at);
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
