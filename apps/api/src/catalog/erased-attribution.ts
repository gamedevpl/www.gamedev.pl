import type { CatalogGameEntry } from './github-client.js';
import { DELETED_ACCOUNT_UID, type Store } from '../platform/store.js';

// Strips the byline from games whose creator erased their account.

// Was read per request: one Firestore query per arrival.
export const ERASED_SLUGS_TTL_MS = 30_000;

export interface DeattributorOptions {
  store?: Pick<Store, 'listSubmissionsByOwner'>;
  now: () => number;
  ttlMs?: number;
}

export type Deattributor = (entries: CatalogGameEntry[]) => Promise<CatalogGameEntry[]>;

export function createDeattributor(options: DeattributorOptions): Deattributor {
  const { store, now } = options;
  const ttlMs = options.ttlMs ?? ERASED_SLUGS_TTL_MS;

  let cache: { slugs: Set<string>; expiresAt: number } | null = null;

  async function erasedSlugs(): Promise<Set<string>> {
    if (cache && cache.expiresAt > now()) return cache.slugs;
    const erased = await store!.listSubmissionsByOwner(DELETED_ACCOUNT_UID);
    const slugs = new Set(erased.flatMap((submission) => (submission.slug ? [submission.slug] : [])));
    cache = { slugs, expiresAt: now() + ttlMs };
    return slugs;
  }

  return async (entries) => {
    if (!store) return entries;
    // No fallback: a failed read must not re-attribute an erased account.
    const slugs = await erasedSlugs();
    if (slugs.size === 0) return entries;
    return entries.map((entry) =>
      slugs.has(entry.slug) ? { ...entry, submittedBy: 'gamedev-platform', creatorHandle: null } : entry,
    );
  };
}
