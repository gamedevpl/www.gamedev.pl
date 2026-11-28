import type { FastifyBaseLogger } from 'fastify';
import { isPublished } from '../platform/publication-state.js';
import type { Store } from '../platform/store.js';
import type { GamesStore } from '../delivery/games-store.js';
import { catalogEntryFromSpec } from './github-client.js';
import { withGameOrientation, type CachedAssembledGame } from './assembled-game-cache.js';

export async function readStoredPublishedGame(options: {
  slug: string;
  store?: Store;
  gamesStore?: GamesStore;
  log: FastifyBaseLogger;
}): Promise<CachedAssembledGame | null> {
  const { slug, store, gamesStore, log } = options;
  if (!store || !gamesStore) return null;
  const publication = await store.getPublication(slug);
  if (!isPublished(publication)) return null;
  const bundle = await gamesStore.getDerivedArtifact(slug, publication.currentVersion, 'bundle.html');
  if (!bundle) {
    log.error({ slug, version: publication.currentVersion }, 'published game has no stored bundle');
    return null;
  }
  const spec = await gamesStore.getSourceFile(slug, publication.currentVersion, 'SPEC.md');
  const entry = spec ? catalogEntryFromSpec(slug, spec, () => null) : null;
  return withGameOrientation({ slug, title: entry?.title || slug, html: bundle.toString('utf8') }, entry?.orientation);
}
