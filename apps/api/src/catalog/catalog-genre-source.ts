import { createGitHubClient, type GitHubClient } from './github-client.js';
import type { CatalogGenreSource } from './recommendations.js';
import type { RecommendGame } from './recommend.js';
import { isPublishedEntry } from '@gamedevpl/contract';

/**
 * Published catalog summaries (slug + genre) for the recommender.
 *
 * Mirrors `published-slugs.ts`: same catalog source, same TTL reasoning — membership
 * only changes on a merge, so a few minutes of staleness is cheaper than stampeding
 * GitHub on every home-page load.
 */

const DEFAULT_TTL_MS = 10 * 60_000;

export interface CatalogGenreSourceOptions {
  client: Pick<GitHubClient, 'getCatalog'>;
  ref?: string;
  ttlMs?: number;
  now?: () => number;
}

export function createCatalogGenreSource(options: CatalogGenreSourceOptions): CatalogGenreSource {
  const { client } = options;
  const ref = options.ref ?? process.env.GAMES_PUBLISHED_REF ?? 'main';
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;

  let cache: { expiresAt: number; games: RecommendGame[] } | null = null;
  let inFlight: Promise<RecommendGame[]> | null = null;

  async function load(): Promise<RecommendGame[]> {
    const entries = await client.getCatalog(ref);
    const games = entries.filter(isPublishedEntry).map((entry) => ({ slug: entry.slug, genre: entry.genre }));
    cache = { games, expiresAt: now() + ttlMs };
    return games;
  }

  async function current(): Promise<RecommendGame[]> {
    const cached = cache;
    if (cached && cached.expiresAt > now()) return cached.games;
    inFlight ??= load().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    async listPublished(): Promise<RecommendGame[]> {
      try {
        return await current();
      } catch {
        return cache?.games ?? [];
      }
    },
  };
}

export async function createCatalogGenreSourceFromEnv(fetchImpl?: typeof fetch): Promise<CatalogGenreSource | null> {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repo = process.env.GAMES_REPO?.trim();
  if (token && repo) {
    return createCatalogGenreSource({ client: createGitHubClient({ token, repo, fetchImpl }) });
  }

  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv !== 'production' && nodeEnv !== 'test') {
    const { resolveLocalGamesDir, createLocalGamesClient } = await import('./local-games-repo.js');
    const local = await resolveLocalGamesDir();
    return createCatalogGenreSource({ client: createLocalGamesClient({ rootDir: local.rootDir }) });
  }

  return null;
}
