import type { GitHubClient } from '../github-client.js';
import type { PublishedSlugGate } from '../published-slugs.js';
import { createGamesRepoClientFromEnv, createManifestBlockSource } from '../manifest-source.js';
import { parseWorldSchema, type WorldSchema } from './world-schema.js';

/**
 * "Does this game have a shared world, and what shape are its entries?"
 *
 * The answer lives in the game's `GAME.json`, in the games repo, because a field spec is
 * a nested object and SPEC.md frontmatter is flat. The caching, the published-only rule
 * and the reasons behind both live in `manifest-source.ts`, which P3's zone declarations
 * share; what is here is which key to read and how to parse it.
 *
 * A declaration that does not fully parse yields no world at all — see the note at the
 * top of `world-schema.ts` for why failing open would be the wrong direction.
 */

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
  const client = await createGamesRepoClientFromEnv(fetchImpl);
  return client ? createWorldSchemaSource({ client, publishedSlugs }) : null;
}

export function createWorldSchemaSource(options: WorldSchemaSourceOptions): WorldSchemaSource {
  const source = createManifestBlockSource<WorldSchema>({ ...options, key: 'world', parse: parseWorldSchema });
  return { getSchema: (slug) => source.get(slug) };
}
