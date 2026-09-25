import { canActOnGame } from '../platform/game-access-permissions.js';
import { resolveGameAccess } from '../platform/game-access-resolve.js';
import type { Store } from '../platform/store.js';

// Fails closed: no lookup, or one that cannot answer, means absent.
export async function isRepoPublished(
  lookup: ((slug: string) => Promise<object | null>) | undefined,
  slug: string,
): Promise<boolean> {
  return lookup ? (await lookup(slug).catch(() => null)) !== null : false;
}

// Creator sources stay with members; platform games fork freely.
export async function canSaveRemix(store: Store | undefined, slug: string, uid: string): Promise<boolean> {
  if (!store) return false;
  const access = await resolveGameAccess(store, slug);
  return access.owner.kind !== 'creator' || canActOnGame(access, uid, 'read');
}
