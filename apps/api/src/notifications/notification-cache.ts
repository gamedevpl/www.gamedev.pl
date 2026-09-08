// The bell's list, one window. See docs/firestore-read-cost.md.

import { rememberBounded } from '../platform/bounded-map.js';
import type { Store } from '../platform/store.js';
import type { StoredNotification } from '../store/records/notifications.js';

// Wider than the bell's sixty-second poll, or nothing hits.
export const NOTIFICATION_WINDOW_MS = 5 * 60_000;

// Signed-in users are unbounded in a way reviewers are not.
const MAX_CACHED_USERS = 500;

interface Entry {
  expiresAt: number;
  limit: number;
  rows: StoredNotification[];
}

// Keyed by store as well as uid, like the catalog enrichment cache.
const caches = new WeakMap<object, Map<string, Entry>>();

function cacheFor(store: Store): Map<string, Entry> {
  const existing = caches.get(store);
  if (existing) return existing;
  const created = new Map<string, Entry>();
  caches.set(store, created);
  return created;
}

// The most recent `limit` rows for `uid`, from this window if fresh.
export async function readNotificationsCached(
  store: Store,
  uid: string,
  limit: number,
  now: () => number = Date.now,
): Promise<StoredNotification[]> {
  const cache = cacheFor(store);
  const hit = cache.get(uid);
  // A wider request than the window holds cannot be sliced from it.
  if (hit && hit.expiresAt > now() && hit.limit >= limit) return hit.rows.slice(0, limit);
  const rows = await store.listNotifications(uid, { limit });
  rememberBounded(cache, uid, { expiresAt: now() + NOTIFICATION_WINDOW_MS, limit, rows }, MAX_CACHED_USERS);
  return rows;
}

// Drops this user's window: their next read goes to Firestore.
export function invalidateNotificationCache(store: Store, uid: string): void {
  caches.get(store)?.delete(uid);
}
