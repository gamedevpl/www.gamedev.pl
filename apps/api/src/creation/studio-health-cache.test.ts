import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import {
  readStudioHealthCached,
  STUDIO_HEALTH_WINDOW_MS,
  studioHealthKey,
  type StudioHealthWindow,
} from './studio-health-cache.js';

function window(days: string[]): StudioHealthWindow {
  return { days, truncated: false, games: [] };
}

describe('studioHealthKey', () => {
  it('separates creators, day sets and slug sets', () => {
    const base = studioHealthKey('g:a', ['one'], ['2026-09-15']);
    expect(studioHealthKey('g:b', ['one'], ['2026-09-15'])).not.toBe(base);
    expect(studioHealthKey('g:a', ['one', 'two'], ['2026-09-15'])).not.toBe(base);
    expect(studioHealthKey('g:a', ['one'], ['2026-09-14'])).not.toBe(base);
  });

  it('ignores the order slugs arrive in', () => {
    expect(studioHealthKey('g:a', ['two', 'one'], ['2026-09-15'])).toBe(
      studioHealthKey('g:a', ['one', 'two'], ['2026-09-15']),
    );
  });
});

describe('readStudioHealthCached', () => {
  it('scans once inside the window', async () => {
    const store = new InMemoryStore();
    const scan = vi.fn(async () => window(['2026-09-15']));
    const key = studioHealthKey('g:a', ['one'], ['2026-09-15']);

    const first = await readStudioHealthCached(store, key, scan, () => 1_000);
    const second = await readStudioHealthCached(store, key, scan, () => 1_000 + STUDIO_HEALTH_WINDOW_MS - 1);

    expect(scan).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('scans once for two requests that race a cold key', async () => {
    const store = new InMemoryStore();
    let release: (value: StudioHealthWindow) => void = () => {};
    const scan = vi.fn(
      () =>
        new Promise<StudioHealthWindow>((resolve) => {
          release = resolve;
        }),
    );
    const key = studioHealthKey('g:a', ['one'], ['2026-09-15']);

    const first = readStudioHealthCached(store, key, scan, () => 1_000);
    const second = readStudioHealthCached(store, key, scan, () => 1_000);
    release(window(['2026-09-15']));

    expect(await second).toEqual(await first);
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('does not leave a failed scan as the answer for the next request', async () => {
    const store = new InMemoryStore();
    const scan = vi
      .fn<() => Promise<StudioHealthWindow>>()
      .mockRejectedValueOnce(new Error('firestore down'))
      .mockResolvedValueOnce(window(['2026-09-15']));
    const key = studioHealthKey('g:a', ['one'], ['2026-09-15']);

    await expect(readStudioHealthCached(store, key, scan, () => 1_000)).rejects.toThrow('firestore down');
    await expect(readStudioHealthCached(store, key, scan, () => 1_000)).resolves.toEqual(window(['2026-09-15']));
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('scans again once the window has passed', async () => {
    const store = new InMemoryStore();
    const scan = vi.fn(async () => window(['2026-09-15']));
    const key = studioHealthKey('g:a', ['one'], ['2026-09-15']);

    await readStudioHealthCached(store, key, scan, () => 1_000);
    await readStudioHealthCached(store, key, scan, () => 1_000 + STUDIO_HEALTH_WINDOW_MS);

    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('never answers one creator from another creator’s window', async () => {
    const store = new InMemoryStore();
    const mine = vi.fn(async () => window(['mine']));
    const theirs = vi.fn(async () => window(['theirs']));

    await readStudioHealthCached(store, studioHealthKey('g:a', ['one'], ['d']), mine, () => 1_000);
    const other = await readStudioHealthCached(store, studioHealthKey('g:b', ['one'], ['d']), theirs, () => 1_000);

    expect(other.days).toEqual(['theirs']);
  });

  it('misses when a newly published slug joins the set', async () => {
    const store = new InMemoryStore();
    const scan = vi.fn(async () => window(['2026-09-15']));

    await readStudioHealthCached(store, studioHealthKey('g:a', ['one'], ['d']), scan, () => 1_000);
    await readStudioHealthCached(store, studioHealthKey('g:a', ['one', 'two'], ['d']), scan, () => 1_000);

    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('keeps one store’s window out of another store’s', async () => {
    const first = new InMemoryStore();
    const second = new InMemoryStore();
    const scan = vi.fn(async () => window(['2026-09-15']));
    const key = studioHealthKey('g:a', ['one'], ['d']);

    await readStudioHealthCached(first, key, scan, () => 1_000);
    await readStudioHealthCached(second, key, scan, () => 1_000);

    expect(scan).toHaveBeenCalledTimes(2);
  });
});
