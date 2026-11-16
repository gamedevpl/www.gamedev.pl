import { expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { createBuildStatusAssembler } from './build-status.js';

async function setup() {
  const store = new InMemoryStore();
  await store.createSubmission(42, 'owner', 'Game');
  await store.recordDispatch(42, { backend: 'managed:anthropic', ref: 'session' });
  const now = Date.now() + 1000;
  const activity = { key: 'managed_editing_files', at: new Date(now).toISOString() };
  const readAgentActivity = vi.fn().mockResolvedValue(activity);
  const assembler = createBuildStatusAssembler({
    store,
    now: () => now,
    isPresenceEventText: () => false,
    readAgentActivity,
  });
  const poll = (uid?: string) => assembler.attachBuildEvents({ status: 'queued' }, 42, 'en', uid);
  return { store, now, activity, readAgentActivity, poll };
}

it('sends activity through the existing status response only to members', async () => {
  const { store, poll, readAgentActivity, activity } = await setup();
  expect((await poll('stranger')).lastAgentPresence).toBeUndefined();
  expect((await poll()).lastAgentPresence).toBeUndefined();
  expect(readAgentActivity).not.toHaveBeenCalled();
  expect(await poll('owner')).toMatchObject({
    status: 'building',
    phase: 'building',
    lastAgentPresence: activity,
    lastAgentSignalAt: activity.at,
  });
  expect(readAgentActivity).toHaveBeenCalledWith('managed:anthropic', 'session');
  expect((await store.getSubmission(42))?.lastAgentPresence).toBeUndefined();
  await store.recordDispatch(42, { backend: 'managed:anthropic', ref: 'new-session' });
  await poll('owner');
  expect(readAgentActivity).toHaveBeenLastCalledWith('managed:anthropic', 'new-session');
  readAgentActivity.mockClear();
  await store.markAgentEnded(42);
  await poll('owner');
  expect(readAgentActivity).not.toHaveBeenCalled();
});

it('ignores stale activity, previous rounds and vendor failures without losing status', async () => {
  const { store, poll, readAgentActivity, now } = await setup();
  readAgentActivity.mockResolvedValue({ key: 'managed_editing_files', at: new Date(now - 91_000).toISOString() });
  expect((await poll('owner')).lastAgentPresence).toBeUndefined();
  const record = (await store.getSubmission(42))!;
  const get = vi.spyOn(store, 'getSubmission');
  get.mockResolvedValue({ ...record, roundStartedAt: new Date(now + 1).toISOString() });
  readAgentActivity.mockResolvedValue({ key: 'managed_editing_files', at: new Date(now).toISOString() });
  expect((await poll('owner')).lastAgentPresence).toBeUndefined();
  get.mockResolvedValue(record);
  readAgentActivity.mockRejectedValue(new Error('offline'));
  expect((await poll('owner')).status).toBe('queued');
  readAgentActivity.mockResolvedValue({ key: 'managed_idle', at: new Date(now).toISOString() });
  expect((await poll('owner')).lastAgentPresence?.key).toBe('managed_idle');
});
