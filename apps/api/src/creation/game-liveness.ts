import type { Store } from '../platform/store.js';
import { isPublished } from '../platform/publication-state.js';
import type { PublishedSlugGate } from '../catalog/published-slugs.js';

export type RepoPublishedSlugs = PublishedSlugGate;

export async function isLiveGame(store: Store, slug: string, repoGate: RepoPublishedSlugs | null): Promise<boolean> {
  const publication = await store.getPublication(slug);
  return publication ? isPublished(publication) : ((await repoGate?.isPublished(slug)) ?? false);
}
