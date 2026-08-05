/**
 * Public game page client — the aggregate read behind `/:handle/:slug`.
 *
 * Uncredentialed on purpose (same as `fetchCreatorPage`): the endpoint is exempt
 * from the private-beta wall, and the page must render identically for a visitor
 * with no session.
 */

import { normalizeCatalogEntry, type CatalogEntry } from './catalog.js';
import type { PublicCreatorProfile } from './creatorProfileApi.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface GamePage {
  entry: CatalogEntry;
  creator: PublicCreatorProfile | null;
  /** The game lives under the platform handle — no profile to link to. */
  platformAuthored: boolean;
  /** First prose paragraph from SPEC.md, flattened by the API. */
  description: string | null;
}

export async function fetchGamePage(slug: string): Promise<GamePage> {
  const response = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/page`);
  if (response.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (!response.ok) throw new Error(`game page request failed: ${response.status}`);
  const body = (await response.json()) as Omit<GamePage, 'entry'> & { entry: unknown };
  const entry = normalizeCatalogEntry(body.entry);
  if (!entry) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  return {
    entry,
    creator: body.creator ?? null,
    platformAuthored: body.platformAuthored === true,
    description: typeof body.description === 'string' ? body.description : null,
  };
}
