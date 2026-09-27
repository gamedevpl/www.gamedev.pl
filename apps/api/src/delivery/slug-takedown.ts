import type { Store } from '../platform/store.js';

export async function isSlugTakenDown(store: Pick<Store, 'listSubmissionsBySlug'>, slug: string): Promise<boolean> {
  const siblings = await store.listSubmissionsBySlug(slug);
  return !siblings.length || siblings.some((round) => Boolean(round.moderationBlockedAt));
}
