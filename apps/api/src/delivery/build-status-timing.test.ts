import { expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { createBuildStatusAssembler } from './build-status.js';

it('refreshes the round start even when the status and event history are cached', async () => {
  const store = new InMemoryStore();
  await store.createSubmission(42, 'g:owner', 'Tiny Torque');
  const record = (await store.getSubmission(42))!;
  const read = vi.spyOn(store, 'getSubmission');
  const assembler = createBuildStatusAssembler({ store, now: () => Date.now(), isPresenceEventText: () => false });
  const poll = () => assembler.attachBuildEvents({ status: 'building', roundStartedAt: 'stale' }, 42, 'en');

  read.mockResolvedValue({ ...record, roundStartedAt: '2026-10-20T20:59:35.000Z' });
  expect((await poll()).roundStartedAt).toBe('2026-10-20T20:59:35.000Z');
  read.mockResolvedValue({ ...record, roundStartedAt: '2026-10-20T21:10:00.000Z' });
  expect((await poll()).roundStartedAt).toBe('2026-10-20T21:10:00.000Z');
  read.mockResolvedValue({ ...record, roundStartedAt: undefined });
  expect((await poll()).roundStartedAt).toBe(record.createdAt);
});
