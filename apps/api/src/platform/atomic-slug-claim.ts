import { mintGameSlug } from './slug.js';
import type { Store } from './store.js';
import type { SlugClaimProbe } from './slug-ownership.js';

export async function claimAvailableSlug(
  store: Pick<Store, 'claimSubmissionSlug'>,
  jobId: number,
  wanted: string,
  title: string,
  isClaimed: SlugClaimProbe,
): Promise<string | null> {
  const lost = new Set<string>();
  let candidate = wanted;
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await store.claimSubmissionSlug(jobId, candidate, null)) return candidate;
    lost.add(candidate);
    candidate = await mintGameSlug(title, async (slug) => lost.has(slug) || (await isClaimed(slug)));
  }
  return null;
}
