// The incoming-transfer inbox, one window. See docs/firestore-read-cost.md.

import { rememberBounded } from '../platform/bounded-map.js';
import type { GameTransferInvitation, Store } from '../platform/store.js';
import { isPending } from '../store/records/game-transfer.js';

// Wider than a plausible client poll, matching the bell's window.
export const TRANSFER_INBOX_WINDOW_MS = 5 * 60_000;

// Signed-in users are unbounded in a way reviewers are not.
const MAX_CACHED_USERS = 500;

interface Entry {
  expiresAt: number;
  rows: GameTransferInvitation[];
}

interface StoreCache {
  entries: Map<string, Entry>;
  // Bumped by each invalidation, so a read cannot seal in staleness.
  generation: number;
}

// Keyed by store and uid, like the bell's cache.
const caches = new WeakMap<object, StoreCache>();

function cacheFor(store: Store): StoreCache {
  const existing = caches.get(store);
  if (existing) return existing;
  const created: StoreCache = { entries: new Map<string, Entry>(), generation: 0 };
  caches.set(store, created);
  return created;
}

// Pending incoming transfers for `uid`, from this window if fresh.
export async function readIncomingTransfersCached(
  store: Store,
  uid: string,
  at: string,
  now: () => number = Date.now,
): Promise<GameTransferInvitation[]> {
  const cache = cacheFor(store);
  const hit = cache.entries.get(uid);
  // Rows are cached against an earlier `at`; one may have expired since.
  if (hit && hit.expiresAt > now()) return hit.rows.filter((row) => isPending(row, at));
  const generation = cache.generation;
  const rows = await store.listPendingGameTransfersForRecipient(uid, at);
  // A write landed mid-read, so these rows are already stale.
  if (cache.generation === generation) {
    rememberBounded(cache.entries, uid, { expiresAt: now() + TRANSFER_INBOX_WINDOW_MS, rows }, MAX_CACHED_USERS);
  }
  return rows;
}

// Drops this user's window: their next read goes to the store.
export function invalidateTransferInboxCache(store: Store, uid: string): void {
  const cache = caches.get(store);
  if (!cache) return;
  cache.entries.delete(uid);
  cache.generation += 1;
}
