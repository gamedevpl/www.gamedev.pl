import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { createOpenRoundsWindow, OPEN_ROUNDS_WINDOW_MS } from './open-rounds-window.js';

async function storeWithRounds(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  for (const jobId of [1, 2, 3]) await store.createSubmission(jobId, 'g:ada', `Game ${jobId}`);
  return store;
}

describe('open rounds window', () => {
  it('scans once per window and re-reads only due rounds in between', async () => {
    const store = await storeWithRounds();
    const scan = vi.spyOn(store, 'listOpenRounds');
    let clock = 0;
    const window = createOpenRoundsWindow({ store, now: () => clock });

    expect(await window.read(() => true)).toHaveLength(3);
    clock += 2 * 60_000;
    await store.setSubmissionLastStatus(2, 'building');
    const get = vi.spyOn(store, 'getSubmission');
    const rounds = await window.read((record) => record.jobId === 2);

    expect(scan).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
    expect(rounds.find((record) => record.jobId === 2)?.lastStatus).toBe('building');

    clock += OPEN_ROUNDS_WINDOW_MS;
    await window.read(() => false);
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('drops a due round that closed since the scan', async () => {
    const store = await storeWithRounds();
    let clock = 0;
    const window = createOpenRoundsWindow({ store, now: () => clock });
    await window.read(() => true);
    await store.setSubmissionAbandoned(3, '2026-10-21T00:00:00.000Z');
    clock += 60_000;
    const rounds = await window.read((record) => record.jobId === 3);
    expect(rounds.map((record) => record.jobId)).toEqual([1, 2]);
  });
});
