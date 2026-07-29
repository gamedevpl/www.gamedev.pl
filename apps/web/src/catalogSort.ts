import type { CatalogEntry } from './catalog.js';
import { getRecentPlays } from './recentPlays.js';

export type CatalogSortMode = 'recommended' | 'newest' | 'most_played' | 'last_played' | 'alpha';

export const CATALOG_SORT_MODES: CatalogSortMode[] = [
  'recommended',
  'newest',
  'most_played',
  'last_played',
  'alpha',
];

export const DEFAULT_CATALOG_SORT: CatalogSortMode = 'recommended';

const STORAGE_KEY = 'gdpl.catalogSort';

export function isCatalogSortMode(value: unknown): value is CatalogSortMode {
  return typeof value === 'string' && (CATALOG_SORT_MODES as string[]).includes(value);
}

export function readCatalogSortMode(): CatalogSortMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isCatalogSortMode(raw) ? raw : DEFAULT_CATALOG_SORT;
  } catch {
    return DEFAULT_CATALOG_SORT;
  }
}

export function writeCatalogSortMode(mode: CatalogSortMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Private mode — preference simply does not persist.
  }
}

export interface CatalogSortSignals {
  /** Recommended ranking (may be empty → keep catalog order for that mode). */
  recommended: string[];
  /** Newest-first slug order from the server. */
  newest: string[];
  /** Sessions per slug for most-played. */
  sessions: ReadonlyMap<string, number>;
  /** Last-played timestamps (ISO) from signed-in affinity. */
  affinityLastPlayed: ReadonlyMap<string, string>;
}

function orderBySlugList<T extends { slug: string }>(entries: T[], order: string[]): T[] {
  if (order.length === 0) return entries;
  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  const seen = new Set<string>();
  const ordered: T[] = [];
  for (const slug of order) {
    const entry = bySlug.get(slug);
    if (!entry || seen.has(slug)) continue;
    ordered.push(entry);
    seen.add(slug);
  }
  for (const entry of entries) {
    if (!seen.has(entry.slug)) ordered.push(entry);
  }
  return ordered;
}

/**
 * Last-played order: signed-in affinity timestamps win when present; otherwise the
 * device-local recent list (newest first). Unplayed games keep catalog order at the end.
 */
function orderByLastPlayed<T extends { slug: string }>(
  entries: T[],
  affinityLastPlayed: ReadonlyMap<string, string>,
): T[] {
  const recent = getRecentPlays();
  const recentIndex = new Map(recent.map((slug, index) => [slug, index]));
  return [...entries].sort((a, b) => {
    const aAt = affinityLastPlayed.get(a.slug);
    const bAt = affinityLastPlayed.get(b.slug);
    if (aAt && bAt) return bAt.localeCompare(aAt) || a.slug.localeCompare(b.slug);
    if (aAt) return -1;
    if (bAt) return 1;
    const aRecent = recentIndex.get(a.slug);
    const bRecent = recentIndex.get(b.slug);
    if (aRecent !== undefined && bRecent !== undefined) return aRecent - bRecent;
    if (aRecent !== undefined) return -1;
    if (bRecent !== undefined) return 1;
    return 0;
  });
}

function orderByMostPlayed<T extends { slug: string; title: string }>(
  entries: T[],
  sessions: ReadonlyMap<string, number>,
): T[] {
  return [...entries].sort((a, b) => {
    const aSessions = sessions.get(a.slug) ?? 0;
    const bSessions = sessions.get(b.slug) ?? 0;
    if (bSessions !== aSessions) return bSessions - aSessions;
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });
}

function orderAlpha<T extends { title: string; slug: string }>(entries: T[]): T[] {
  return [...entries].sort(
    (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.slug.localeCompare(b.slug),
  );
}

export function sortCatalogEntries(
  entries: CatalogEntry[],
  mode: CatalogSortMode,
  signals: CatalogSortSignals,
): CatalogEntry[] {
  switch (mode) {
    case 'recommended':
      return orderBySlugList(entries, signals.recommended);
    case 'newest':
      return orderBySlugList(entries, signals.newest);
    case 'most_played':
      return orderByMostPlayed(entries, signals.sessions);
    case 'last_played':
      return orderByLastPlayed(entries, signals.affinityLastPlayed);
    case 'alpha':
      return orderAlpha(entries);
    default:
      return entries;
  }
}
