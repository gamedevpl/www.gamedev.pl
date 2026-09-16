import { rememberBounded } from '../platform/bounded-map.js';
import type { GameEditorInvitation, Store } from '../platform/store.js';
import { isPendingEditorInvite } from '../store/records/game-editor-invite.js';

export const EDITOR_INVITE_INBOX_WINDOW_MS = 5 * 60_000;

const MAX_CACHED_USERS = 500;

interface Entry {
  expiresAt: number;
  rows: GameEditorInvitation[];
}

interface StoreCache {
  entries: Map<string, Entry>;
  generation: number;
}

const caches = new WeakMap<object, StoreCache>();

function cacheFor(store: Store): StoreCache {
  const existing = caches.get(store);
  if (existing) return existing;
  const created: StoreCache = { entries: new Map<string, Entry>(), generation: 0 };
  caches.set(store, created);
  return created;
}

export async function readIncomingEditorInvitesCached(
  store: Store,
  uid: string,
  at: string,
  now: () => number = Date.now,
): Promise<GameEditorInvitation[]> {
  const cache = cacheFor(store);
  const hit = cache.entries.get(uid);
  if (hit && hit.expiresAt > now()) return hit.rows.filter((row) => isPendingEditorInvite(row, at));
  const generation = cache.generation;
  const rows = await store.listPendingEditorInvitesForRecipient(uid, at);
  if (cache.generation === generation) {
    rememberBounded(cache.entries, uid, { expiresAt: now() + EDITOR_INVITE_INBOX_WINDOW_MS, rows }, MAX_CACHED_USERS);
  }
  return rows;
}

export function invalidateEditorInviteInboxCache(store: Store, uid: string): void {
  const cache = caches.get(store);
  if (!cache) return;
  cache.entries.delete(uid);
  cache.generation += 1;
}
