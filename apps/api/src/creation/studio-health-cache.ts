// The studio health scan, one window. See docs/firestore-read-cost.md.

import { rememberBounded } from '../platform/bounded-map.js';
import type { GameHealth } from '../platform/telemetry-health.js';
import type { Store } from '../platform/store.js';

// Mount-driven, not polled: wide enough to outlive a reload.
export const STUDIO_HEALTH_WINDOW_MS = 10 * 60_000;

// Creators are far fewer than signed-in users.
const MAX_CACHED_SCANS = 200;

export interface StudioHealthWindow {
  days: string[];
  truncated: boolean;
  games: GameHealth[];
}

interface Entry {
  expiresAt: number;
  window: StudioHealthWindow;
}

// Keyed by store too, like the bell and catalog caches.
const caches = new WeakMap<object, Map<string, Entry>>();

function cacheFor(store: Store): Map<string, Entry> {
  const existing = caches.get(store);
  if (existing) return existing;
  const created = new Map<string, Entry>();
  caches.set(store, created);
  return created;
}

// Publishing or transferring changes the slug set, so it misses by construction.

// Play events cannot invalidate it: every session would drop the window.
export function studioHealthKey(uid: string, slugs: readonly string[], days: readonly string[]): string {
  return [uid, [...days].join(','), [...slugs].sort().join(',')].join('|');
}

// Runs `scan` on a miss, and only then.

// Rolling day partitions age keys out on their own.
export async function readStudioHealthCached(
  store: Store,
  key: string,
  scan: () => Promise<StudioHealthWindow>,
  now: () => number = Date.now,
): Promise<StudioHealthWindow> {
  const cache = cacheFor(store);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now()) return hit.window;
  const window = await scan();
  rememberBounded(cache, key, { expiresAt: now() + STUDIO_HEALTH_WINDOW_MS, window }, MAX_CACHED_SCANS);
  return window;
}

// Tests share a process; a carried window is a false pass.
export function clearStudioHealthCache(store: Store): void {
  caches.get(store)?.clear();
}
