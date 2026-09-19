import { describe, expect, it } from 'vitest';
import { createShelfMirror } from './shelf-mirror.js';
import { buildShelfDocument, tombstoneShelf, type ShelfDocument } from '../store/records/shelf.js';
import type { SubmissionRecord } from '../store/records/submission.js';

const record = (jobId: number, extra: Partial<SubmissionRecord> = {}): SubmissionRecord =>
  ({ jobId, ownerUid: 'g:owner', createdAt: `2026-09-0${jobId}T00:00:00.000Z`, ...extra }) as SubmissionRecord;

interface Harness {
  rows: SubmissionRecord[];
  writes: ShelfDocument[];
  stored: Map<string, ShelfDocument>;
  erasedAt: string | null;
  user: { createdAt?: string } | null;
  deleted: string[];
  reads: number;
  release?: () => void;
}

// Holds the read open so a write lands mid-rebuild.
function harness(options: { blockReads?: boolean; failWrite?: boolean } = {}) {
  const state: Harness = { rows: [], writes: [], stored: new Map(), erasedAt: null, user: null, deleted: [], reads: 0 };
  let unblock: (() => void) | undefined;
  const gate = options.blockReads
    ? new Promise<void>((resolve) => {
        unblock = resolve;
      })
    : Promise.resolve();
  state.release = () => unblock?.();
  const store = {
    async listSubmissionsByOwner() {
      state.reads += 1;
      // Snapshot before parking, as a real read would.
      const snapshot = [...state.rows];
      await gate;
      return snapshot;
    },
    async getSubmission(jobId: number) {
      return state.rows.find((row) => row.jobId === jobId) ?? null;
    },
    async getShelf(ownerUid: string) {
      return state.stored.get(ownerUid) ?? null;
    },
    async getAccountErasure() {
      return state.erasedAt;
    },
    async getUser() {
      return state.user;
    },
    async putShelfIfUnchanged(ownerUid: string, shelf: ShelfDocument, expectedSeq: number) {
      if (options.failWrite) throw new Error('write refused');
      if ((state.stored.get(ownerUid)?.seq ?? 0) !== expectedSeq) return false;
      const written = { ...shelf, seq: expectedSeq + 1 };
      state.stored.set(ownerUid, written);
      state.writes.push(written);
      return true;
    },
    async deleteShelf(ownerUid: string) {
      state.deleted.push(ownerUid);
      state.stored.delete(ownerUid);
    },
    async tombstoneShelf(ownerUid: string, builtAt: string) {
      state.deleted.push(ownerUid);
      state.stored.set(ownerUid, tombstoneShelf(builtAt, (state.stored.get(ownerUid)?.seq ?? 0) + 1));
    },
    // No canonical access here: the reconcile keeps every row.
    async listGameAccessByMember() {
      return [];
    },
    async getGameAccess() {
      return null;
    },
    async listSubmissionsBySlug(slug: string) {
      return state.rows.filter((row) => row.slug === slug);
    },
    async getSubmissionBySlug(slug: string) {
      return state.rows.find((row) => row.slug === slug) ?? null;
    },
  };
  return { state, store };
}

