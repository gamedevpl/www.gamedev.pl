export interface CatalogEntry {
  slug: string;
  title: string;
  genre: string;
  controls: string;
  status: string;
}

const GAMES_ORIGIN = import.meta.env.VITE_GAMES_ORIGIN ?? 'https://gamedevpl.github.io/www.gamedev.pl-games';

export function gameUrl(slug: string): string {
  return `${GAMES_ORIGIN}/games/${slug}/index.html`;
}

export async function fetchCatalog(): Promise<CatalogEntry[]> {
  const response = await fetch(`${GAMES_ORIGIN}/catalog.json`);

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
