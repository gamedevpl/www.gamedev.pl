export type RecommendationReason = 'popular' | 'for_you' | 'because_you_played' | 'continue';

export interface RecommendationItem {
  slug: string;
  reason: RecommendationReason;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

const REASONS = new Set<RecommendationReason>(['popular', 'for_you', 'because_you_played', 'continue']);

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

export async function fetchRecommendations(recent: string[] = []): Promise<RecommendationItem[]> {
  const params = new URLSearchParams();
  if (recent.length > 0) params.set('recent', recent.slice(0, 8).join(','));
  const query = params.toString();
  const response = await fetch(`${API_BASE}/api/recommendations${query ? `?${query}` : ''}`, {
    credentials: 'include',
  });
  if (!response.ok) return [];
  try {
    return parseItems(await response.json());
  } catch {
    return [];
  }
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
