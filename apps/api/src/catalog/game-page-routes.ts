import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  PLATFORM_HANDLE,
  profileBylineName,
  toPublicCreatorProfile,
  type PublicCreatorProfile,
} from '../creation/creator-profile.js';
import { catalogEntryFromSpec, type CatalogGameEntry, type GitHubClient } from './github-client.js';
import type { GamesStore } from '../delivery/games-store.js';
import { DELETED_ACCOUNT_UID, type Store } from '../platform/store.js';

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

/**
 * Finds the first prose paragraph without turning SPEC.md back into a public README.
 * Headings, rules, lists, and fenced code are skipped; wrapped prose is flattened.
 */
export function extractSpecDescription(specMd: string | null): string | null {
  if (!specMd) return null;
  const lines = specMd.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').split(/\r?\n/);
  const paragraph: string[] = [];
  let inCodeFence = false;

  for (const line of lines) {
    const text = line.trim();
    if (text.startsWith('```')) {
      if (paragraph.length > 0) break;
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;
    if (!text) {
      if (paragraph.length > 0) break;
      continue;
    }
    if (/^(#{1,6})\s+/.test(text) || /^(-{3,}|\*{3,})$/.test(text) || /^([-*]|\d+[.)])\s+/.test(text)) {
      if (paragraph.length > 0) break;
      continue;
    }
    paragraph.push(text);
  }

  return paragraph.length > 0 ? paragraph.join(' ') : null;
}

export async function registerGamePageRoutes(app: FastifyInstance, options: GamePageRoutesOptions): Promise<void> {
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
    const publication = await store.getPublication(slug);
    const storePublished = publication?.state === 'published' ? publication : null;
    if (!repoEntry && !storePublished) return null;
    if (repoEntry && repoEntry.status !== 'published' && !storePublished) return null;

    const submission = await store.getSubmissionBySlug(slug);
    const erased = submission?.ownerUid === DELETED_ACCOUNT_UID;
    const owner = submission && !erased ? await store.getUser(submission.ownerUid) : null;
    const creator = owner ? toPublicCreatorProfile(owner) : null;

    let specMd: string | null = null;
    let entry: CatalogGameEntry | null = repoEntry;

    if (storePublished && gamesStore) {
      const version = storePublished.currentVersion;
      const [storeSpec, mediaMetadata] = await Promise.all([
        gamesStore.getSourceFile(slug, version, 'SPEC.md'),
        gamesStore.getDerivedArtifact(slug, version, 'media/metadata.json'),
      ]);
      specMd = storeSpec;
      if (!entry && storeSpec) {
        entry = catalogEntryFromSpec(slug, storeSpec, (name) =>
          name === 'media/metadata.json' && mediaMetadata ? mediaMetadata.toString('utf8') : null,
        );
      }
    }

    if (repoEntry && githubClient && !specMd) {
      specMd = await githubClient.getGameFile(publishedRef, slug, 'SPEC.md');
    }

    if (!entry) return null;

    const resolvedHandle = erased ? PLATFORM_HANDLE : (creator?.handle ?? entry.creatorHandle ?? PLATFORM_HANDLE);
    const platformAuthored = resolvedHandle === PLATFORM_HANDLE;

    return {
      entry: {
        ...entry,
        status: 'published',
        submittedBy: erased ? 'gamedev-platform' : creator ? profileBylineName(creator) : entry.submittedBy,
        creatorHandle: resolvedHandle,
      },
      creator: erased ? null : creator,
      platformAuthored,
      description: extractSpecDescription(specMd),
    };
  }
}
