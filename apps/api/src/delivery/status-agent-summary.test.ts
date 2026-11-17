import { expect, it, vi } from 'vitest';
import { attachAgentActivity } from './status-agent-activity.js';
import { InMemoryStore } from '../platform/store.js';
import type { SubmissionStatusResponse } from '../platform/submission-status.js';

it('localizes summaries, keeps their original time and preserves newer authored progress', async () => {
  const store = new InMemoryStore();
  await store.createSubmission(42, 'owner', 'Game');
  await store.recordDispatch(42, { backend: 'managed:anthropic', ref: 'session' });
  const record = (await store.getSubmission(42))!;
  const now = Date.now() + 2000;
  const summaryAt = new Date(now - 1000).toISOString();
  const activity = {
    key: 'managed_editing_files',
    at: new Date(now).toISOString(),
    summary: { at: summaryAt, en: 'Edited terrain.', pl: 'Zmieniono teren.' },
  };
  const read = vi.fn().mockResolvedValue(activity);
  for (const [locale, text] of [
    ['pl', 'Zmieniono teren.'],
    ['en', 'Edited terrain.'],
  ]) {
    const status: SubmissionStatusResponse = { status: 'queued' };
    await attachAgentActivity(status, record, read, () => now, locale);
    expect(status.lastAgentPresence).toEqual({ key: activity.key, at: activity.at, text, textAt: summaryAt });
    expect(JSON.stringify(status)).not.toContain('"summary"');
  }
  const status: SubmissionStatusResponse = {
    status: 'building',
    events: [{ id: 'report', kind: 'step', text: 'New report', createdAt: new Date(now).toISOString() }],
  };
  await attachAgentActivity(status, record, read, () => now, 'pl');
  expect(status.lastAgentPresence?.text).toBeUndefined();
});
