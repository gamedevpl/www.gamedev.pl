import { mintGameSlug } from '../platform/slug.js';
import { settleSlugClaim } from '../platform/slug-ownership.js';
import type { Store, SubmissionRecord } from '../platform/store.js';

export interface SlugResolverOptions {
  store?: Store;
  isSlugPublished: (slug: string) => Promise<boolean>;
}

export interface SlugResolver {
  isSlugClaimed(slug: string, except?: number): Promise<boolean>;
  confirmSlugClaim(jobId: number, slug: string, title: string): Promise<string | null>;
  ensureSubmissionSlug(jobId: number, record: SubmissionRecord): Promise<string | null>;
}

// Settles who holds a slug across the store, publications, and the catalog.
export function createSlugResolver(options: SlugResolverOptions): SlugResolver {
  const { store, isSlugPublished } = options;

  // Deliberately forgiving of its own failures — an outage must not block creation.
  async function isSlugClaimed(slug: string, except?: number): Promise<boolean> {
    if (store) {
      try {
        const existing = await store.getSubmissionBySlug(slug);
        if (existing && existing.jobId !== except) return true;
        const publication = await store.getPublication(slug);
        if (publication) return true;
      } catch {
        // Fall through: an unavailable store must not block creation.
      }
    }
    try {
      if (await isSlugPublished(slug)) return true;
    } catch {
      // Same reasoning; this one is likeliest to fail since it reads GitHub.
    }
    return false;
  }

  async function confirmSlugClaim(jobId: number, slug: string, title: string): Promise<string | null> {
    if (!store) return slug;
    return settleSlugClaim(store, jobId, slug, title, isSlugClaimed);
  }

  async function ensureSubmissionSlug(jobId: number, record: SubmissionRecord): Promise<string | null> {
    if (record.slug) return record.slug;
    const wanted = await mintGameSlug(record.title, async (candidate) => isSlugClaimed(candidate, jobId));
    return confirmSlugClaim(jobId, wanted, record.title);
  }

  return { isSlugClaimed, confirmSlugClaim, ensureSubmissionSlug };
}
