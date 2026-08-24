import type { Store } from './store.js';

/**
 * Creator still "owns" the slug when the newest **non-abandoned** submission for it is
 * theirs. Resolved by slug, not by paging the owner's job list.
 *
 * Abandoned jobs are skipped rather than being allowed to decide, because a round is
 * abandoned routinely — a creator cancel, an operator reject, or the `no_connect` sweep
 * retiring a self round whose agent never dialled in. Letting the newest record decide
 * outright meant one canceled improvement round made a live published game read as
 * unowned, which refuses the durable key as rotated: the same misdiagnosis this lookup
 * was rewritten to remove, reached through a smaller door.
 *
 * Skipping them is still not the old "any owned job counts" scan: a transfer moves the
 * newest live job to someone else, so ownership flips as it should, and a game whose
 * every job is abandoned has no live record and is owned by nobody.
 */
export async function creatorOwnsSlug(store: Store, slug: string, creatorUid: string): Promise<boolean> {
  const records = await store.listSubmissionsBySlug(slug);
  const newestLive = records.find((record) => !record.abandonedAt);
  return newestLive !== undefined && newestLive.ownerUid === creatorUid;
}
