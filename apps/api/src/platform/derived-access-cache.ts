// Derived GameAccess, one window. See docs/firestore-read-cost.md.

import { rememberBounded } from './bounded-map.js';

// Authorization, so this matches the session-user bound, not a content window.
export const DERIVED_ACCESS_WINDOW_MS = 30_000;

// Quarantined plus repo-lane slugs, not every signed-in user.
const MAX_CACHED_SLUGS = 500;

interface Entry {
  expiresAt: number;
  value: unknown;
}

interface StoreCache {
  entries: Map<string, Entry>;
  inFlight: Map<string, Promise<unknown>>;
  // Bumped by each drop, so a read cannot seal in staleness.

  // Store-wide on purpose: one slug drop voids every in-flight seal.

  // Erasure bumps once per slug and drops unrelated concurrent reads.
  generation: number;
}

const caches = new WeakMap<object, StoreCache>();

function cacheFor(store: object): StoreCache {
  const existing = caches.get(store);
  if (existing) return existing;
  const created: StoreCache = { entries: new Map(), inFlight: new Map(), generation: 0 };
  caches.set(store, created);
  return created;
}

// Only the derived branch: a canonical hit still does the doc get.
export async function readDerivedAccessCached<T>(
  store: object,
  slug: string,
  load: () => Promise<T>,
  now: () => number = Date.now,
): Promise<T> {
  const cache = cacheFor(store);
  const hit = cache.entries.get(slug);
  if (hit && hit.expiresAt > now()) return hit.value as T;

  const pending = cache.inFlight.get(slug);
  if (pending) return pending as Promise<T>;

  const generation = cache.generation;
  const read = load()
    .then((value) => {
      if (cache.generation === generation) {
        rememberBounded(cache.entries, slug, { expiresAt: now() + DERIVED_ACCESS_WINDOW_MS, value }, MAX_CACHED_SLUGS);
      }
      return value;
    })
    .finally(() => {
      if (cache.inFlight.get(slug) === read) cache.inFlight.delete(slug);
    });
  cache.inFlight.set(slug, read);
  return read;
}

// Drops this slug: the next derived resolve hits Firestore.
export function invalidateDerivedAccess(store: object, slug: string): void {
  const cache = caches.get(store);
  if (!cache) return;
  cache.entries.delete(slug);
  cache.inFlight.delete(slug);
  cache.generation += 1;
}

export function invalidateDerivedAccessMany(store: object, slugs: readonly string[]): void {
  for (const slug of slugs) invalidateDerivedAccess(store, slug);
}

// Tests share a process; a carried window is a false pass.
export function clearDerivedAccessCache(store: object): void {
  const cache = caches.get(store);
  if (!cache) return;
  cache.entries.clear();
  cache.inFlight.clear();
  cache.generation += 1;
}
