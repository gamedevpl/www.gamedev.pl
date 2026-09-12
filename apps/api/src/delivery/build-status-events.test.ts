import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { createBuildStatusAssembler } from './build-status.js';
import type { SubmissionStatusResponse } from '../platform/submission-status.js';

const JOB = 4242;

async function harness() {
  let clock = 1_700_000_000_000;
  const store = new InMemoryStore();
  await store.createSubmission(JOB, 'g:owner', 'Airtime');
  // Distinct stamps: prod orders on createdAt alone, so ties are arbitrary there.
  for (let i = 0; i < 20; i += 1) {
    await store.appendBuildEvent(JOB, {
      kind: 'progress',
      text: `step ${i}`,
      createdAt: new Date(clock - (20 - i) * 1_000).toISOString(),
    });
  }
  const assembler = createBuildStatusAssembler({
    store,
    now: () => clock,
    isPresenceEventText: () => false,
  });
  const list = vi.spyOn(store, 'listBuildEvents');
  const poll = async () =>
    assembler.attachBuildEvents({ status: 'building' } as SubmissionStatusResponse, JOB, 'en');
  return { store, assembler, list, poll, tick: (ms: number) => (clock += ms), at: () => clock };
}

// A 3s poll against a 5s window: most polls miss.
describe('build event reads under a three-second poll', () => {
  it('serves an unchanged feed from a one-document probe, not a full page', async () => {
    const { list, poll, tick } = await harness();

    await poll();
    const first = list.mock.calls.at(-1)?.[1];
    expect(first).toMatchObject({ limit: 20 });

    tick(6_000);
    await poll();
    expect(list.mock.calls.at(-1)?.[1]).toMatchObject({ limit: 1 });

    tick(6_000);
    await poll();
    expect(list.mock.calls.at(-1)?.[1]).toMatchObject({ limit: 1 });
    expect(list.mock.calls.filter((c) => c[1]?.limit === 20)).toHaveLength(1);
  });

  it('probes the count too, so a tie on createdAt cannot hide an append', async () => {
    const { store, list, poll, tick } = await harness();
    const counted = vi.spyOn(store, 'countBuildEvents');
    await poll();
    tick(6_000);
    await poll();
    expect(counted).toHaveBeenCalled();
    expect(list.mock.calls.filter((c) => c[1]?.limit === 20)).toHaveLength(1);
  });

  it('still answers with the events themselves', async () => {
    const { poll, tick } = await harness();
    const before = await poll();
    tick(6_000);
    const after = await poll();
    expect(after.events).toEqual(before.events);
    expect(after.events?.length).toBeGreaterThan(0);
  });

  it('refetches the page as soon as the newest event changes', async () => {
    const { store, list, poll, tick, at } = await harness();
    await poll();
    tick(6_000);
    await store.appendBuildEvent(JOB, {
      kind: 'progress',
      text: 'something new',
      createdAt: new Date(at() + 1_000).toISOString(),
    });
    const fresh = await poll();

    expect(list.mock.calls.at(-1)?.[1]).toMatchObject({ limit: 20 });
    expect(fresh.events?.some((event) => event.text === 'something new')).toBe(true);
  });

  it('takes a full page again once the probe window lapses', async () => {
    const { list, poll, tick } = await harness();
    await poll();
    tick(61_000);
    await poll();
    expect(list.mock.calls.filter((c) => c[1]?.limit === 20)).toHaveLength(2);
  });

  it('reads the page in full after an append on this instance', async () => {
    const { assembler, list, poll, tick } = await harness();
    await poll();
    tick(1_000);
    assembler.invalidateEvents(JOB);
    await poll();
    expect(list.mock.calls.filter((c) => c[1]?.limit === 20)).toHaveLength(2);
  });
});
