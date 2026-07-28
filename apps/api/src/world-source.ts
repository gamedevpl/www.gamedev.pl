import type { GitHubClient } from './github-client.js';
import type { PublishedSlugGate } from './published-slugs.js';
import { parseWorldSchema, type WorldSchema } from './world-schema.js';

/**
 * "Does this game have a shared world, and what shape are its entries?"
 *
 * The answer lives in the game's `GAME.json`, in the games repo, because a field spec
 * is a nested object and SPEC.md frontmatter is flat. That makes it one contents read
 * per game — cheap, but not something to do on every write, so it is cached here the
 * same way published-slug membership is, and for the same reason: the games repo is
 * behind a shared token budget that a per-request fetch would burn through.
 *
 * A world only exists for a **published** game. A draft's schema changes with every
 * commit, and entries written against a shape that is about to be rewritten are worse
 * than no entries: they would be visible to other players as nonsense the game can no
 * longer render. Creators playtest a branch preview, which is not in the catalog.
 *
 * Negative answers are cached too. Almost every game has no world at all, and the read
 * that establishes that is exactly as expensive as the one that finds a schema — so
 * without it a single game with a `commons` bug could re-fetch a missing manifest on
 * every poll.
 */

/** Long, because a schema changes only on a merge to the games repo's main. */
const DEFAULT_TTL_MS = 10 * 60_000;

export interface WorldSchemaSource {
  /** The world's schema, or null when this game has none (or is not published). */
  getSchema(slug: string): Promise<WorldSchema | null>;
}

export interface WorldSchemaSourceOptions {
  client: Pick<GitHubClient, 'getGameManifest'>;
  publishedSlugs?: PublishedSlugGate | null;
  ref?: string;
  ttlMs?: number;
  now?: () => number;
}

/**
 * The live source, sharing the published-slug gate the rest of the app already built.
 *
 * Null (no games repo configured) makes every world route answer 404, exactly like an
 * absent slug gate does for votes and saves.
 */
export async function createWorldSchemaSourceFromEnv(
  publishedSlugs: PublishedSlugGate | null,
  fetchImpl?: typeof fetch,
): Promise<WorldSchemaSource | null> {
  if (!publishedSlugs) return null;

  const token = process.env.GITHUB_TOKEN?.trim();
  const repo = process.env.GAMES_REPO?.trim();
  if (token && repo) {
    const { createGitHubClient } = await import('./github-client.js');
    return createWorldSchemaSource({ client: createGitHubClient({ token, repo, fetchImpl }), publishedSlugs });
  }

  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv !== 'production' && nodeEnv !== 'test') {
    const { resolveLocalGamesDir, createLocalGamesClient } = await import('./local-games-repo.js');
    const local = await resolveLocalGamesDir();
    return createWorldSchemaSource({ client: createLocalGamesClient({ rootDir: local.rootDir }), publishedSlugs });
  }

  return null;
}

export function createWorldSchemaSource(options: WorldSchemaSourceOptions): WorldSchemaSource {
  const { client, publishedSlugs } = options;
  const ref = options.ref ?? process.env.GAMES_PUBLISHED_REF ?? 'main';
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;

  const cache = new Map<string, { expiresAt: number; schema: WorldSchema | null }>();
  /** One in-flight read per slug is shared, so a burst cannot stampede GitHub. */
  const inFlight = new Map<string, Promise<WorldSchema | null>>();

  async function load(slug: string): Promise<WorldSchema | null> {
    const manifest = await client.getGameManifest(ref, slug);
    // parseWorldSchema returns null for anything it cannot make complete sense of, and
    // that is the safe direction: no world at all, rather than a world whose fields are
    // unvalidated. See the note at the top of world-schema.ts.
    const schema = manifest ? parseWorldSchema(manifest.world) : null;
    cache.set(slug, { schema, expiresAt: now() + ttlMs });
    return schema;
  }

  return {
    async getSchema(slug) {
      if (!(await (publishedSlugs?.isPublished(slug) ?? Promise.resolve(false)))) return null;

      const cached = cache.get(slug);
      if (cached && cached.expiresAt > now()) return cached.schema;

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
