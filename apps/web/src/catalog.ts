export interface CatalogScreenshot {
  name: string;
  file: string;
}

export interface CatalogMedia {
  screenshots: CatalogScreenshot[];
  video: string | null;
}

/** Present only for games that declare `multiplayer: controllers` in their spec. */
export interface CatalogMultiplayer {
  mode: 'controllers';
  minPlayers: number;
  maxPlayers: number;
}

/** The orientation a game was designed for; 'any' unless its spec says otherwise. */
export type CatalogOrientation = 'any' | 'portrait' | 'landscape';

/**
 * How a game can be driven by a finger. Unlike everything else on an entry this is
 * derived from the game's own source by the games repo's build (`inferTouchSupport`),
 * never authored in a spec — a spec cannot claim playability the code doesn't have.
 * `gamekit` = GameKit's on-screen pad, `native` = the game draws its own touch input,
 * `controllers` = playable only with phones as controllers on a second screen,
 * `none` = keyboard only. null when the API served a catalog without the field.
 */
export type CatalogTouch = 'gamekit' | 'native' | 'controllers' | 'none';

export interface CatalogEntry {
  slug: string;
  title: string;
  genre: string;
  controls: string;
  status: string;
  media: CatalogMedia | null;
  multiplayer: CatalogMultiplayer | null;
  orientation: CatalogOrientation;
  touch: CatalogTouch | null;
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

export function catalogMediaUrl(slug: string, filename: string): string {
  return `${API_BASE}/api/games/${encodeURIComponent(slug)}/media/${encodeURIComponent(filename)}`;
}

function parseCatalogMedia(value: unknown): CatalogMedia | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const media = value as { screenshots?: unknown; video?: unknown };
  const screenshots = Array.isArray(media.screenshots)
    ? media.screenshots.filter(
        (screenshot): screenshot is CatalogScreenshot =>
          typeof screenshot === 'object' &&
          screenshot !== null &&
          typeof (screenshot as CatalogScreenshot).name === 'string' &&
          typeof (screenshot as CatalogScreenshot).file === 'string',
      )
    : [];
  const video = typeof media.video === 'string' ? media.video : null;

  return screenshots.length > 0 || video ? { screenshots, video } : null;
}

function parseCatalogMultiplayer(value: unknown): CatalogMultiplayer | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const multiplayer = value as { mode?: unknown; minPlayers?: unknown; maxPlayers?: unknown };
  if (
    multiplayer.mode !== 'controllers' ||
    typeof multiplayer.minPlayers !== 'number' ||
    typeof multiplayer.maxPlayers !== 'number'
  ) {
    return null;
  }
  return { mode: 'controllers', minPlayers: multiplayer.minPlayers, maxPlayers: multiplayer.maxPlayers };
}

/** An older API (or a spec typo the API let through) simply means "no preference". */
function parseCatalogOrientation(value: unknown): CatalogOrientation {
  return value === 'portrait' || value === 'landscape' ? value : 'any';
}

const CATALOG_TOUCH_VALUES = new Set<string>(['gamekit', 'native', 'controllers', 'none']);

/**
 * null rather than a guess when the field is missing or unrecognised: the UI only
 * warns a phone visitor off a game it *knows* is keyboard-only, so an absent value
 * has to mean "unknown", never "fine" and never "broken".
 */
function parseCatalogTouch(value: unknown): CatalogTouch | null {
  return typeof value === 'string' && CATALOG_TOUCH_VALUES.has(value) ? (value as CatalogTouch) : null;
}

async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.clone().json()) as { error?: unknown };
    if (typeof body?.error === 'string' && body.error.trim()) return body.error;
  } catch {
    // Non-JSON error bodies fall through to the status-based fallback.
  }
  return fallback;
}

export async function fetchCatalog(): Promise<CatalogEntry[]> {
  const response = await fetch(`${API_BASE}/api/catalog`);

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Catalog request failed (${response.status})`));
  }

  const body = (await response.json()) as unknown;

  if (!Array.isArray(body)) {
    throw new Error('Catalog response was not an array');
  }

  return body
    .filter(
      (
        entry,
      ): entry is Omit<CatalogEntry, 'media' | 'multiplayer' | 'orientation' | 'touch'> & {
        media?: unknown;
        multiplayer?: unknown;
        orientation?: unknown;
        touch?: unknown;
      } =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof entry.slug === 'string' &&
        typeof entry.title === 'string' &&
        typeof entry.genre === 'string' &&
        typeof entry.controls === 'string' &&
        typeof entry.status === 'string' &&
        entry.status === 'published',
    )
    .map((entry) => ({
      ...entry,
      media: parseCatalogMedia(entry.media),
      multiplayer: parseCatalogMultiplayer((entry as { multiplayer?: unknown }).multiplayer),
      orientation: parseCatalogOrientation(entry.orientation),
      touch: parseCatalogTouch(entry.touch),
    }));
}

export async function fetchPublishedGame(slug: string): Promise<PublishedGame> {
  const response = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}`);

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Game request failed (${response.status})`));
  }

  const body = (await response.json()) as PublishedGame;
  if (typeof body?.html !== 'string' || typeof body?.title !== 'string') {
    throw new Error('Game response was malformed');
  }
  return body;
}
