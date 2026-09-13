import { expect, it } from 'vitest';
import { runDispatchReaperSweep } from './dispatch-reaper.js';
import { InMemoryStore } from '../platform/store.js';

async function queuedJob(store: InMemoryStore, jobId: number, stateSince: string) {
  await store.createSubmission(jobId, 'g:a', `Game ${jobId}`);
  await store.recordJobTransition(jobId, { to: 'queued', at: stateSince, by: 'system' });
}

const noopLog = { error: () => {} };

it('leaves local recovery drafts alone but retries ordinary and handed-off jobs', async () => {
  const store = new InMemoryStore();
  for (const jobId of [1, 2]) {
    await store.createSubmission(jobId, 'g:a', `Recovered ${jobId}`);
    await store.claimSubmissionSlug(jobId, `recovered-${jobId}`, null, {
      key: `recovery-${jobId}`,
      spec: 'Recovered local sources',
      locale: 'en',
    });
  }
  await store.setRoundBuilder(2, 'platform', { resetRoundBudget: false });
  await queuedJob(store, 3, '2026-08-15T11:40:00.000Z');
  await store.setRoundBuilder(3, 'self', { resetRoundBudget: false });
  const calls: number[] = [];
  const result = await runDispatchReaperSweep({
    store,
    now: () => Date.now() + 20 * 60_000,
    thresholdMs: 10 * 60_000,
    redispatchQueuedJob: async ({ jobId }) => {
      calls.push(jobId);
      return { outcome: 'retried' };
    },
    log: noopLog,
  });
  expect(result).toEqual({ checked: 3, retried: 2, exhausted: 0, skipped: 1 });
  expect(calls.sort()).toEqual([2, 3]);
  expect(await store.getSubmission(1)).toMatchObject({ state: 'queued', builder: 'self' });
});
