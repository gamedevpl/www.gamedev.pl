import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { catalogEntryFromSpec, parseGameMedia, type CatalogGameEntry, type GitHubClient } from './github-client.js';
import { SnapshotUnavailableError, type GameSnapshotReader } from './game-snapshot.js';
import { attachCatalogEnrichments } from './catalog-enricher.js';
import { profileBylineName, toPublicCreatorProfile } from '../platform/creator-profile.js';
import { isVariantWidth } from '../platform/image-variants.js';
import { isRateLimited } from '../platform/ip-rate-limit.js';
import { sendMedia } from '../platform/media-response.js';
import { DELETED_ACCOUNT_UID, type Store } from '../platform/store.js';
import type { GamesStore } from '../delivery/games-store.js';
import { isPublished } from '../platform/publication-state.js';
import { isPublishedEntry } from '@gamedevpl/contract';

type PublishedGame = { slug: string; title: string; html: string };

export interface CatalogRoutesOptions {
  store?: Store;
  gamesStore?: GamesStore;
  now: () => number;
  githubClient: GitHubClient | null;
  snapshotReader?: GameSnapshotReader | null;
  publishedRef: string;
  // Shared with the build-screenshot route's IP budget.
  mediaByIp: Map<string, number[]>;
  maxMediaPerWindow: number;
  mediaRateLimitWindowMs: number;
}

export interface CatalogRoutesHandle {
  getCatalogEntries(): Promise<CatalogGameEntry[]>;
  isSlugPublished(slug: string): Promise<boolean>;
  getPublishedCatalogEntry(slug: string): Promise<CatalogGameEntry | null>;
  readSnapshotGame(slug: string): Promise<PublishedGame | null>;
  storePublishedGame(slug: string): Promise<PublishedGame | null>;
  // Clears cached store-catalog and media entries for a changed slug.
  invalidatePublishedGameCache(slug: string): void;
}

