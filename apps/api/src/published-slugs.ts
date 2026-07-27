import { createGitHubClient, type GitHubClient } from './github-client.js';

/**
 * "Is this slug a published game?" — the gate on telemetry intake.
 *
 * This exists because the obvious answer was the wrong one. Telemetry first asked
 * Firestore, resolving a slug to `submissions/{issueNumber}` and requiring
 * `publishedAt`. That silently discarded ~95% of real play: the catalog is built
 * straight from the games repo, so most playable games have no submission document
 * at all — they predate the submission flow or were seeded. `publishedAt` marks
 * "this creator's build was merged and they were told", not "this game is playable".
 *
 * Catalog membership is the honest question, and it also does the job the old gate
 * was reaching for: a creator playtesting an unmerged draft is playing a branch
 * preview, which is not in the published catalog, so draft traffic still stays out
 * of the funnel — this time for a reason that holds.
 *
 * Cached with a generous TTL because building the catalog fans out into a dozen-plus
 * contents-API calls, and that fan-out has already caused one rate-limit outage
 * (see github-client.ts). Catalog membership changes only on a merge to main, so
 * staleness here costs at most a few minutes of telemetry for a brand-new game —
 * cheap, next to spending the shared token budget on every flush.
 */

const DEFAULT_TTL_MS = 10 * 60_000;

export interface PublishedSlugGate {
  /** False for an unknown, unpublished, or draft-only slug. */
  isPublished(slug: string): Promise<boolean>;
}

export interface PublishedSlugGateOptions {
  client: Pick<GitHubClient, 'getCatalog'>;
  ref?: string;
  ttlMs?: number;
  now?: () => number;
}

export function createPublishedSlugGate(options: PublishedSlugGateOptions): PublishedSlugGate {
  const { client } = options;
  const ref = options.ref ?? process.env.GAMES_PUBLISHED_REF ?? 'main';
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;

  let cache: { expiresAt: number; slugs: Set<string> } | null = null;
  /** One in-flight refresh is shared, so a burst of flushes cannot stampede GitHub. */
  let inFlight: Promise<Set<string>> | null = null;

  async function load(): Promise<Set<string>> {
    const entries = await client.getCatalog(ref);
    const slugs = new Set(entries.filter((entry) => entry.status === 'published').map((entry) => entry.slug));
    cache = { slugs, expiresAt: now() + ttlMs };
    return slugs;
  }

  async function currentSlugs(): Promise<Set<string>> {
    const cached = cache;
    if (cached && cached.expiresAt > now()) return cached.slugs;
    inFlight ??= load().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    async isPublished(slug: string): Promise<boolean> {
      try {
        return (await currentSlugs()).has(slug);
      } catch {
        // GitHub being unreachable must not turn into a rejected play session. Serving
        // a stale answer is fine; with no answer at all, drop the events — a closed
        // gate loses data, an open one would let any string create a collection key.
        return cache?.slugs.has(slug) ?? false;
      }
    },
  };
}

/**
 * Builds the gate from the environment, or returns null when the games repo is not
 * configured (secret-less deploys run browse/play-only). A null gate means telemetry
 * accepts and drops, exactly as it does for an unknown slug.
 *
 * In local development (no token, not production/test) the gate reads the same
 * fixture/checkout catalog the browse surface serves — otherwise every vote and
 * play-telemetry flush would 404 against fixture slugs that are clearly published.
 */
export async function createPublishedSlugGateFromEnv(
  fetchImpl?: typeof fetch,
): Promise<PublishedSlugGate | null> {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repo = process.env.GAMES_REPO?.trim();
  if (token && repo) {
    return createPublishedSlugGate({ client: createGitHubClient({ token, repo, fetchImpl }) });
  }

  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv !== 'production' && nodeEnv !== 'test') {
    const { resolveLocalGamesDir, createLocalGamesClient } = await import('./local-games-repo.js');
    const local = await resolveLocalGamesDir();
    return createPublishedSlugGate({ client: createLocalGamesClient({ rootDir: local.rootDir }) });
  }

  return null;
}
