import { describe, expect, it } from 'vitest';
import { runDispatchReaperSweep, type RedispatchOutcome } from './dispatch-reaper.js';
import { InMemoryStore } from '../platform/store.js';

const AT = Date.parse('2026-08-15T12:00:00.000Z');

async function queuedJob(store: InMemoryStore, jobId: number, stateSince: string) {
  await store.createSubmission(jobId, 'g:a', `Game ${jobId}`);
  await store.recordJobTransition(jobId, { to: 'queued', at: stateSince, by: 'system' });
}

const noopLog = { error: () => {} };

describe('runDispatchReaperSweep', () => {
  it('skips a job that has not been queued long enough', async () => {
    const store = new InMemoryStore();
    await queuedJob(store, 1, '2026-08-15T11:55:00.000Z');
    const calls: number[] = [];

    const result = await runDispatchReaperSweep({
      store,
      now: () => AT,
      thresholdMs: 10 * 60 * 1000,
      redispatchQueuedJob: async ({ jobId }) => {
        calls.push(jobId);
        return { outcome: 'retried' };
      },
      log: noopLog,
    });

    expect(result).toEqual({ checked: 1, retried: 0, exhausted: 0, skipped: 1 });
    expect(calls).toEqual([]);
  });

  it('attempts every job past the threshold and tallies outcomes', async () => {
    const store = new InMemoryStore();
    await queuedJob(store, 1, '2026-08-15T11:40:00.000Z');
    await queuedJob(store, 2, '2026-08-15T11:40:00.000Z');
    await queuedJob(store, 3, '2026-08-15T11:40:00.000Z');
    const outcomes: Record<number, RedispatchOutcome> = {
      1: { outcome: 'retried' },
      2: { outcome: 'exhausted' },
      3: { outcome: 'skipped', reason: 'already_claimed' },
    };

    const result = await runDispatchReaperSweep({
      store,
      now: () => AT,
      thresholdMs: 10 * 60 * 1000,
      redispatchQueuedJob: async ({ jobId }) => outcomes[jobId],
      log: noopLog,
    });

    expect(result).toEqual({ checked: 3, retried: 1, exhausted: 1, skipped: 1 });
  });

  it('counts a thrown attempt as skipped and keeps going', async () => {
    const store = new InMemoryStore();
    await queuedJob(store, 1, '2026-08-15T11:40:00.000Z');
    await queuedJob(store, 2, '2026-08-15T11:40:00.000Z');
    const errors: unknown[] = [];

    const result = await runDispatchReaperSweep({
      store,
      now: () => AT,
      thresholdMs: 10 * 60 * 1000,
      redispatchQueuedJob: async ({ jobId }) => {
        if (jobId === 1) throw new Error('boom');
        return { outcome: 'retried' };
      },
      log: { error: (context) => errors.push(context) },
    });

    expect(result).toEqual({ checked: 2, retried: 1, exhausted: 0, skipped: 1 });
    expect(errors).toHaveLength(1);
  });
});
