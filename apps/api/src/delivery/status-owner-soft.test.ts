// An advisory quota hint must not fail the status poll.

import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import type { ManagedAvailabilityGate } from '../agent-surface/managed-availability.js';
import { createNativeJobStatusAssembler } from './native-job-status.js';

describe('owner resolution on a status poll', () => {
  it('falls back to the row author when the access read blips', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    const jobId = await store.allocateJobId();
    await store.createSubmission(jobId, 'g:ada', 'Sky Dodge');
    await store.setSubmissionSlug(jobId, 'sky-dodge');
    vi.spyOn(store, 'getGameAccess').mockRejectedValue(new Error('firestore is down'));
    vi.spyOn(store, 'listSubmissionsBySlug').mockRejectedValue(new Error('firestore is down'));

    const peek = vi.fn(async () => ({ available: true }) as Awaited<ReturnType<ManagedAvailabilityGate['peek']>>);
    const assembler = createNativeJobStatusAssembler({
      store,
      now: () => Date.now(),
      builderOf: () => 'platform',
      managedAvailabilityGate: { peek, checkAndSpend: peek, resolveVendor: async () => undefined },
      sessionCrashStall: () => {},
      codeSurfaceEnabled: () => true,
      isLiveAgentRound: () => false,
      selfBuildDeliveryCap: () => 10,
    });

    const record = (await store.getSubmission(jobId))!;
    const status = await assembler.nativeJobStatus(record);

    expect(status.platformBuilder).toEqual({ available: true });
    expect(peek.mock.calls[0]![0]).toBe('g:ada');
  });
});
