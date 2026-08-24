import type { Store } from './store.js';

// Owns = newest non-abandoned submission for the slug is theirs.

// Abandoned rounds are skipped so a cancel cannot unown a published game.
export async function creatorOwnsSlug(store: Store, slug: string, creatorUid: string): Promise<boolean> {
  const records = await store.listSubmissionsBySlug(slug);
  const newestLive = records.find((record) => !record.abandonedAt);
  return newestLive !== undefined && newestLive.ownerUid === creatorUid;
}
