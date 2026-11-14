import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  PLATFORM_HANDLE,
  profileBylineName,
  toPublicCreatorProfile,
  type PublicCreatorProfile,
} from '../platform/creator-profile.js';
import { catalogEntryFromSpec, type CatalogGameEntry, type GitHubClient } from './github-client.js';
import {
  extractManifestDescription,
  extractSpecDescription,
  resolveGamePageDescriptions,
  type LocalizedGameDescription,
} from './game-page-description.js';
import type { GamesStore } from '../delivery/games-store.js';
import type { Store } from '../platform/store.js';
import { isPublished } from '../platform/publication-state.js';
import { resolveGameAccess } from '../platform/game-access-resolve.js';
import { isPublishedEntry } from '@gamedevpl/contract';

export { extractManifestDescription, extractSpecDescription, type LocalizedGameDescription };

/**
 * The compact public landing page at `/:handle/:slug`.
 *
 * It returns only what that page renders: catalog metadata, attribution, and one
 * digestible sentence from SPEC.md. Playing remains a separate, explicitly gated
 * request, and the authored text is rendered as ordinary escaped React text.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SlugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
});

export interface GamePageResponse {
  entry: CatalogGameEntry;
  creator: PublicCreatorProfile | null;
  /** The game lives under the platform handle, with no creator profile to link. */
  platformAuthored: boolean;
  /** First prose paragraph from SPEC.md, flattened for compact player-facing copy. */
  description: string | null;
  localizedDescription?: LocalizedGameDescription;
}

export interface GamePageRoutesOptions {
  store: Store;
  gamesStore?: GamesStore | null;
  getRepoPublishedCatalogEntry?: (slug: string) => Promise<CatalogGameEntry | null>;
  /** Repo reads for migrated games (SPEC.md off the published ref). */
  githubClient?: GitHubClient | null;
  publishedRef?: string;
  now?: () => number;
  cacheTtlMs?: number;
}

export interface GamePageRoutesHandle {
  // Drops the cached page for `slug`, e.g. after a transfer.
  invalidateGameCache: (slug: string) => void;
}

export async function registerGamePageRoutes(
  app: FastifyInstance,
  options: GamePageRoutesOptions,
): Promise<GamePageRoutesHandle> {
  const { store, gamesStore, getRepoPublishedCatalogEntry, githubClient } = options;
  const publishedRef = options.publishedRef ?? 'main';
  const now = options.now ?? Date.now;
  const cacheTtlMs = options.cacheTtlMs ?? 60_000;
  const cache = new Map<string, { value: GamePageResponse; expiresAt: number }>();

  app.get('/api/games/:slug/page', async (request, reply) => {
    const params = SlugParamsSchema.safeParse(request.params);
    if (!params.success || !SLUG_PATTERN.test(params.data.slug)) {
      return reply.status(400).send({ error: 'invalid slug' });
    }
    const slug = params.data.slug;

    const cached = cache.get(slug);
    if (cached && cached.expiresAt > now()) return reply.send(cached.value);

    try {
      const body = await buildGamePage(slug);
      if (!body) return reply.status(404).send({ error: 'not_found' });
      if (cache.size >= 500) cache.clear();
      cache.set(slug, { value: body, expiresAt: now() + cacheTtlMs });
      return reply.send(body);
    } catch (error) {
      request.log.error({ err: error, slug }, 'failed to build game page');
      return reply.status(502).send({ error: 'failed to load game page' });
    }
  });

  async function buildGamePage(slug: string): Promise<GamePageResponse | null> {
    const repoEntry = getRepoPublishedCatalogEntry ? await getRepoPublishedCatalogEntry(slug) : null;
    const storePublished = await store.getPublication(slug).then((record) => (isPublished(record) ? record : null));
    if (!repoEntry && !storePublished) return null;
    if (repoEntry && !isPublishedEntry(repoEntry) && !storePublished) return null;

    // Canonical access, not the publishing submission's stale ownerUid.
    const access = await resolveGameAccess(store, slug);
    const erased = access.owner.kind === 'platform' && access.owner.reason === 'owner_deleted';
    const owner = access.owner.kind === 'creator' ? await store.getUser(access.owner.uid) : null;
    const creator = owner ? toPublicCreatorProfile(owner) : null;
    // An owner with no handle must not inherit the old attribution.
    const noAttribution = erased || (access.source === 'canonical' && access.owner.kind === 'creator' && !creator);

    let specMd: string | null = null;
    let gameJson: string | null = null;
    let entry: CatalogGameEntry | null = repoEntry;

    if (storePublished && gamesStore) {
      const version = storePublished.currentVersion;
      const [storeSpec, storeGameJson, mediaMetadata] = await Promise.all([
        gamesStore.getSourceFile(slug, version, 'SPEC.md'),
        gamesStore.getSourceFile(slug, version, 'GAME.json'),
        gamesStore.getDerivedArtifact(slug, version, 'media/metadata.json'),
      ]);
      specMd = storeSpec;
      gameJson = storeGameJson;
      if (!entry && storeSpec) {
        entry = catalogEntryFromSpec(slug, storeSpec, (name) =>
          name === 'media/metadata.json' && mediaMetadata ? mediaMetadata.toString('utf8') : null,
        );
      }
    }

    if (repoEntry && githubClient && !specMd) {
      [specMd, gameJson] = await Promise.all([
        githubClient.getGameFile(publishedRef, slug, 'SPEC.md'),
        gameJson ? Promise.resolve(gameJson) : githubClient.getGameFile(publishedRef, slug, 'GAME.json'),
      ]);
    } else if (repoEntry && githubClient && !storePublished && !gameJson) {
      gameJson = await githubClient.getGameFile(publishedRef, slug, 'GAME.json');
    }

    if (!entry) return null;

    const resolvedHandle = noAttribution
      ? PLATFORM_HANDLE
      : (creator?.handle ?? entry.creatorHandle ?? PLATFORM_HANDLE);
    const platformAuthored = resolvedHandle === PLATFORM_HANDLE;

    return {
      entry: {
        ...entry,
        status: 'published',
        submittedBy: noAttribution ? 'gamedev-platform' : creator ? profileBylineName(creator) : entry.submittedBy,
        creatorHandle: resolvedHandle,
      },
      creator,
      platformAuthored,
      ...resolveGamePageDescriptions(specMd, gameJson),
    };
  }

  return { invalidateGameCache: (slug) => cache.delete(slug) };
}
