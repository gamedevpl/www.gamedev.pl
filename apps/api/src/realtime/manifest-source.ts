import type { GitHubClient } from '../catalog/github-client.js';
import type { PublishedSlugGate } from '../catalog/published-slugs.js';

/**
 * "Does this published game declare <block>, and what does it say?"
 *
 * Both of the platform's declared-shape features — P2's shared worlds and P3's
 * authoritative zones — answer that question about a different key of the same
 * `GAME.json`, with identical caching needs, so the machinery lives here once.
 *
 * The caching is not an optimization detail; it is the reason this exists. A manifest is
 * one contents read against the games repo, which is behind a shared token budget that a
 * per-request fetch would burn through — a fan-out of exactly this kind has caused a
 * rate-limit outage before. So: a TTL long enough that a declaration only changes on a
 * merge, one in-flight read per slug so a burst cannot stampede, and **negative answers
 * cached too**. That last one matters most: nearly every game declares neither block, and
 * establishing that costs the same read as finding a declaration — without it, one game
 * polling a feature it does not have would re-fetch a missing manifest forever.
 *
 * A block only exists for a **published** game. A draft is rebuilt commit by commit and
 * its declaration changes under whoever is playing; creators playtest a branch preview,
 * which is not in the catalog.
 */

/** Long, because a declaration changes only on a merge to the games repo's main. */
const DEFAULT_TTL_MS = 10 * 60_000;

export interface ManifestBlockSource<T> {
  /** The parsed block, or null when this game has none (or is not published). */
  get(slug: string): Promise<T | null>;
}

export interface ManifestBlockSourceOptions<T> {
  client: Pick<GitHubClient, 'getGameManifest'>;
  publishedSlugs?: PublishedSlugGate | null;
  /** Which `GAME.json` key to read — `world`, `zone`, … */
  key: string;
  /** Returns null for anything that does not fully check out. Never throws. */
  parse: (raw: unknown) => T | null;
  ref?: string;
  ttlMs?: number;
  now?: () => number;
}

export function createManifestBlockSource<T>(options: ManifestBlockSourceOptions<T>): ManifestBlockSource<T> {
  const { client, publishedSlugs, key, parse } = options;
  const ref = options.ref ?? process.env.GAMES_PUBLISHED_REF ?? 'main';
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;

  const cache = new Map<string, { expiresAt: number; value: T | null }>();
  const inFlight = new Map<string, Promise<T | null>>();

  async function load(slug: string): Promise<T | null> {
    const manifest = await client.getGameManifest(ref, slug);
    // `parse` returning null is the safe direction: no declaration at all, rather than
    // one whose rules were only half understood.
    const value = manifest ? parse(manifest[key]) : null;
    cache.set(slug, { value, expiresAt: now() + ttlMs });
    return value;
  }

  return {
    async get(slug) {
      if (!(await (publishedSlugs?.isPublished(slug) ?? Promise.resolve(false)))) return null;

      const cached = cache.get(slug);
      if (cached && cached.expiresAt > now()) return cached.value;

      let pending = inFlight.get(slug);
      if (!pending) {
        pending = load(slug).finally(() => {
          inFlight.delete(slug);
        });
        inFlight.set(slug, pending);
      }
      return pending;
    },
  };
}
