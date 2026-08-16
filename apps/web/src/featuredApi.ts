const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

// Curated flagship pool for the home page; fails open to empty.
export async function fetchFeaturedSlugs(): Promise<string[]> {
  try {
    const response = await fetch(`${API_BASE}/api/featured`);
    if (!response.ok) return [];
    const body = (await response.json()) as unknown;
    const slugs = (body as { slugs?: unknown })?.slugs;
    if (!Array.isArray(slugs)) return [];
    return slugs.filter((slug): slug is string => typeof slug === 'string');
  } catch {
    return [];
  }
}
