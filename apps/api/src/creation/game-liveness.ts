import type { Store } from '../platform/store.js';
import { isPublished } from '../platform/publication-state.js';
import type { PublishedSlugGate } from '../catalog/published-slugs.js';

export type RepoPublishedSlugs = PublishedSlugGate;

export async function isLiveGame(store: Store, slug: string, repoGate: RepoPublishedSlugs | null): Promise<boolean> {
  return (await gameLiveness(store, slug, repoGate)).live;
}

export async function gameLiveness(
  store: Store,
  slug: string,
  repoGate: RepoPublishedSlugs | null,
): Promise<{ live: boolean; publishedVersion?: string }> {
  const publication = await store.getPublication(slug);
  if (publication) {
    return isPublished(publication) ? { live: true, publishedVersion: publication.currentVersion } : { live: false };
  }
  return { live: (await repoGate?.isPublished(slug)) ?? false };
}