// The public game catalog and its gallery media, cached.
export async function registerCatalogRoutes(
  app: FastifyInstance,
  options: CatalogRoutesOptions,
): Promise<CatalogRoutesHandle> {
  const { store, gamesStore, now, githubClient, publishedRef, mediaByIp, maxMediaPerWindow, mediaRateLimitWindowMs } =
    options;
  const snapshotReader = options.snapshotReader ?? null;

  const catalogTtlMs = 10 * 60_000;
  let catalogCache: { expiresAt: number; entries: CatalogGameEntry[] } | null = null;
  let catalogRefresh: Promise<CatalogGameEntry[]> | null = null;
  const storeCatalogTtlMs = catalogTtlMs;
  let storeCatalogCache: { expiresAt: number; value: CatalogGameEntry[] } | null = null;

  const mediaTtlMs = 60 * 60_000;
  const maxCachedMediaEntries = 400;
  const mediaCache = new Map<string, { expiresAt: number; etag: string; contentType: string; body: Buffer }>();

  async function loadCatalog(): Promise<CatalogGameEntry[]> {
    if (snapshotReader) {
      try {
        const entries = await snapshotReader.getCatalog();
        if (entries) {
          return entries;
        }
      } catch (error) {
        if (error instanceof SnapshotUnavailableError) throw error;
        app.log.warn({ err: error }, 'snapshot catalog unavailable');
        throw new SnapshotUnavailableError('snapshot catalog unavailable', { cause: error });
      }
      throw new SnapshotUnavailableError('snapshot catalog is not published');
    }
    if (!githubClient) return [];
    return githubClient.getCatalog(publishedRef);
  }

  async function readSnapshotGame(slug: string): Promise<PublishedGame | null> {
    if (!snapshotReader) return null;
    try {
      return await snapshotReader.getGame(slug);
    } catch (error) {
      if (error instanceof SnapshotUnavailableError) throw error;
      app.log.warn({ err: error, slug }, 'snapshot game unavailable');
      throw new SnapshotUnavailableError('snapshot game unavailable', { cause: error });
    }
  }

  async function readSnapshotMedia(
    slug: string,
    filename: string,
    width?: number,
  ): Promise<{ body: Buffer; contentType: string } | null> {
    if (!snapshotReader) return null;
    try {
      if (width !== undefined) {
        // Fall back to the original if this variant was never baked.
        const variant = await snapshotReader.getMedia(slug, filename, width);
        if (variant) return variant;
      }
      return await snapshotReader.getMedia(slug, filename);
    } catch (error) {
      if (error instanceof SnapshotUnavailableError) throw error;
      app.log.warn({ err: error, slug, filename }, 'snapshot media unavailable');
      throw new SnapshotUnavailableError('snapshot media unavailable', { cause: error });
    }
  }

  async function getCatalogEntries(): Promise<CatalogGameEntry[]> {
    if (catalogCache && catalogCache.expiresAt > now()) {
      return catalogCache.entries;
    }

    const remember = (entries: CatalogGameEntry[]): CatalogGameEntry[] => {
      catalogCache = { entries, expiresAt: now() + catalogTtlMs };
      return entries;
    };
    const serveStaleOrRethrow = (error: unknown): CatalogGameEntry[] => {
      if (catalogCache) {
        app.log.warn({ err: error }, 'catalog refresh failed; serving last known entries');
        return catalogCache.entries;
      }
      throw error;
    };

    catalogRefresh ??= loadCatalog()
      .then(remember)
      .finally(() => {
        catalogRefresh = null;
      });

    try {
      return await catalogRefresh;
    } catch (error) {
      return serveStaleOrRethrow(error);
    }
  }

  async function isSlugPublished(slug: string): Promise<boolean> {
    if (!githubClient) return false;
    const entries = await getCatalogEntries();
    return entries.some((entry) => entry.slug === slug && isPublishedEntry(entry));
  }

  async function getPublishedCatalogEntry(slug: string): Promise<CatalogGameEntry | null> {
    if (!githubClient) return null;
    const entries = await getCatalogEntries();
    return entries.find((entry) => entry.slug === slug && isPublishedEntry(entry)) ?? null;
  }

  async function storePublishedGame(slug: string): Promise<PublishedGame | null> {
    if (!store || !gamesStore) return null;
    const publication = await store.getPublication(slug);
    if (!isPublished(publication)) return null;
    const bundle = await gamesStore.getDerivedArtifact(slug, publication.currentVersion, 'bundle.html');
    if (!bundle) {
      app.log.error({ slug, version: publication.currentVersion }, 'published game has no stored bundle');
      return null;
    }
    const spec = await gamesStore.getSourceFile(slug, publication.currentVersion, 'SPEC.md');
    const title = (spec && catalogEntryFromSpec(slug, spec, () => null)?.title) || slug;
    return { slug, title, html: bundle.toString('utf8') };
  }

  async function readStorePublishedMedia(slug: string, filename: string): Promise<Buffer | null> {
    if (!store || !gamesStore) return null;
    const publication = await store.getPublication(slug);
    if (!isPublished(publication)) return null;
    const mediaMetadata = await gamesStore.getDerivedArtifact(slug, publication.currentVersion, 'media/metadata.json');
    const media = parseGameMedia(mediaMetadata?.toString('utf8') ?? null);
    if (!media) return null;
    const allowed = new Set([
      ...media.screenshots.map((screenshot) => screenshot.file),
      ...(media.video ? [media.video] : []),
    ]);
    if (!allowed.has(filename)) return null;
    return gamesStore.getDerivedArtifact(slug, publication.currentVersion, `media/${filename}`);
  }

  async function storeCatalogEntries(repoSlugs: string[]): Promise<CatalogGameEntry[]> {
    if (!store || !gamesStore) return [];
    const cached = storeCatalogCache;
    if (cached && cached.expiresAt > now()) return cached.value;

    try {
      const taken = new Set(repoSlugs);
      const publications = (await store.listPublications()).filter(
        (record) => isPublished(record) && !taken.has(record.slug),
      );
      const entries: CatalogGameEntry[] = [];
      for (const record of publications) {
        const spec = await gamesStore.getSourceFile(record.slug, record.currentVersion, 'SPEC.md');
        if (spec === null) continue;
        // Media lives as derived artifacts, produced by the gate — not as source.
        const mediaMetadata = await gamesStore.getDerivedArtifact(
          record.slug,
          record.currentVersion,
          'media/metadata.json',
        );
        const entry = catalogEntryFromSpec(record.slug, spec, (name) =>
          name === 'media/metadata.json' && mediaMetadata ? mediaMetadata.toString('utf8') : null,
        );
        if (!entry) continue;
        // Attribution joins from the owner's profile at read time, never SPEC.
        const submission = await store.getSubmissionBySlug(record.slug);
        const owner = submission ? await store.getUser(submission.ownerUid) : null;
        const profile = owner ? toPublicCreatorProfile(owner) : null;
        const contributors: string[] = [];
        try {
          const manifest = await gamesStore.getManifest(record.slug, record.currentVersion);
          if (manifest?.proposal?.proposerUid) {
            const contributor = await store.getUser(manifest.proposal.proposerUid);
            const contributorProfile = contributor ? toPublicCreatorProfile(contributor) : null;
            if (contributorProfile?.handle) contributors.push(contributorProfile.handle);
          }
        } catch {
          // A credit we cannot read is a credit we omit.
        }
        entries.push({
          ...entry,
          status: 'published',
          submittedBy: profile ? profileBylineName(profile) : entry.submittedBy,
          creatorHandle: profile?.handle ?? null,
          ...(contributors.length > 0 ? { contributorHandles: contributors } : {}),
        });
      }
      storeCatalogCache = { value: entries, expiresAt: now() + storeCatalogTtlMs };
      return entries;
    } catch (error) {
      app.log.error({ err: error }, 'could not read store-published games for the catalog');
      return cached?.value ?? [];
    }
  }

  async function deattributeDeletedOwners(entries: CatalogGameEntry[]): Promise<CatalogGameEntry[]> {
    if (!store) return entries;
    const erased = await store.listSubmissionsByOwner(DELETED_ACCOUNT_UID);
    const slugs = new Set(erased.flatMap((submission) => (submission.slug ? [submission.slug] : [])));
    if (slugs.size === 0) return entries;
    return entries.map((entry) =>
      slugs.has(entry.slug) ? { ...entry, submittedBy: 'gamedev-platform', creatorHandle: null } : entry,
    );
  }

  function invalidatePublishedGameCache(slug: string): void {
    storeCatalogCache = null;
    for (const key of mediaCache.keys()) {
      if (key.startsWith(`${slug}/`)) mediaCache.delete(key);
    }
  }

  app.get('/api/catalog', async (request, reply) => {
    if (!githubClient) {
      return reply.status(503).send({ error: 'catalog is not configured' });
    }

    try {
      const entries = await getCatalogEntries();
      const published = entries.filter(isPublishedEntry);
      const combined = [...published, ...(await storeCatalogEntries(published.map((entry) => entry.slug)))];
      const deattributed = await deattributeDeletedOwners(combined);
      return reply.send(await attachCatalogEnrichments(deattributed, store));
    } catch (error) {
      if (error instanceof SnapshotUnavailableError) {
        request.log.error({ err: error }, 'snapshot catalog unavailable');
        return reply.status(503).send({ error: 'catalog snapshot unavailable' });
      }
      request.log.error({ err: error }, 'failed to load catalog');
      return reply.status(502).send({ error: 'failed to load catalog' });
    }
  });

  // Curated flagship pool, public like the catalog itself; no join.
  app.get('/api/featured', async (_request, reply) => {
    if (!store) {
      return reply.send({ slugs: [] });
    }
    const config = await store.getFeaturedPoolConfig();
    return reply.send({ slugs: config?.slugs ?? [] });
  });

  // Only filenames declared by the validated media metadata are proxyable.
  app.get('/api/games/:slug/media/:filename', async (request, reply) => {
    if (!githubClient) {
      return reply.status(503).send({ error: 'games are not configured' });
    }

    const parsedParams = z
      .object({
        slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
        filename: z.string().regex(/^[a-z0-9][a-z0-9-]*\.(?:png|mp4)$/),
      })
      .safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(404).send({ error: 'media not found' });
    }

    // An allowlist, not a number — else the cache fills with arbitrary widths.
    const requestedWidth = Number((request.query as { w?: string } | undefined)?.w);
    const variantWidth =
      parsedParams.data.filename.endsWith('.png') && isVariantWidth(requestedWidth) ? requestedWidth : undefined;

    const currentTime = now();
    if (isRateLimited(mediaByIp, request.clientIp, currentTime, maxMediaPerWindow, mediaRateLimitWindowMs)) {
      return reply.status(429).send({ error: 'too many game requests, please try again later' });
    }

    const cacheKey = `${parsedParams.data.slug}/${variantWidth ?? 'full'}/${parsedParams.data.filename}`;
    const cachedMedia = mediaCache.get(cacheKey);
    if (cachedMedia && cachedMedia.expiresAt > currentTime) {
      return sendMedia(request, reply, cachedMedia);
    }

    try {
      const entry = await getPublishedCatalogEntry(parsedParams.data.slug);
      const allowedFiles = new Set([
        ...(entry?.media?.screenshots.map((screenshot) => screenshot.file) ?? []),
        ...(entry?.media?.video ? [entry.media.video] : []),
      ]);

      let body: Buffer | null = null;
      if (entry && allowedFiles.has(parsedParams.data.filename)) {
        if (snapshotReader) {
          const snapshotMedia = await readSnapshotMedia(
            parsedParams.data.slug,
            parsedParams.data.filename,
            variantWidth,
          );
          body = snapshotMedia?.body ?? null;
        } else {
          const media = await githubClient.getGameMedia(
            publishedRef,
            parsedParams.data.slug,
            parsedParams.data.filename,
          );
          body = media ? Buffer.from(media) : null;
        }
      }

      // Store-published games skip the repo catalog and the snapshot bake.
      if (!body) {
        body = await readStorePublishedMedia(parsedParams.data.slug, parsedParams.data.filename);
      }
      if (!body) {
        return reply.status(404).send({ error: 'media not found' });
      }

      const cacheEntry = {
        expiresAt: currentTime + mediaTtlMs,
        etag: `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`,
        contentType: parsedParams.data.filename.endsWith('.png') ? 'image/png' : 'video/mp4',
        body,
      };
      if (mediaCache.size >= maxCachedMediaEntries) {
        const oldestKey = mediaCache.keys().next().value;
        if (oldestKey !== undefined) mediaCache.delete(oldestKey);
      }
      mediaCache.set(cacheKey, cacheEntry);

      return sendMedia(request, reply, cacheEntry);
    } catch (error) {
      if (error instanceof SnapshotUnavailableError) {
        request.log.error({ err: error }, 'snapshot media unavailable');
        return reply.status(503).send({ error: 'media snapshot unavailable' });
      }
      request.log.error({ err: error }, 'failed to serve game media');
      return reply.status(502).send({ error: 'failed to load game media' });
    }
  });

  return {
    getCatalogEntries,
    isSlugPublished,
    getPublishedCatalogEntry,
    readSnapshotGame,
    storePublishedGame,
    invalidatePublishedGameCache,
  };
}
