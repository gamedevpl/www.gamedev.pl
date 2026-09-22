// A store blip must not fail the status poll.

import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import type { ManagedAvailabilityGate } from '../agent-surface/managed-availability.js';
import { createBuildStatusAssembler } from './build-status.js';

describe('owner resolution on a status poll', () => {
  it('answers without the member-only half when the access read blips', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    const jobId = await store.allocateJobId();
    await store.createSubmission(jobId, 'g:ada', 'Sky Dodge');
    await store.setSubmissionSlug(jobId, 'sky-dodge');
    vi.spyOn(store, 'getGameAccess').mockRejectedValue(new Error('firestore is down'));
    vi.spyOn(store, 'listSubmissionsBySlug').mockRejectedValue(new Error('firestore is down'));

    const peek = vi.fn(async () => ({ available: true }) as Awaited<ReturnType<ManagedAvailabilityGate['peek']>>);
    const assembler = createBuildStatusAssembler({
      store,
      now: () => Date.now(),
      managedAvailabilityGate: { peek, checkAndSpend: peek, resolveVendor: async () => undefined },
      isPresenceEventText: () => false,
    });

    // The owner's own poll, during a blip that makes membership unreadable.
    const status = await assembler.attachBuildEvents({ status: 'queued' }, jobId, 'en', 'g:ada');

    expect(status.status).toBe('queued');
    // Denied, not thrown: unreadable membership is not membership.
    expect(status.platformBuilder).toBeUndefined();
    expect(peek).not.toHaveBeenCalled();
    expect(status.events).toBeUndefined();
  });

  it('resolves the quota against the current owner when the access read works', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    const jobId = await store.allocateJobId();
    await store.createSubmission(jobId, 'g:ada', 'Sky Dodge');
    await store.setSubmissionSlug(jobId, 'sky-dodge');
    const at = (await store.getSubmission(jobId))!.createdAt;
    await store.ensureGameAccess('sky-dodge', 'g:ada', at, at);

    const peek = vi.fn(async () => ({ available: true }) as Awaited<ReturnType<ManagedAvailabilityGate['peek']>>);
    const assembler = createBuildStatusAssembler({
      store,
      now: () => Date.now(),
      managedAvailabilityGate: { peek, checkAndSpend: peek, resolveVendor: async () => undefined },
      isPresenceEventText: () => false,
    });

    const status = await assembler.attachBuildEvents({ status: 'queued' }, jobId, 'en', 'g:ada');

    expect(status.platformBuilder).toEqual({ available: true });
    expect(peek.mock.calls[0]![0]).toBe('g:ada');
  });
});
