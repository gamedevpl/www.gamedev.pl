import type { GitHubClient } from '../catalog/github-client.js';
import type { PublishedSlugGate } from '../catalog/published-slugs.js';
import { createManifestBlockSource } from './manifest-source.js';
import { parseZoneSchema, type ZoneSchema } from '@gamedevpl/zone-core';

/**
 * "Does this game have an authoritative zone, and what may a client send it?"
 *
 * The same read as a world's schema, off the same `GAME.json`, cached by the same
 * machinery (`manifest-source.ts`) for the same reasons — a declaration is a nested
 * object, it changes only on a merge, and nearly every game has none.
 *
 * Published games only, and here that rule earns more than it does for worlds. A zone's
 * declaration names the events the server will accept and feed to a sim it is
 * arbitrating with; a draft whose vocabulary changes commit by commit would mean the
 * server admitting an event stream that the sim on the other side no longer understands.
 */

export interface ZoneSchemaSource {
  /** The zone's declaration, or null when this game has none (or is not published). */
  getSchema(slug: string): Promise<ZoneSchema | null>;
}

export interface ZoneSchemaSourceOptions {
  client: Pick<GitHubClient, 'getGameManifest'>;
  publishedSlugs?: PublishedSlugGate | null;
  ref?: string;
  ttlMs?: number;
  now?: () => number;
}

export function createZoneSchemaSourceFromEnv(
  publishedSlugs: PublishedSlugGate | null,
  client: Pick<GitHubClient, 'getGameManifest'> | null,
): ZoneSchemaSource | null {
  if (!publishedSlugs || !client) return null;
  return createZoneSchemaSource({ client, publishedSlugs });
}

export function createZoneSchemaSource(options: ZoneSchemaSourceOptions): ZoneSchemaSource {
  const source = createManifestBlockSource<ZoneSchema>({ ...options, key: 'zone', parse: parseZoneSchema });
  return { getSchema: (slug) => source.get(slug) };
}
