import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { createBuildStatusAssembler } from './build-status.js';
import type { SubmissionStatusResponse } from '../platform/submission-status.js';

const JOB = 4242;

async function harness(seed = 20) {
  let clock = 1_700_000_000_000;
  const store = new InMemoryStore();
  await store.createSubmission(JOB, 'g:owner', 'Airtime');
  // Distinct stamps: prod orders on createdAt alone, so ties are arbitrary there.
  for (let i = 0; i < seed; i += 1) {
    await store.appendBuildEvent(JOB, {
      kind: 'progress',
      text: `step ${i}`,
      createdAt: new Date(clock - (seed - i) * 1_000).toISOString(),
    });
  }
  const assembler = createBuildStatusAssembler({
    store,
    now: () => clock,
    isPresenceEventText: () => false,
  });
  const list = vi.spyOn(store, 'listBuildEvents');
  const counted = vi.spyOn(store, 'countBuildEvents');
  // The creator's own poll: the feed answers to an owner.
  const poll = async () =>
    assembler.attachBuildEvents({ status: 'building' } as SubmissionStatusResponse, JOB, 'en', 'g:owner');
  return { store, assembler, list, counted, poll, tick: (ms: number) => (clock += ms), at: () => clock };
}

// A 3s poll against a 5s window: most polls miss.
describe('build event reads under a three-second poll', () => {
  it('serves an unchanged feed from a single count, never a second page', async () => {
    const { list, counted, poll, tick } = await harness();

    await poll();
    expect(list).toHaveBeenCalledTimes(1);

    tick(6_000);
    await poll();
    tick(6_000);
    await poll();

    expect(list).toHaveBeenCalledTimes(1);
    // One for the cold page at the cap, then one per probe.
    expect(counted).toHaveBeenCalledTimes(3);
  });

  it('costs one read on a full page, because the count is reused', async () => {
    const { store, list, counted, poll, tick, at } = await harness();
    await poll();
    const countsAfterSeed = counted.mock.calls.length;
    tick(6_000);
    await store.appendBuildEvent(JOB, {
      kind: 'progress',
      text: 'twenty-first',
      createdAt: new Date(at() + 1_000).toISOString(),
    });

    await poll();
    // The probe's count is carried over, not asked twice.
    expect(counted.mock.calls.length).toBe(countsAfterSeed + 1);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('asks no count at all while the page is short of the cap', async () => {
    const { counted, poll, tick } = await harness(2);
    await poll();
    expect(counted).not.toHaveBeenCalled();

    tick(6_000);
    await poll();
    // One probe, and the refreshed page is its own count.
    expect(counted).toHaveBeenCalledTimes(1);
  });

  it('still answers with the events themselves', async () => {
    const { poll, tick } = await harness();
    const before = await poll();
    tick(6_000);
    const after = await poll();
    expect(after.events).toEqual(before.events);
    expect(after.events?.length).toBeGreaterThan(0);
  });

  it('refetches the page as soon as an event is appended', async () => {
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

  // Two racing pollers must share the page, not double it.
  it('shares one read across two pollers racing the same cache miss', async () => {
    const { store, list, poll } = await harness();
    let releaseRead!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    list.mockImplementationOnce(async (...args) => {
      await gate;
      return InMemoryStore.prototype.listBuildEvents.apply(store, args);
    });

    const [first, second] = [poll(), poll()];
    releaseRead();
    await Promise.all([first, second]);

    expect(list).toHaveBeenCalledTimes(1);
  });
});

describe('build media reads under status polling', () => {
  it('serves previews and shots from 30s cache rather than re-reading every poll', async () => {
    const { store, assembler, tick } = await harness();
    await store.appendBuildPreview(JOB, { slug: 'airtime', label: 'Preview 1' });
    await store.appendBuildShot(JOB, { label: 'Shot 1' });

    const listPreviews = vi.spyOn(store, 'listBuildPreviews');
    const listShots = vi.spyOn(store, 'listBuildShots');

    const poll = async () =>
      assembler.attachBuildEvents({ status: 'building' } as SubmissionStatusResponse, JOB, 'en', 'g:owner');

    await poll();
    expect(listPreviews).toHaveBeenCalledTimes(1);
    expect(listShots).toHaveBeenCalledTimes(1);

    // After 6s, events probe expires (5s) but media cache (30s) stays cached
    tick(6_000);
    await poll();
    expect(listPreviews).toHaveBeenCalledTimes(1);
    expect(listShots).toHaveBeenCalledTimes(1);

    // After 31s, media cache expires and is re-read
    tick(25_000);
    await poll();
    expect(listPreviews).toHaveBeenCalledTimes(2);
    expect(listShots).toHaveBeenCalledTimes(2);
  });

  it('leaves media cached when only invalidateEvents fires', async () => {
    const { store, assembler, tick } = await harness();
    await store.appendBuildPreview(JOB, { slug: 'airtime', label: 'Preview 1' });
    await store.appendBuildShot(JOB, { label: 'Shot 1' });

    const listPreviews = vi.spyOn(store, 'listBuildPreviews');
    const listShots = vi.spyOn(store, 'listBuildShots');

    const poll = async () =>
      assembler.attachBuildEvents({ status: 'building' } as SubmissionStatusResponse, JOB, 'en', 'g:owner');

    await poll();
    expect(listPreviews).toHaveBeenCalledTimes(1);
    expect(listShots).toHaveBeenCalledTimes(1);

    // Must not pay for two reads on every ordinary event.
    tick(5_000);
    assembler.invalidateEvents(JOB);
    await poll();
    expect(listPreviews).toHaveBeenCalledTimes(1);
    expect(listShots).toHaveBeenCalledTimes(1);
  });

  it('invalidates previews and shots on invalidateMedia', async () => {
    const { store, assembler, tick } = await harness();
    await store.appendBuildPreview(JOB, { slug: 'airtime', label: 'Preview 1' });
    await store.appendBuildShot(JOB, { label: 'Shot 1' });

    const listPreviews = vi.spyOn(store, 'listBuildPreviews');
    const listShots = vi.spyOn(store, 'listBuildShots');

    const poll = async () =>
      assembler.attachBuildEvents({ status: 'building' } as SubmissionStatusResponse, JOB, 'en', 'g:owner');

    await poll();
    expect(listPreviews).toHaveBeenCalledTimes(1);
    expect(listShots).toHaveBeenCalledTimes(1);

    // Inside the 30s window, invalidateMedia clears the media cache specifically.
    tick(5_000);
    assembler.invalidateMedia(JOB);
    await poll();
    expect(listPreviews).toHaveBeenCalledTimes(2);
    expect(listShots).toHaveBeenCalledTimes(2);
  });

  it('shares one preview read across two pollers racing the same cache miss', async () => {
    const { store, assembler } = await harness();
    await store.appendBuildPreview(JOB, { slug: 'airtime', label: 'Preview 1' });

    let releaseRead!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const listPreviews = vi.spyOn(store, 'listBuildPreviews').mockImplementationOnce(async (...args) => {
      await gate;
      return InMemoryStore.prototype.listBuildPreviews.apply(store, args);
    });

    const poll = async () =>
      assembler.attachBuildEvents({ status: 'building' } as SubmissionStatusResponse, JOB, 'en', 'g:owner');

    const [first, second] = [poll(), poll()];
    releaseRead();
    await Promise.all([first, second]);

    expect(listPreviews).toHaveBeenCalledTimes(1);
  });

  // A read started before invalidateMedia must not repopulate the cache after it.
  it('does not let a read in flight during invalidateMedia repopulate the cache', async () => {
    const { store, assembler } = await harness();
    await store.appendBuildPreview(JOB, { slug: 'airtime', label: 'Preview 1' });

    let releaseFirstRead!: () => void;
    const firstReadGate = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    const listPreviews = vi.spyOn(store, 'listBuildPreviews').mockImplementationOnce(async (...args) => {
      await firstReadGate;
      return InMemoryStore.prototype.listBuildPreviews.apply(store, args);
    });

    const poll = async () =>
      assembler.attachBuildEvents({ status: 'building' } as SubmissionStatusResponse, JOB, 'en', 'g:owner');

    // Parked inside its read; the repair below fires before it returns.
    const firstPoll = poll();
    assembler.invalidateMedia(JOB);
    releaseFirstRead();
    await firstPoll;
    listPreviews.mockRestore();

    const listAfter = vi.spyOn(store, 'listBuildPreviews');
    await poll();
    // The stale write from the in-flight read must not have landed.
    expect(listAfter).toHaveBeenCalledTimes(1);
  });
});
