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

export interface GamePageRelease {
  version: string;
  createdAt: string;
  current: boolean;
  gateGreen: boolean | null;
  origin?: 'editor';
}

export interface GamePageStats {
  plays: number;
  medianPlaySeconds: number | null;
  windowDays: number;
}

export interface GamePage {
  entry: CatalogEntry;
  creator: PublicCreatorProfile | null;
  /** Agent-authored markdown — render only through SpecMarkdown, never innerHTML. */
  specMarkdown: string | null;
  modules: string[] | null;
  budget: { usedBytes: number; limitBytes: number } | null;
  releases: GamePageRelease[];
  stats: GamePageStats | null;
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
    specMarkdown: typeof body.specMarkdown === 'string' ? body.specMarkdown : null,
    modules: Array.isArray(body.modules) ? body.modules.filter((m): m is string => typeof m === 'string') : null,
    budget: body.budget ?? null,
    releases: Array.isArray(body.releases) ? body.releases : [],
    stats: body.stats ?? null,
  };
}
