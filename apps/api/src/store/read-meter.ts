import { AsyncLocalStorage } from 'node:async_hooks';
import { DocumentReference, Firestore, Query, Transaction, WriteBatch } from '@google-cloud/firestore';

export interface ReadTally {
  calls: number;
  reads: number;
  missing: number;
  commits: number;
  transactions: number;
  byPath: Map<string, number>;
}

type AsyncFn = (...args: unknown[]) => Promise<unknown>;

interface QueryInternals {
  _queryOptions?: {
    collectionId?: string;
    allDescendants?: boolean;
    parentPath?: { relativeName?: string };
  };
}

const storage = new AsyncLocalStorage<ReadTally>();
const INSTALLED = Symbol.for('gamedev.read-meter.installed');

export function beginReadTally(): ReadTally {
  const tally: ReadTally = { calls: 0, reads: 0, missing: 0, commits: 0, transactions: 0, byPath: new Map() };
  storage.enterWith(tally);
  return tally;
}

export function currentReadTally(): ReadTally | undefined {
  return storage.getStore();
}

export function runWithReadTally<T>(tally: ReadTally, fn: () => T): T {
  return storage.run(tally, fn);
}

export function topReadPaths(tally: ReadTally, limit = 5): Record<string, number> {
  const ranked = [...tally.byPath.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return Object.fromEntries(ranked.slice(0, limit));
}

// Document ids sit at odd depths, so masking them collapses one shape.
function maskPath(path: string): string {
  return path
    .split('/')
    .map((segment, index) => (index % 2 === 1 ? '*' : segment))
    .join('/');
}

function queryLabel(query: Query): string {
  const options = (query as unknown as QueryInternals)._queryOptions;
  const collectionId = options?.collectionId;
  if (!collectionId) return 'query';
  if (options?.allDescendants) return `group:${collectionId}`;
  const parent = options?.parentPath?.relativeName;
  return parent ? `${maskPath(parent)}/${collectionId}` : collectionId;
}

function record(label: string, reads: number, missing: number): void {
  const tally = storage.getStore();
  if (!tally) return;
  tally.calls += 1;
  tally.reads += reads;
  tally.missing += missing;
  tally.byPath.set(label, (tally.byPath.get(label) ?? 0) + reads);
}

interface MaybeSnapshot {
  exists?: boolean;
  docs?: unknown[];
  size?: number;
  ref?: { path?: string };
}

// A read of an absent document is still one billed read.
function recordDocs(label: string, snapshots: MaybeSnapshot[]): void {
  const missing = snapshots.filter((snapshot) => snapshot?.exists === false).length;
  record(label, snapshots.length, missing);
}

function labelOfSnapshots(snapshots: MaybeSnapshot[], fallback: string): string {
  const path = snapshots[0]?.ref?.path;
  return path ? maskPath(path) : fallback;
}

function patchDocumentGet(): void {
  const proto = DocumentReference.prototype as unknown as { get: AsyncFn };
  const original = proto.get;
  proto.get = async function meteredDocumentGet(this: DocumentReference, ...args: unknown[]) {
    const snapshot = (await original.apply(this, args)) as MaybeSnapshot;
    record(maskPath(this.path), 1, snapshot?.exists === false ? 1 : 0);
    return snapshot;
  } as AsyncFn;
}

function patchQueryGet(): void {
  const proto = Query.prototype as unknown as { get: AsyncFn };
  const original = proto.get;
  proto.get = async function meteredQueryGet(this: Query, ...args: unknown[]) {
    const snapshot = (await original.apply(this, args)) as MaybeSnapshot;
    record(queryLabel(this), snapshot?.size ?? snapshot?.docs?.length ?? 0, 0);
    return snapshot;
  } as AsyncFn;
}

function patchGetAll(): void {
  const proto = Firestore.prototype as unknown as { getAll: AsyncFn };
  const original = proto.getAll;
  proto.getAll = async function meteredGetAll(this: Firestore, ...args: unknown[]) {
    const snapshots = (await original.apply(this, args)) as MaybeSnapshot[];
    recordDocs(labelOfSnapshots(snapshots, 'getAll'), snapshots);
    return snapshots;
  } as AsyncFn;
}

function recordTransactionResult(result: unknown): void {
  if (Array.isArray(result)) {
    const snapshots = result as MaybeSnapshot[];
    recordDocs(labelOfSnapshots(snapshots, 'transaction:getAll'), snapshots);
    return;
  }
  const snapshot = result as MaybeSnapshot;
  if (snapshot?.docs !== undefined) {
    record('transaction:query', snapshot.size ?? snapshot.docs.length, 0);
    return;
  }
  const label = snapshot?.ref?.path ? maskPath(snapshot.ref.path) : 'transaction:get';
  record(label, 1, snapshot?.exists === false ? 1 : 0);
}

function patchTransaction(): void {
  const proto = Transaction.prototype as unknown as { get: AsyncFn; getAll: AsyncFn };
  for (const method of ['get', 'getAll'] as const) {
    const original = proto[method];
    proto[method] = async function meteredTransactionRead(this: Transaction, ...args: unknown[]) {
      const result = await original.apply(this, args);
      recordTransactionResult(result);
      return result;
    } as AsyncFn;
  }
}

function patchCommits(): void {
  const batchProto = WriteBatch.prototype as unknown as { commit: AsyncFn };
  const originalCommit = batchProto.commit;
  batchProto.commit = async function meteredCommit(this: WriteBatch, ...args: unknown[]) {
    const result = await originalCommit.apply(this, args);
    const tally = storage.getStore();
    if (tally) tally.commits += 1;
    return result;
  } as AsyncFn;

  const dbProto = Firestore.prototype as unknown as { runTransaction: AsyncFn };
  const originalTransaction = dbProto.runTransaction;
  dbProto.runTransaction = async function meteredRunTransaction(this: Firestore, ...args: unknown[]) {
    const tally = storage.getStore();
    if (tally) tally.transactions += 1;
    return originalTransaction.apply(this, args);
  } as AsyncFn;
}

export function installReadMeter(): void {
  const marker = Firestore.prototype as unknown as Record<symbol, boolean>;
  if (marker[INSTALLED]) return;
  marker[INSTALLED] = true;
  patchDocumentGet();
  patchQueryGet();
  patchGetAll();
  patchTransaction();
  patchCommits();
}
