import { DocumentReference, Firestore, Query, Transaction, WriteBatch } from '@google-cloud/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { beginReadTally, installReadMeter, topReadPaths } from './read-meter.js';

const db = new Firestore({ projectId: 'read-meter-test' });

function snapshotFor(path: string, exists: boolean) {
  return { exists, ref: { path } };
}

beforeAll(() => {
  const docProto = DocumentReference.prototype as unknown as { get: () => Promise<unknown> };
  docProto.get = async function stubbedDocGet(this: DocumentReference) {
    return snapshotFor(this.path, !this.path.endsWith('/missing'));
  };
  const queryProto = Query.prototype as unknown as { get: () => Promise<unknown> };
  queryProto.get = async function stubbedQueryGet(this: Query) {
    const empty = (this as unknown as { _queryOptions?: { collectionId?: string } })._queryOptions?.collectionId;
    if (empty === 'creatorMessages') return { size: 0, docs: [] };
    return { size: 3, docs: [{}, {}, {}] };
  };
  const aggregateProto = Object.getPrototypeOf(db.collection('probe').count()) as { get: () => Promise<unknown> };
  aggregateProto.get = async () => ({ data: () => ({ count: 2_500 }) });
  const dbProto = Firestore.prototype as unknown as { getAll: () => Promise<unknown> };
  dbProto.getAll = async () => [snapshotFor('users/a', true), snapshotFor('users/b', false)];
  const txProto = Transaction.prototype as unknown as { get: () => Promise<unknown> };
  txProto.get = async () => snapshotFor('roundBudget/x', false);
  const batchProto = WriteBatch.prototype as unknown as { commit: () => Promise<unknown> };
  batchProto.commit = async () => [];
  installReadMeter();
});

describe('read meter', () => {
  it('counts a document read and masks its id', async () => {
    const tally = beginReadTally();
    await db.collection('games').doc('arena-tag').get();
    expect(tally.reads).toBe(1);
    expect(tally.missing).toBe(0);
    expect(topReadPaths(tally)).toEqual({ 'games/*': 1 });
  });

  it('bills an absent document as a read and counts it missing', async () => {
    const tally = beginReadTally();
    await db.collection('games').doc('missing').get();
    expect(tally.reads).toBe(1);
    expect(tally.missing).toBe(1);
  });

  it('labels a subcollection query by its masked parent', async () => {
    const tally = beginReadTally();
    await db.collection('telemetry').doc('20260912').collection('playEvents').limit(5).get();
    expect(tally.reads).toBe(3);
    expect(topReadPaths(tally)).toEqual({ 'telemetry/*/playEvents': 3 });
  });

  it('labels a collection-group query by its group', async () => {
    const tally = beginReadTally();
    await db.collectionGroup('scorecard').get();
    expect(topReadPaths(tally)).toEqual({ 'group:scorecard': 3 });
  });

  it('counts a batched get once per returned snapshot', async () => {
    const tally = beginReadTally();
    await db.getAll(db.collection('users').doc('a'), db.collection('users').doc('b'));
    expect(tally.reads).toBe(2);
    expect(tally.missing).toBe(1);
    expect(tally.calls).toBe(1);
  });

  it('counts transaction reads and the transaction itself', async () => {
    const tally = beginReadTally();
    await db.runTransaction(async (tx) => tx.get(db.collection('roundBudget').doc('x')));
    expect(tally.transactions).toBe(1);
    expect(tally.reads).toBe(1);
    expect(tally.missing).toBe(1);
  });

  it('bills one read for a query that matched nothing', async () => {
    const tally = beginReadTally();
    await db.collection('creatorMessages').where('delivered', '==', false).get();
    expect(tally.reads).toBe(1);
    expect(tally.calls).toBe(1);
    expect(topReadPaths(tally)).toEqual({ creatorMessages: 1 });
  });

  it('bills an aggregate by index-entry batches, never fewer than one', async () => {
    const tally = beginReadTally();
    await db.collection('playerFeedback').where('slug', '==', 'sky-dodge').count().get();
    expect(tally.reads).toBe(3);
    expect(tally.calls).toBe(1);
    expect(topReadPaths(tally)).toEqual({ 'count:playerFeedback': 3 });
  });

  it('counts a batch commit', async () => {
    const tally = beginReadTally();
    await db.batch().commit();
    expect(tally.commits).toBe(1);
    expect(tally.reads).toBe(0);
  });
});
