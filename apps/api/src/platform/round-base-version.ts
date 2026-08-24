// Which delivered version a round builds on.

// An undelivered round has no pointer of its own.

// Without the fallback the staging buffer becomes the whole delivery.

import type { Store, SubmissionRecord } from './store.js';

export type BaseVersionStore = Pick<Store, 'getPublication' | 'listSubmissionsByOwner'>;

// A `SubmissionRecord`, structurally.
export type BaseVersionRecord = Pick<SubmissionRecord, 'previewVersion' | 'deliveredVersion'> & {
  issueNumber?: number;
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
  return publication?.state === 'published' ? publication.currentVersion : null;
}

// Same non-abandoned, non-canceled filter `resolveOwnedRecord` applies.
async function resolveSiblingRoundVersion(
  store: BaseVersionStore,
  record: BaseVersionRecord,
  slug: string,
): Promise<string | null> {
  if (!record.ownerUid) return null;
  const owned = await store.listSubmissionsByOwner(record.ownerUid);
  const priors = owned
    .filter(
      (other) =>
        other.slug === slug &&
        other.issueNumber !== record.issueNumber &&
        !other.abandonedAt &&
        other.state !== 'canceled',
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const prior of priors) {
    const version = prior.previewVersion ?? prior.deliveredVersion;
    if (version) return version;
  }
  return null;
}
