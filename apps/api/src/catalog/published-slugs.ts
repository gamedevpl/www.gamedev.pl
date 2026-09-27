import type { GitHubClient } from './github-client.js';
import type { Store } from '../platform/store.js';
export { createPublishedSlugGateFromEnv } from './published-slugs-source.js';
import { isPublishedEntry } from '@gamedevpl/contract';

/**
 * "Is this slug a published game?" — the gate on telemetry intake.
 *
 * This exists because the obvious answer was the wrong one. Telemetry first asked
 * Firestore, resolving a slug to `submissions/{jobId}` and requiring
 * `publishedAt`. That silently discarded ~95% of real play: the catalog is built
 * straight from the games repo, so most playable games have no submission document
 * at all — they predate the submission flow or were seeded. `publishedAt` marks
 * "this creator's build was merged and they were told", not "this game is playable".
 *
 * Catalog membership is the honest question for repo-published games, and it also
 * does the job the old gate was reaching for: a creator playtesting an unmerged
 * draft is playing a branch preview, which is not in the published catalog, so
 * draft traffic still stays out of the funnel — this time for a reason that holds.
 *
 * Self-build games never enter that catalog: they land in the games-store bucket
 * and are recorded via `store.getPublication(slug)`. `createCombinedPublishedSlugGate`
 * OR's that path with the repo-catalog gate so votes, telemetry, and recommendations
 * see the same published set the `/play` route already does.
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
    const slugs = new Set(entries.filter(isPublishedEntry).map((entry) => entry.slug));
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

export interface CombinedPublishedSlugGateOptions {
  /** Repo-catalog gate; null/undefined when the games repo is not configured. */
  repoGate?: PublishedSlugGate | null;
  /** Publication registry — the authority for self-build (store-published) games. */
  store: Pick<Store, 'getPublication'>;
}

/**
 * OR of the repo-catalog gate and the store publication registry.
 *
 * Self-build games never appear in `catalog.json`; they are published via
 * `store.setPublication({ state: 'published', ... })`. The `/play` route already
 * checks that path first (`storePublishedGame` in submissions.ts). Votes, telemetry,
 * and recommendations share one `PublishedSlugGate` built in app.ts — wrapping that
 * single construction site here keeps those callers from drifting apart again.
 *
 * Cheap by construction: one `getPublication` read per miss on the repo gate, the
 * same cost `/play` already pays. The repo gate keeps its own TTL cache untouched.
 */
export function createCombinedPublishedSlugGate(options: CombinedPublishedSlugGateOptions): PublishedSlugGate {
  // Mirrored by isSlugPublishedAnyLane in catalog-routes.ts; change both together.
  const { repoGate, store } = options;

  return {
    async isPublished(slug: string): Promise<boolean> {
      if (repoGate && (await repoGate.isPublished(slug))) return true;
      try {
        const publication = await store.getPublication(slug);
        return publication?.state === 'published';
      } catch {
        // A transient store failure must not turn into a rejected play session or a
        // 500 on vote/telemetry. Fail closed: dropping a signal beats inventing one.
        return false;
      }
    },
  };
}
