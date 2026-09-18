// Derived ownership only. Canonical stays a single doc get.

import { rememberBounded } from './bounded-map.js';
import type { ResolvedGameAccess } from './game-access-resolve.js';

// Sized for a former owner reading chat, not for the saving.
export const DERIVED_ACCESS_WINDOW_MS = 30_000;

const MAX_CACHED_SLUGS = 500;

interface Entry {
  expiresAt: number;
  access: ResolvedGameAccess;
}

interface StoreCache {
  entries: Map<string, Entry>;
  inFlight: Map<string, Promise<ResolvedGameAccess>>;
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

export async function readDerivedGameAccessCached(
  store: object,
  slug: string,
  load: () => Promise<ResolvedGameAccess>,
  now: () => number = Date.now,
): Promise<ResolvedGameAccess> {
  const cache = cacheFor(store);
  const hit = cache.entries.get(slug);
  if (hit && hit.expiresAt > now()) return hit.access;

  const pending = cache.inFlight.get(slug);
  if (pending) return pending;

  const generation = cache.generation;
  const reading = load()
    .then((access) => {
      if (cache.generation === generation) {
        rememberBounded(cache.entries, slug, { expiresAt: now() + DERIVED_ACCESS_WINDOW_MS, access }, MAX_CACHED_SLUGS);
      }
      return access;
    })
    .finally(() => {
      cache.inFlight.delete(slug);
    });
  cache.inFlight.set(slug, reading);
  return reading;
}

export function invalidateDerivedGameAccess(store: object, slug: string): void {
  const cache = caches.get(store);
  if (!cache) return;
  cache.entries.delete(slug);
  cache.generation += 1;
}

export function invalidateAllDerivedGameAccess(store: object): void {
  const cache = caches.get(store);
  if (!cache) return;
  cache.entries.clear();
  cache.generation += 1;
}

export function clearDerivedGameAccessCache(store: object): void {
  const cache = caches.get(store);
  if (!cache) return;
  cache.entries.clear();
  cache.inFlight.clear();
}
