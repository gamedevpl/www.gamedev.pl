import { resolveGameAccess } from '../platform/game-access-resolve.js';
import type { Store } from '../platform/store.js';
import type { ReviewCatalogEntry } from './review-queue-cache.js';

export async function assessmentCreatorHandle(
  store: Store,
  slug: string,
  listCatalog: () => Promise<ReviewCatalogEntry[]>,
): Promise<string | null> {
  try {
    const access = await resolveGameAccess(store, slug);
    if (access.owner.kind === 'creator') return (await store.getUser(access.owner.uid))?.handle ?? null;
    if (access.source === 'canonical' || access.owner.reason !== 'no_owner') return null;
    return (await listCatalog()).find((entry) => entry.slug === slug)?.creatorHandle ?? null;
  } catch {
    // Attribution failure must not discard a reviewer's completed assessment.
    return null;
  }
}
