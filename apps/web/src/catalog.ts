export interface CatalogEntry {
  slug: string;
  title: string;
  genre: string;
  controls: string;
  status: string;
}

/** A published game assembled by the API, ready for the sandboxed iframe's srcDoc. */
export interface PublishedGame {
  slug: string;
  title: string;
  html: string;
}

// The catalog and published games are served by our own API (which reads the —
// possibly private — games repo through the authenticated GitHub API), so the
// only access boundary is the app's own gate. Same origin in production.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export async function fetchCatalog(): Promise<CatalogEntry[]> {
  const response = await fetch(`${API_BASE}/api/catalog`);

  if (!response.ok) {
    throw new Error(`Catalog request failed (${response.status} ${response.statusText || 'Unknown error'})`);
  }

  const body = (await response.json()) as unknown;

  if (!Array.isArray(body)) {
    throw new Error('Catalog response was not an array');
  }

  return body.filter(
    (entry): entry is CatalogEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof entry.slug === 'string' &&
      typeof entry.title === 'string' &&
      typeof entry.genre === 'string' &&
      typeof entry.controls === 'string' &&
      typeof entry.status === 'string' &&
      entry.status === 'published',
  );
}

export async function fetchPublishedGame(slug: string): Promise<PublishedGame> {
  const response = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}`);

  if (!response.ok) {
    throw new Error(`Game request failed (${response.status} ${response.statusText || 'Unknown error'})`);
  }

  const body = (await response.json()) as PublishedGame;
  if (typeof body?.html !== 'string' || typeof body?.title !== 'string') {
    throw new Error('Game response was malformed');
  }
  return body;
}
