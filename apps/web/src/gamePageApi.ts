// Public game page client — uncredentialed aggregate read behind `/:handle/:slug`.

import { normalizeCatalogEntry, type CatalogEntry } from './catalog.js';
import type { PublicCreatorProfile } from './creatorProfileApi.js';
import { normalizeLocalizedDescription, type LocalizedGameDescription } from './gamePageDescription.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface GamePage {
  entry: CatalogEntry;
  creator: PublicCreatorProfile | null;
  platformAuthored: boolean;
  description: string | null;
  localizedDescription?: LocalizedGameDescription;
}

export async function fetchGamePage(slug: string): Promise<GamePage> {
  const response = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/page`);
  if (response.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (!response.ok) throw new Error(`game page request failed: ${response.status}`);
  const body = (await response.json()) as Omit<GamePage, 'entry'> & { entry: unknown };
  const entry = normalizeCatalogEntry(body.entry);
  if (!entry) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  const localizedDescription = normalizeLocalizedDescription(body.localizedDescription);
  return {
    entry,
    creator: body.creator ?? null,
    platformAuthored: body.platformAuthored === true,
    description: typeof body.description === 'string' ? body.description : null,
    ...(localizedDescription ? { localizedDescription } : {}),
  };
}
