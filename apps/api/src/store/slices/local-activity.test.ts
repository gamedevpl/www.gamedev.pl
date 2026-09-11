import { expect, it } from 'vitest';
import { InMemorySubmissionStore } from './submission-memory.js';
import type { SubmissionRecord } from '../records/submission.js';
it('rejects activity from a closed generation', async () => {
  const records = new Map<number, SubmissionRecord>();
  const store = new InMemorySubmissionStore(records);
  await store.createSubmission(1, 'owner', 'Game');
  const activity = { runId: 'run', agent: 'claude', phase: 'preparing' as const, at: new Date().toISOString() };
  expect(await store.setLocalActivity(1, activity, true)).toBe(true);
  records.set(1, { ...records.get(1)!, roundGeneration: 2 });
  expect(await store.setLocalActivity(1, { ...activity, phase: 'editing' }, false)).toBe(false);
  expect(await store.setLocalActivity(1, { ...activity, runId: 'new' }, true)).toBe(true);
  expect((await store.getSubmission(1))?.localActivity?.generation).toBe(2);
});
