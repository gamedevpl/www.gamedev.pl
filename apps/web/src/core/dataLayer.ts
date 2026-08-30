/**
 * A small fetch cache: request dedup (concurrent callers for the same key
 * share one in-flight fetch) plus optional TTL reuse and explicit
 * invalidation. No dependency, no persistence — memory only, per tab.
 */

interface CacheEntry<T> {
  value?: T;
  hasValue: boolean;
  expiresAt: number;
  inflight?: Promise<T>;
  // Bumped on every new fetch and on invalidateCached(); a resolving fetch
  // only writes its result if it's still the entry's current generation —
  // otherwise it lost a race with a newer fetch or an invalidation.
  generation: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

export interface FetchCachedOptions {
  /**
   * How long a resolved value is reused for a later call without
   * refetching. Default 0: only concurrent (in-flight) calls dedup;
   * a call that starts after the previous one resolved always refetches.
   */
  ttlMs?: number;
}

/**
 * Resolve `key` via `fetcher`, deduping concurrent callers onto one
 * request and reusing the resolved value for `ttlMs` after that.
 * A rejected fetch is never cached — the next call retries.
 */
export function fetchCached<T>(key: string, fetcher: () => Promise<T>, options: FetchCachedOptions = {}): Promise<T> {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry?.inflight) return entry.inflight;
  if (entry?.hasValue && entry.expiresAt > Date.now()) return Promise.resolve(entry.value as T);

  const generation = (entry?.generation ?? 0) + 1;
  const inflight: Promise<T> = fetcher().then(
    (value) => {
      if ((cache.get(key) as CacheEntry<T> | undefined)?.generation === generation) {
        cache.set(key, { value, hasValue: true, expiresAt: Date.now() + (options.ttlMs ?? 0), generation });
      }
      return value;
    },
    (error: unknown) => {
      if (cache.get(key)?.generation === generation) cache.delete(key);
      throw error;
    },
  );
  // Keeps the previous value (if any) reachable via peekCached while this
  // fetch is in flight — a "stale while revalidating" read, not a promise.
  cache.set(key, {
    ...entry,
    hasValue: entry?.hasValue ?? false,
    expiresAt: entry?.expiresAt ?? 0,
    inflight,
    generation,
  });
  return inflight;
}

/** The last resolved value for `key`, without triggering a fetch. */
export function peekCached<T>(key: string): T | undefined {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  return entry?.hasValue ? entry.value : undefined;
}

/**
 * Drops a cached value (and any TTL) so the next {@link fetchCached} call
 * for `key` issues a fresh fetch. An in-flight fetch keeps running (it
 * can't be cancelled) but its result is discarded rather than cached.
 */
export function invalidateCached(key: string): void {
  const entry = cache.get(key);
  if (!entry) return;
  // Bumps the generation and drops `inflight` (if any) so a new
  // fetchCached call always starts its own fetch instead of joining one
  // already headed for the discard. Never fully deletes the entry: doing
  // so would lose the generation counter, and a later fetch could then
  // restart at the same number a still-settling older fetch captured —
  // letting that stale result win the write it's meant to lose.
  cache.set(key, { hasValue: false, expiresAt: 0, generation: entry.generation + 1 });
}

/** {@link invalidateCached} for every key starting with `prefix`. */
export function invalidateCachedPrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) invalidateCached(key);
  }
}
