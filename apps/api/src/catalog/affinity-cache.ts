import { rememberBounded } from '../platform/bounded-map.js';
import type { Store } from '../platform/store.js';
import type { PlayAffinityRecord } from '../store/records/player-data.js';

// One read per game the player ever opened, on every home load.
export const AFFINITY_WINDOW_MS = 60_000;

const MAX_CACHED_PLAYERS = 500;

interface Entry {
  expiresAt: number;
  rows: PlayAffinityRecord[];
}

interface StoreCache {
  entries: Map<string, Entry>;
  inFlight: Map<string, Promise<PlayAffinityRecord[]>>;
  generation: number;
}

const caches = new WeakMap<Store, StoreCache>();

function cacheFor(store: Store): StoreCache {
  const existing = caches.get(store);
  if (existing) return existing;
  const created: StoreCache = { entries: new Map<string, Entry>(), inFlight: new Map(), generation: 0 };
  caches.set(store, created);
  return created;
}

export async function readPlayAffinityCached(
  store: Store,
  uid: string,
  now: () => number = Date.now,
): Promise<PlayAffinityRecord[]> {
  const cache = cacheFor(store);
  const hit = cache.entries.get(uid);
  if (hit && hit.expiresAt > now()) return hit.rows;
  // A burst of tabs on a cold window is still one query.
  const pending = cache.inFlight.get(uid);
  if (pending) return pending;

  const generation = cache.generation;
  const read = store
    .listPlayAffinity(uid)
    .then((rows) => {
      // A play landed mid-read, so these rows are already stale.
      if (cache.generation === generation) {
        rememberBounded(cache.entries, uid, { expiresAt: now() + AFFINITY_WINDOW_MS, rows }, MAX_CACHED_PLAYERS);
      }
      return rows;
    })
    .finally(() => {
      cache.inFlight.delete(uid);
    });
  cache.inFlight.set(uid, read);
  return read;
}

// Dropped the moment they play: their own shelf stays true.
export function invalidatePlayAffinity(store: Store, uid: string): void {
  const cache = caches.get(store);
  if (!cache) return;
  cache.entries.delete(uid);
  cache.generation += 1;
}
