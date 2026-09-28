// Which delivered version a round builds on.

// An undelivered round has no pointer of its own.

// Without the fallback the staging buffer becomes the whole delivery.

import type { Store, SubmissionRecord } from './store.js';
import { publishedVersion } from '../platform/publication-state.js';
import { canActOnGame } from './game-access-permissions.js';
import { resolveGameAccess } from './game-access-resolve.js';

export type BaseVersionStore = Pick<Store, 'getPublication' | 'listSubmissionsBySlug'>;

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

type AuthorizedBaseVersionStore = BaseVersionStore & Pick<Store, 'getGameAccess' | 'getPublishedSubmissionBySlug'>;

// A bound slug does not prove access to earlier sources.
export async function resolveAuthorizedRoundBaseVersion(
  store: AuthorizedBaseVersionStore,
  record: BaseVersionRecord & Pick<SubmissionRecord, 'ownerUid'>,
  slug: string,
  actorUid = record.ownerUid,
): Promise<string | null> {
  const own = record.previewVersion ?? record.deliveredVersion ?? null;
  if (own) return own;

  const access = await resolveGameAccess(store, slug);
  if (access.source === 'canonical' && !canActOnGame(access, actorUid, 'read')) return null;
  const priors = (await store.listSubmissionsBySlug(slug)).filter(
    (other) =>
      other.jobId !== record.jobId &&
      !other.abandonedAt &&
      other.state !== 'canceled' &&
      (access.source === 'canonical' || other.ownerUid === record.ownerUid),
  );
  for (const prior of priors) {
    const version = prior.previewVersion ?? prior.deliveredVersion;
    if (version) return version;
  }

  const publication = await store.getPublication(slug);
  const version = publishedVersion(publication);
  if (!version) return null;
  const published = await store.getPublishedSubmissionBySlug(slug);
  if (!published || published.jobId === record.jobId) return null;
  if (access.source === 'derived' && published.ownerUid !== record.ownerUid) return null;
  return version;
}

// Same non-abandoned, non-canceled filter `resolveOwnedRecord` applies.
async function resolveSiblingRoundVersion(
  store: BaseVersionStore,
  record: BaseVersionRecord,
  slug: string,
): Promise<string | null> {
  // Every round on the slug: a first round after transfer has none.
  const onSlug = await store.listSubmissionsBySlug(slug);
  // Already newest-first and slug-scoped; only the round identity still filters.
  const priors = onSlug.filter(
    (other) => other.jobId !== record.jobId && !other.abandonedAt && other.state !== 'canceled',
  );
  for (const prior of priors) {
    const version = prior.previewVersion ?? prior.deliveredVersion;
    if (version) return version;
  }
  return null;
}
