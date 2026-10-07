// Lets the shell 404 profile paths no creator holds.

import { toPublicCreatorProfile } from './creator-profile.js';
import { creatorHandleFromPath } from './spa-path-kinds.js';
import type { Store } from './store.js';

export const CREATOR_NOT_FOUND: unique symbol = Symbol('creator-not-found');

const TTL_MS = 60_000;
const CACHE_MAX = 256;
// Every five-letter path is a handle shape; lookups stay bounded.
const LOOKUP_BUDGET = 60;

type CreatorStore = Pick<Store, 'getUserByHandle' | 'getHandleReservation' | 'getUser'>;

// Mirrors GET /api/creators/:handle: a renamed handle still resolves.
async function creatorExists(store: CreatorStore, handle: string): Promise<boolean> {
  const user = await store.getUserByHandle(handle);
  if (user && toPublicCreatorProfile(user)) return true;
  const reservation = await store.getHandleReservation(handle);
  if (!reservation?.releasedAt || !reservation.previousUid) return false;
  const renamed = await store.getUser(reservation.previousUid);
  return Boolean(renamed && toPublicCreatorProfile(renamed));
}

// CREATOR_NOT_FOUND for a handle nobody holds, else null. Never throws.
export function createCreatorShellStatus(store: CreatorStore, now: () => number = Date.now) {
  const cache = new Map<string, { missing: boolean; expiresAt: number }>();
  let lookupsLeft = 0;
  let windowEndsAt = 0;

  function spendLookup(): boolean {
    if (now() >= windowEndsAt) {
      windowEndsAt = now() + TTL_MS;
      lookupsLeft = LOOKUP_BUDGET;
    }
    if (lookupsLeft <= 0) return false;
    lookupsLeft -= 1;
    return true;
  }

  return async (request: { url: string }): Promise<typeof CREATOR_NOT_FOUND | null> => {
    const handle = creatorHandleFromPath(request.url);
    if (!handle) return null;
    const cached = cache.get(handle);
    if (cached && cached.expiresAt > now()) return cached.missing ? CREATOR_NOT_FOUND : null;
    if (!spendLookup()) return null;
    try {
      const missing = !(await creatorExists(store, handle));
      cache.delete(handle);
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(handle, { missing, expiresAt: now() + TTL_MS });
      return missing ? CREATOR_NOT_FOUND : null;
    } catch {
      return null;
    }
  };
}
