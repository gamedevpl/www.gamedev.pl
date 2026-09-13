// Which delivered version a round builds on.

// An undelivered round has no pointer of its own.

// Without the fallback the staging buffer becomes the whole delivery.

import type { Store, SubmissionRecord } from './store.js';
import { publishedVersion } from '../platform/publication-state.js';

export type BaseVersionStore = Pick<Store, 'getPublication' | 'listSubmissionsByOwnerAndSlug'>;

// A `SubmissionRecord`, structurally.
export type BaseVersionRecord = Pick<SubmissionRecord, 'previewVersion' | 'deliveredVersion'> & {
  jobId?: number;
  ownerUid?: string;
};

// Own delivery, then the newest sibling round's, then the publication.
export async function resolveRoundBaseVersion(
  store: BaseVersionStore,
  record: BaseVersionRecord,
  slug: string,
): Promise<string | null> {
  const own = record.previewVersion ?? record.deliveredVersion ?? null;
  if (own) return own;

  const sibling = await resolveSiblingRoundVersion(store, record, slug);
  if (sibling) return sibling;

  const publication = await store.getPublication(slug);
  return publishedVersion(publication);
}

// Same non-abandoned, non-canceled filter `resolveOwnedRecord` applies.
async function resolveSiblingRoundVersion(
  store: BaseVersionStore,
  record: BaseVersionRecord,
  slug: string,
): Promise<string | null> {
  if (!record.ownerUid) return null;
  const owned = await store.listSubmissionsByOwnerAndSlug(record.ownerUid, slug);
  // Already newest-first and slug-scoped; only the round identity still filters.
  const priors = owned.filter(
    (other) => other.jobId !== record.jobId && !other.abandonedAt && other.state !== 'canceled',
  );
  for (const prior of priors) {
    const version = prior.previewVersion ?? prior.deliveredVersion;
    if (version) return version;
  }
  return null;
}