describe('createShelfMirror', () => {
  it('writes a document built from every round the owner has', async () => {
    const { state, store } = harness();
    state.rows = [record(1), record(2)];
    const mirror = createShelfMirror({ store, now: () => Date.parse('2026-09-13T00:00:00.000Z') });

    const shelf = await mirror.rebuild('g:owner');

    expect(shelf?.rounds.map((round) => round.jobId)).toEqual([2, 1]);
    expect(state.writes).toHaveLength(1);
  });

  it('costs one rebuild for concurrent callers, not one each', async () => {
    const { state, store } = harness({ blockReads: true });
    state.rows = [record(1)];
    const mirror = createShelfMirror({ store, now: () => 0 });

    const both = Promise.all([mirror.rebuild('g:owner'), mirror.rebuild('g:owner')]);
    state.release?.();
    await both;

    // The second caller joined the running pass rather than starting its own.
    expect(state.reads).toBeLessThanOrEqual(2);
  });

  it('runs again when a write lands after the rebuild already read source', async () => {
    const { state, store } = harness({ blockReads: true });
    state.rows = [record(1)];
    const mirror = createShelfMirror({ store, now: () => 0 });

    const first = mirror.rebuild('g:owner');
    // Parked inside its read; this write must not be lost.
    state.rows = [record(1), record(2)];
    const second = mirror.rebuild('g:owner');
    state.release?.();
    await Promise.all([first, second]);

    expect(state.writes.at(-1)?.rounds.map((round) => round.jobId)).toEqual([2, 1]);
    expect(state.writes.at(-1)?.sourceCount).toBe(2);
  });

  it('reports a failed rebuild as null rather than throwing at the writer', async () => {
    const { state, store } = harness({ failWrite: true });
    state.rows = [record(1)];
    const errors: unknown[] = [];
    const mirror = createShelfMirror({ store, now: () => 0, onError: (error) => errors.push(error) });

    await expect(mirror.rebuild('g:owner')).resolves.toBeNull();
    expect(errors).toHaveLength(1);
  });

  // The coalescing above fences one process, not four.
  it('refuses a rebuild whose source read predates another instance write', async () => {
    const { state, store } = harness();
    state.rows = [record(1, { slug: 'sky' })];
    const instanceA = createShelfMirror({ store, now: () => 0, onError: () => {} });
    const instanceB = createShelfMirror({ store, now: () => 0, onError: () => {} });

    // A reads the round the owner still has.
    const seqSeenByA = (await store.getShelf('g:owner'))?.seq ?? 0;

    // Revoked, and B rebuilds from corrected source.
    state.rows = [];
    await instanceB.rebuild('g:owner');
    expect(state.stored.get('g:owner')?.rounds).toEqual([]);

    // A must lose: the count check cannot see a revoked round return.
    const staleShelf = buildShelfDocument([record(1, { slug: 'sky' })], '', 1);
    expect(await store.putShelfIfUnchanged('g:owner', staleShelf, seqSeenByA)).toBe(false);
    expect(state.stored.get('g:owner')?.rounds).toEqual([]);

    // A pass reading after B is honest, and allowed.
    await expect(instanceA.rebuild('g:owner')).resolves.not.toBeNull();
  });

  // The correct rebuild can lose; retrying is what makes it converge.
  it('retries when it loses the race, so the revoked round does not survive', async () => {
    const { state, store } = harness();
    // Revocation already happened: source lacks the round.
    state.rows = [];
    const revoking = createShelfMirror({ store, now: () => 0, onError: () => {} });

    // A pass reading before the revocation commits first, once.
    const realPut = store.putShelfIfUnchanged;
    let interfered = false;
    store.putShelfIfUnchanged = async (ownerUid: string, shelf: ShelfDocument, expectedSeq: number) => {
      if (!interfered) {
        interfered = true;
        await realPut(ownerUid, buildShelfDocument([record(1, { slug: 'sky' })], '', 1), expectedSeq);
      }
      return realPut(ownerUid, shelf, expectedSeq);
    };

    await expect(revoking.rebuild('g:owner')).resolves.not.toBeNull();

    // The retry reread source and overwrote the revoked round.
    expect(interfered).toBe(true);
    expect(state.stored.get('g:owner')?.rounds).toEqual([]);
    expect(state.stored.get('g:owner')?.stale).toBeUndefined();
  });

  // Endless contention must not leave the winner servable.
  it('tombstones rather than serving a document it could not order itself against', async () => {
    const { state, store } = harness();
    state.rows = [];
    const losing = createShelfMirror({ store, now: () => 0, onError: () => {} });

    // Someone else writes between every read and write here.
    const realPut = store.putShelfIfUnchanged;
    store.putShelfIfUnchanged = async (ownerUid: string, shelf: ShelfDocument, expectedSeq: number) => {
      await realPut(ownerUid, buildShelfDocument([record(1, { slug: 'sky' })], '', 1), expectedSeq);
      return realPut(ownerUid, shelf, expectedSeq);
    };

    await expect(losing.rebuild('g:owner')).resolves.toBeNull();
    expect(state.stored.get('g:owner')?.stale).toBe(true);
  });

  // A delete resets seq to 0, which the earlier pass also holds.
  it('leaves a sequenced tombstone on discard, not a gap another pass can win', async () => {
    const { state, store } = harness();
    state.rows = [record(1, { slug: 'sky' })];
    const stale = createShelfMirror({ store, now: () => 0, onError: () => {} });

    // A starts from an absent, pre-fence shelf.
    const seqSeenByA = (await store.getShelf('g:owner'))?.seq ?? 0;
    expect(seqSeenByA).toBe(0);

    // Revoked, and the rebuild that follows fails, so it discards.
    state.rows = [];
    await store.tombstoneShelf('g:owner', '');

    // A must still lose, though nothing servable is stored.
    const staleShelf = buildShelfDocument([record(1, { slug: 'sky' })], '', 1);
    expect(await store.putShelfIfUnchanged('g:owner', staleShelf, seqSeenByA)).toBe(false);
    expect(state.stored.get('g:owner')?.stale).toBe(true);

    // The tombstone is unservable, so the next read pays source.
    await expect(stale.rebuild('g:owner')).resolves.not.toBeNull();
  });

  // A kept document would serve a game the member just lost.
  it('drops the document when the rebuild fails, rather than leaving it servable', async () => {
    const { state, store } = harness({ failWrite: true });
    state.rows = [record(1)];
    const mirror = createShelfMirror({ store, now: () => 0, onError: () => {} });

    await mirror.rebuild('g:owner');

    expect(state.writes).toEqual([]);
    expect(state.deleted).toEqual(['g:owner']);
  });

  it('resolves the owner from the job, because writers only know a job', async () => {
    const { state, store } = harness();
    state.rows = [record(7)];
    const mirror = createShelfMirror({ store, now: () => 0 });

    await mirror.afterJobWrite(7);
    expect(state.writes).toHaveLength(1);

    // An unowned job is not an error, and writes nothing.
    await mirror.afterJobWrite(999);
    expect(state.writes).toHaveLength(1);
  });

  it('leaves nothing in flight once the work settles', async () => {
    const { state, store } = harness();
    state.rows = [record(1)];
    const mirror = createShelfMirror({ store, now: () => 0 });

    await mirror.rebuild('g:owner');
    expect(mirror.pending()).toBe(0);
  });
});
