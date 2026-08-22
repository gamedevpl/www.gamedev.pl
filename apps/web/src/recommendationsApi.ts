import { RECOMMEND_REASONS, type RecommendReason } from '@gamedevpl/contract';

export type RecommendationReason = RecommendReason;

export interface RecommendationItem {
  slug: string;
  reason: RecommendationReason;
}

export interface CatalogSortPayload {
  items: RecommendationItem[];
  popularity: Array<{ slug: string; sessions: number }>;
  lastPlayed: Array<{ slug: string; lastPlayedAt: string }>;
  newest: string[];
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const SIGNALS_CACHE_KEY = 'gdpl.catalogSortSignals';

const REASONS = new Set<RecommendationReason>(RECOMMEND_REASONS);

function parseItems(body: unknown): RecommendationItem[] {
  if (typeof body !== 'object' || body === null || !Array.isArray((body as { items?: unknown }).items)) {
    return [];
  }
  return (body as { items: unknown[] }).items.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const slug = (item as { slug?: unknown }).slug;
    const reason = (item as { reason?: unknown }).reason;
    if (typeof slug !== 'string' || typeof reason !== 'string' || !REASONS.has(reason as RecommendationReason)) {
      return [];
    }
    return [{ slug, reason: reason as RecommendationReason }];
  });
}

function parsePopularity(body: unknown): Array<{ slug: string; sessions: number }> {
  if (typeof body !== 'object' || body === null || !Array.isArray((body as { popularity?: unknown }).popularity)) {
    return [];
  }
  return (body as { popularity: unknown[] }).popularity.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const slug = (item as { slug?: unknown }).slug;
    const sessions = (item as { sessions?: unknown }).sessions;
    if (typeof slug !== 'string' || typeof sessions !== 'number' || !Number.isFinite(sessions)) return [];
    return [{ slug, sessions: Math.max(0, Math.floor(sessions)) }];
  });
}

function parseLastPlayed(body: unknown): Array<{ slug: string; lastPlayedAt: string }> {
  if (typeof body !== 'object' || body === null || !Array.isArray((body as { lastPlayed?: unknown }).lastPlayed)) {
    return [];
  }
  return (body as { lastPlayed: unknown[] }).lastPlayed.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const slug = (item as { slug?: unknown }).slug;
    const lastPlayedAt = (item as { lastPlayedAt?: unknown }).lastPlayedAt;
    if (typeof slug !== 'string' || typeof lastPlayedAt !== 'string' || !lastPlayedAt) return [];
    return [{ slug, lastPlayedAt }];
  });
}

function parseNewest(body: unknown): string[] {
  if (typeof body !== 'object' || body === null || !Array.isArray((body as { newest?: unknown }).newest)) {
    return [];
  }
  return (body as { newest: unknown[] }).newest.filter(
    (slug): slug is string => typeof slug === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(slug),
  );
}

function parseCachedPayload(raw: string): (CatalogSortPayload & { viewer: string }) | null {
  try {
    const body: unknown = JSON.parse(raw);
    if (typeof body !== 'object' || body === null) return null;
    const viewer = (body as { viewer?: unknown }).viewer;
    // Unscoped legacy entries are unusable — affinity is account-specific.
    if (typeof viewer !== 'string') return null;
    return {
      viewer,
      items: parseItems(body),
      popularity: parsePopularity(body),
      lastPlayed: parseLastPlayed(body),
      newest: parseNewest(body),
    };
  } catch {
    return null;
  }
}

function viewerKey(viewerUid: string | null | undefined): string {
  return viewerUid ?? '';
}

/**
 * Last recommendations payload for this viewer — used so reload does not flash
 * catalog-default order. Returns null when missing or cached for another account.
 */
export function readCachedCatalogSortPayload(viewerUid: string | null = null): CatalogSortPayload | null {
  try {
    const raw = sessionStorage.getItem(SIGNALS_CACHE_KEY);
    const parsed = raw ? parseCachedPayload(raw) : null;
    if (!parsed || parsed.viewer !== viewerKey(viewerUid)) return null;
    return {
      items: parsed.items,
      popularity: parsed.popularity,
      lastPlayed: parsed.lastPlayed,
      newest: parsed.newest,
    };
  } catch {
    return null;
  }
}

export function writeCachedCatalogSortPayload(payload: CatalogSortPayload, viewerUid: string | null = null): void {
  try {
    sessionStorage.setItem(SIGNALS_CACHE_KEY, JSON.stringify({ viewer: viewerKey(viewerUid), ...payload }));
  } catch {
    // Private mode / quota — next reload may wait on the network once.
  }
}

/** Drop the sort-signals cache (logout / account switch). */
export function clearCachedCatalogSortPayload(): void {
  try {
    sessionStorage.removeItem(SIGNALS_CACHE_KEY);
  } catch {
    // Private mode — ignore.
  }
}

export async function fetchCatalogSortSignals(
  recent: string[] = [],
  viewerUid: string | null = null,
): Promise<CatalogSortPayload> {
  const params = new URLSearchParams();
  if (recent.length > 0) params.set('recent', recent.slice(0, 8).join(','));
  const query = params.toString();
  const empty: CatalogSortPayload = { items: [], popularity: [], lastPlayed: [], newest: [] };
  const response = await fetch(`${API_BASE}/api/recommendations${query ? `?${query}` : ''}`, {
    credentials: 'include',
  });
  if (!response.ok) return empty;
  try {
    const body: unknown = await response.json();
    const payload: CatalogSortPayload = {
      items: parseItems(body),
      popularity: parsePopularity(body),
      lastPlayed: parseLastPlayed(body),
      newest: parseNewest(body),
    };
    writeCachedCatalogSortPayload(payload, viewerUid);
    return payload;
  } catch {
    return empty;
  }
}

/** @deprecated Prefer fetchCatalogSortSignals — kept for call sites that only need ranking. */
export async function fetchRecommendations(recent: string[] = []): Promise<RecommendationItem[]> {
  return (await fetchCatalogSortSignals(recent)).items;
}

/**
 * Reorders the catalog by recommendation slugs. Games missing from the ranking keep
 * their relative order at the end — so a partial ranking never drops a published game.
 */
export function orderCatalogByRecommendations<T extends { slug: string }>(
  entries: T[],
  rankedSlugs: string[] | null | undefined,
): T[] {
  if (!rankedSlugs || rankedSlugs.length === 0) return entries;
  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  const seen = new Set<string>();
  const ordered: T[] = [];
  for (const slug of rankedSlugs) {
    const entry = bySlug.get(slug);
    if (!entry || seen.has(slug)) continue;
    ordered.push(entry);
    seen.add(slug);
  }
  for (const entry of entries) {
    if (seen.has(entry.slug)) continue;
    ordered.push(entry);
  }
  return ordered;
}

/** Best-effort; never throws into the play path. */
export function recordGamePlayed(slug: string): void {
  void fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/played`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {
    // Affinity is advisory — a failed write must not surface as a play error.
  });
}
