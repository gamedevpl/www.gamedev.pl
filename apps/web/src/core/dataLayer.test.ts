import { describe, expect, it, vi } from 'vitest';
import { fetchCached, invalidateCached, invalidateCachedPrefix, peekCached } from './dataLayer.js';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('fetchCached', () => {
  it('dedups concurrent callers onto one fetch', async () => {
    const key = `dedup:${Math.random()}`;
    const d = deferred<string>();
    const fetcher = vi.fn(() => d.promise);

    const first = fetchCached(key, fetcher);
    const second = fetchCached(key, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);

    d.resolve('v');
    expect(await first).toBe('v');
    expect(await second).toBe('v');
  });

  it('refetches on the next call by default (ttlMs: 0)', async () => {
    const key = `no-ttl:${Math.random()}`;
    const fetcher = vi.fn(async () => 'v');

    await fetchCached(key, fetcher);
    await fetchCached(key, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reuses a resolved value within ttlMs, then refetches after it expires', async () => {
    const key = `ttl:${Math.random()}`;
    let value = 'first';
    const fetcher = vi.fn(async () => value);

    expect(await fetchCached(key, fetcher, { ttlMs: 10_000 })).toBe('first');
    value = 'second';
    expect(await fetchCached(key, fetcher, { ttlMs: 10_000 })).toBe('first');
    expect(fetcher).toHaveBeenCalledTimes(1);

    invalidateCached(key);
    expect(await fetchCached(key, fetcher, { ttlMs: 10_000 })).toBe('second');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('never caches a rejection — the next call retries', async () => {
    const key = `reject:${Math.random()}`;
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');

    await expect(fetchCached(key, fetcher)).rejects.toThrow('boom');
    expect(await fetchCached(key, fetcher)).toBe('ok');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps different keys independent', async () => {
    const fetcherA = vi.fn(async () => 'a');
    const fetcherB = vi.fn(async () => 'b');
    const keyA = `indep-a:${Math.random()}`;
    const keyB = `indep-b:${Math.random()}`;

    expect(await fetchCached(keyA, fetcherA)).toBe('a');
    expect(await fetchCached(keyB, fetcherB)).toBe('b');
    expect(fetcherA).toHaveBeenCalledTimes(1);
    expect(fetcherB).toHaveBeenCalledTimes(1);
  });
});

describe('peekCached', () => {
  it('is undefined before the first resolution and set after', async () => {
    const key = `peek:${Math.random()}`;
    expect(peekCached(key)).toBeUndefined();
    await fetchCached(key, async () => 'v');
    expect(peekCached(key)).toBe('v');
  });

  it('returns the stale value while a refetch is in flight', async () => {
    const key = `peek-stale:${Math.random()}`;
    await fetchCached(key, async () => 'first', { ttlMs: 0 });
    expect(peekCached(key)).toBe('first');

    const d = deferred<string>();
    const refetch = fetchCached(key, () => d.promise);
    expect(peekCached(key)).toBe('first');

    d.resolve('second');
    await refetch;
    expect(peekCached(key)).toBe('second');
  });
});

describe('invalidateCached', () => {
  it('clears a resolved value so the next call refetches', async () => {
    const key = `invalidate:${Math.random()}`;
    const fetcher = vi.fn(async () => 'v');
    await fetchCached(key, fetcher, { ttlMs: 10_000 });

    invalidateCached(key);
    expect(peekCached(key)).toBeUndefined();
    await fetchCached(key, fetcher, { ttlMs: 10_000 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('lets an in-flight fetch resolve for its callers but discards its result', async () => {
    const key = `invalidate-inflight:${Math.random()}`;
    const d = deferred<string>();
    const call = fetchCached(key, () => d.promise, { ttlMs: 10_000 });

    invalidateCached(key);
    d.resolve('stale');
    expect(await call).toBe('stale');

    expect(peekCached(key)).toBeUndefined();
    const fetcher = vi.fn(async () => 'fresh');
    expect(await fetchCached(key, fetcher, { ttlMs: 10_000 })).toBe('fresh');
  });

  it('is a no-op for an unknown key', () => {
    expect(() => invalidateCached(`unknown:${Math.random()}`)).not.toThrow();
  });

  it('never lets a long-settling fetch overwrite a newer one after two invalidations', async () => {
    // Regression: invalidateCached used to `cache.delete` a settled (non-in-flight)
    // entry, losing its generation counter. The next fetch would then restart
    // numbering from 1 — the same number this test's first, still-pending fetch
    // captured — so its late resolution could win the write it should have lost.
    const key = `regression-generation:${Math.random()}`;
    const dStale = deferred<string>();
    const staleCall = fetchCached(key, () => dStale.promise, { ttlMs: 10_000 });

    invalidateCached(key); // tombstones the still-in-flight first fetch

    expect(await fetchCached(key, async () => 'settled', { ttlMs: 10_000 })).toBe('settled');
    invalidateCached(key); // invalidates that now-settled value

    const dThird = deferred<string>();
    const thirdCall = fetchCached(key, () => dThird.promise, { ttlMs: 10_000 });

    dStale.resolve('stale');
    expect(await staleCall).toBe('stale');
    expect(peekCached(key)).toBeUndefined(); // the stale write must be rejected, not cached

    dThird.resolve('third');
    expect(await thirdCall).toBe('third');
    expect(peekCached(key)).toBe('third');
  });
});

describe('invalidateCachedPrefix', () => {
  it('invalidates only keys under the prefix', async () => {
    const suffix = Math.random();
    const keyIn = `prefix:${suffix}:a`;
    const keyOut = `other:${suffix}:a`;
    await fetchCached(keyIn, async () => 'v', { ttlMs: 10_000 });
    await fetchCached(keyOut, async () => 'v', { ttlMs: 10_000 });

    invalidateCachedPrefix(`prefix:${suffix}:`);
    expect(peekCached(keyIn)).toBeUndefined();
    expect(peekCached(keyOut)).toBe('v');
  });
});
