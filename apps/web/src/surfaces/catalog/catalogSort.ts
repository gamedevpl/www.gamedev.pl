import type { CatalogEntry } from '../../catalog.js';
import { readStorageItem, removeStorageItem, writeStorageItem } from '../../core/persistence.js';
import { getRecentPlays } from '../../recentPlays.js';

export type CatalogSortMode = 'recommended' | 'newest' | 'most_played' | 'last_played' | 'alpha';

export const CATALOG_SORT_MODES: CatalogSortMode[] = ['recommended', 'newest', 'most_played', 'last_played', 'alpha'];

export const DEFAULT_CATALOG_SORT: CatalogSortMode = 'recommended';

/** Catalog filters — independent of sort. Your games also pin first when the filter is off. */
export type CatalogFilterId = 'your_games' | 'not_played';

export const CATALOG_FILTER_IDS: CatalogFilterId[] = ['your_games', 'not_played'];

const SORT_STORAGE_KEY = 'gdpl.catalogSort';
const FILTERS_STORAGE_KEY = 'gdpl.catalogFilters';
/** @deprecated Migrated into `gdpl.catalogFilters`. */
const LEGACY_NOT_PLAYED_FILTER_KEY = 'gdpl.catalogNotPlayed';
/** Legacy sort value from when Not played was a sort mode, not a filter. */
const LEGACY_NOT_PLAYED_SORT = 'not_played';

export function isCatalogSortMode(value: unknown): value is CatalogSortMode {
  return typeof value === 'string' && (CATALOG_SORT_MODES as string[]).includes(value);
}

export function isCatalogFilterId(value: unknown): value is CatalogFilterId {
  return typeof value === 'string' && (CATALOG_FILTER_IDS as string[]).includes(value);
}

export function readCatalogSortMode(): CatalogSortMode {
  const raw = readStorageItem(SORT_STORAGE_KEY);
  if (raw === LEGACY_NOT_PLAYED_SORT) return DEFAULT_CATALOG_SORT;
  return isCatalogSortMode(raw) ? raw : DEFAULT_CATALOG_SORT;
}

export function writeCatalogSortMode(mode: CatalogSortMode): void {
  writeStorageItem(SORT_STORAGE_KEY, mode);
}

/**
 * Active catalog filters. Migrates legacy not-played prefs into the set once.
 */
export function readCatalogFilters(): Set<CatalogFilterId> {
  const filters = new Set<CatalogFilterId>();
  const raw = readStorageItem(FILTERS_STORAGE_KEY);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (isCatalogFilterId(item)) filters.add(item);
        }
      }
    } catch {
      // Bad JSON — empty set.
    }
    return filters;
  }

  // One-shot migrations from older persistence shapes.
  if (readStorageItem(LEGACY_NOT_PLAYED_FILTER_KEY) === '1') {
    filters.add('not_played');
  } else if (readStorageItem(SORT_STORAGE_KEY) === LEGACY_NOT_PLAYED_SORT) {
    filters.add('not_played');
    writeStorageItem(SORT_STORAGE_KEY, DEFAULT_CATALOG_SORT);
  }
  if (filters.size > 0) writeCatalogFilters(filters);
  removeStorageItem(LEGACY_NOT_PLAYED_FILTER_KEY);
  return filters;
}

export function writeCatalogFilters(filters: ReadonlySet<CatalogFilterId>): void {
  writeStorageItem(FILTERS_STORAGE_KEY, JSON.stringify([...filters]));
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

export const EMPTY_CATALOG_SORT_SIGNALS: CatalogSortSignals = {
  recommended: [],
  newest: [],
  sessions: new Map(),
  affinityLastPlayed: new Map(),
};

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

/** Slugs this visitor has opened — affinity (signed-in) plus device-local recent. */
export function playedSlugSet(affinityLastPlayed: ReadonlyMap<string, string>): Set<string> {
  const played = new Set<string>(affinityLastPlayed.keys());
  for (const slug of getRecentPlays()) played.add(slug);
  return played;
}

/** Keep only games the visitor has not opened yet. */
export function filterUnplayedEntries<T extends { slug: string }>(
  entries: T[],
  affinityLastPlayed: ReadonlyMap<string, string>,
): T[] {
  const played = playedSlugSet(affinityLastPlayed);
  return entries.filter((entry) => !played.has(entry.slug));
}

/**
 * Apply active filters. `your_games` keeps only the creator’s published slugs
 * (in-progress builds stay visible separately). Filters combine with AND.
 * When the filter is off, {@link orderCatalogEntries} still pins yours first.
 */
export function applyCatalogFilters<T extends { slug: string }>(
  entries: T[],
  filters: ReadonlySet<CatalogFilterId>,
  affinityLastPlayed: ReadonlyMap<string, string>,
  mySlugs: ReadonlySet<string> = new Set(),
): T[] {
  let result = entries;
  if (filters.has('your_games')) {
    result = result.filter((entry) => mySlugs.has(entry.slug));
  }
  if (filters.has('not_played')) {
    result = filterUnplayedEntries(result, affinityLastPlayed);
  }
  return result;
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

/**
 * Unified gallery order: the creator’s published games first (same sort within
 * that group), then everyone else’s. Additive — never hides the rest of the catalog.
 */
export function orderCatalogEntries(
  entries: CatalogEntry[],
  mode: CatalogSortMode,
  signals: CatalogSortSignals,
  mySlugs: ReadonlySet<string>,
): CatalogEntry[] {
  if (mySlugs.size === 0) return sortCatalogEntries(entries, mode, signals);
  const mine = entries.filter((entry) => mySlugs.has(entry.slug));
  const others = entries.filter((entry) => !mySlugs.has(entry.slug));
  if (mine.length === 0) return sortCatalogEntries(others, mode, signals);
  return [...sortCatalogEntries(mine, mode, signals), ...sortCatalogEntries(others, mode, signals)];
}

/** Sort modes that need the recommendations payload to avoid painting the wrong order. */
export function catalogSortNeedsSignals(mode: CatalogSortMode): boolean {
  return mode !== 'alpha';
}
