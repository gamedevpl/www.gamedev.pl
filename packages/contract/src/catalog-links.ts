// A game's clip and code links, from SPEC youtube / x / source.
export interface CatalogLinks {
  youtube?: string;
  x?: string;
  source?: string;
}

const LINK_HOSTS: Record<keyof CatalogLinks, readonly string[]> = {
  youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
  x: ['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'],
  source: ['github.com', 'gitlab.com', 'codeberg.org'],
};

function parseLink(value: unknown, hosts: readonly string[]): string | undefined {
  if (typeof value !== 'string') return undefined;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.username || url.password || !hosts.includes(url.hostname)) return undefined;
  return url.toString();
}

// Keeps only https links to the expected host; null when none survive.
export function parseCatalogLinks(value: unknown): CatalogLinks | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const youtube = parseLink(raw.youtube, LINK_HOSTS.youtube);
  const x = parseLink(raw.x, LINK_HOSTS.x);
  const source = parseLink(raw.source, LINK_HOSTS.source);
  return youtube || x || source
    ? { ...(youtube ? { youtube } : {}), ...(x ? { x } : {}), ...(source ? { source } : {}) }
    : null;
}
