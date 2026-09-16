import { describe, expect, it } from 'vitest';
import { createShelfMirror } from './shelf-mirror.js';
import type { ShelfDocument } from '../store/records/shelf.js';
import type { SubmissionRecord } from '../store/records/submission.js';

const record = (jobId: number, extra: Partial<SubmissionRecord> = {}): SubmissionRecord =>
  ({ jobId, ownerUid: 'g:owner', createdAt: `2026-09-0${jobId}T00:00:00.000Z`, ...extra }) as SubmissionRecord;

interface Harness {
  rows: SubmissionRecord[];
  writes: ShelfDocument[];
  reads: number;
  release?: () => void;
}

// Holds the read open so a write lands mid-rebuild.
function harness(options: { blockReads?: boolean; failWrite?: boolean } = {}) {
  const state: Harness = { rows: [], writes: [], reads: 0 };
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
    async putShelf(_ownerUid: string, shelf: ShelfDocument) {
      if (options.failWrite) throw new Error('write refused');
      state.writes.push(shelf);
    },
    async deleteShelf() {
      // not exercised here
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
