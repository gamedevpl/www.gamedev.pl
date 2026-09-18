import { describe, expect, it, vi } from 'vitest';
import {
  DERIVED_ACCESS_WINDOW_MS,
  clearDerivedAccessCache,
  invalidateDerivedAccess,
  readDerivedAccessCached,
} from './derived-access-cache.js';

describe('derived access window', () => {
  it('loads once across a window of polls', async () => {
    const store = {};
    const load = vi.fn(async () => 'ada');
    let clock = 1_700_000_000_000;

    for (let i = 0; i < 5; i += 1) {
      expect(await readDerivedAccessCached(store, 'legacy-shared', load, () => clock)).toBe('ada');
      clock += 5_000;
    }
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('loads again once the window is over', async () => {
    const store = {};
    const load = vi.fn(async () => 'ada');
    let clock = 1_700_000_000_000;

    await readDerivedAccessCached(store, 'legacy-shared', load, () => clock);
    clock += DERIVED_ACCESS_WINDOW_MS;
    await readDerivedAccessCached(store, 'legacy-shared', load, () => clock);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('loads once for two requests that race a cold key', async () => {
    const store = {};
    let release: (value: string) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );

    const first = readDerivedAccessCached(store, 'legacy-shared', load, () => 1_000);
    const second = readDerivedAccessCached(store, 'legacy-shared', load, () => 1_000);
    release('ada');
    expect(await second).toBe(await first);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not leave a failed load as the answer for the next request', async () => {
    const store = {};
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('firestore down'))
      .mockResolvedValueOnce('ada');

    await expect(readDerivedAccessCached(store, 'legacy-shared', load, () => 1_000)).rejects.toThrow('firestore down');
    await expect(readDerivedAccessCached(store, 'legacy-shared', load, () => 1_000)).resolves.toBe('ada');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('never answers one slug from another slug window', async () => {
    const store = {};
    const clock = () => 1_000;
    await readDerivedAccessCached(store, 'legacy-shared', async () => 'grace', clock);
    expect(await readDerivedAccessCached(store, 'other-game', async () => 'hopper', clock)).toBe('hopper');
  });

  it('keeps one store window out of another store', async () => {
    const first = {};
    const second = {};
    const load = vi.fn(async () => 'ada');
    const clock = () => 1_000;

    await readDerivedAccessCached(first, 'legacy-shared', load, clock);
    await readDerivedAccessCached(second, 'legacy-shared', load, clock);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('drops the window when asked, so the next read goes to the store', async () => {
    const store = {};
    const load = vi.fn(async () => 'ada');
    const clock = () => 1_000;

    await readDerivedAccessCached(store, 'legacy-shared', load, clock);
    invalidateDerivedAccess(store, 'legacy-shared');
    await readDerivedAccessCached(store, 'legacy-shared', load, clock);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not seal a value a write dropped during the read', async () => {
    const store = {};
    const clock = () => 1_000;
    const load = vi.fn(async () => {
      invalidateDerivedAccess(store, 'legacy-shared');
      return 'stale';
    });

    await readDerivedAccessCached(store, 'legacy-shared', load, clock);
    const listed = vi.fn(async () => 'fresh');
    expect(await readDerivedAccessCached(store, 'legacy-shared', listed, clock)).toBe('fresh');
    expect(listed).toHaveBeenCalledTimes(1);
  });

  it('clearDerivedAccessCache forgets a sealed window', async () => {
    const store = {};
    const load = vi.fn(async () => 'ada');
    const clock = () => 1_000;

    await readDerivedAccessCached(store, 'legacy-shared', load, clock);
    clearDerivedAccessCache(store);
    await readDerivedAccessCached(store, 'legacy-shared', load, clock);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not reseal a read that was in flight when the cache was cleared', async () => {
    const store = {};
    const clock = () => 1_000;
    const load = vi.fn(async () => {
      clearDerivedAccessCache(store);
      return 'stale';
    });

    await readDerivedAccessCached(store, 'legacy-shared', load, clock);
    const listed = vi.fn(async () => 'fresh');
    expect(await readDerivedAccessCached(store, 'legacy-shared', listed, clock)).toBe('fresh');
    expect(listed).toHaveBeenCalledTimes(1);
  });
});
