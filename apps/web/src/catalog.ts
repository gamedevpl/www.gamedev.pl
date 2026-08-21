import {
  CATALOG_ORIENTATIONS,
  CATALOG_TOUCH_VALUES,
  type CatalogOrientation,
  type CatalogTouch,
} from '@gamedevpl/contract';

/** The orientation a game was designed for; 'any' unless its spec says otherwise. */
export type { CatalogOrientation };

/**
 * How a game can be driven by a finger. Unlike everything else on an entry this is
 * derived from the game's own source by the games repo's build (`inferTouchSupport`),
 * never authored in a spec — a spec cannot claim playability the code doesn't have.
 * `gamekit` = GameKit's on-screen pad, `native` = the game draws its own touch input,
 * `controllers` = playable only with phones as controllers on a second screen,
 * `none` = keyboard only. null when the API served a catalog without the field.
 */
export type { CatalogTouch };

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

export interface CatalogEntry {
  slug: string;
  title: string;
  genre: string;
  controls: string;
  status: string;
  media: CatalogMedia | null;
  multiplayer: CatalogMultiplayer | null;
  /**
   * `player` when the game keeps progress for signed-in players. Advisory: whether a
   * save slot is opened is decided by whether the running game asks for one, so this is
   * for telling a player what to expect, never for gating the bridge.
   */
  saves: 'player' | null;
  /**
   * `shared` when the game has a world every player of it writes into. Advisory in
   * exactly the same way `saves` is — the bridge is live for every published game and
   * only a game that asks gets a world — but it carries a heavier promise: "other
   * people are here" is why somebody clicks, so it is worth being right about.
   */
  world: 'shared' | null;
  /**
   * `tilt` when the game can also be steered by tilting the device. Advisory in the
   * same way `saves` is: the sense relay is gated by the running game saying hello
   * over the bridge, never by this field — it exists to badge motion play.
   */
  sensing: 'tilt' | 'backdrop' | null;
  orientation: CatalogOrientation;
  touch: CatalogTouch | null;
  /**
   * Who commissioned the game (`submitted_by` in the games-repo SPEC). Unverified —
   * a handle, a display name, or the platform sentinel. null when unknown.
   * For store games with a creator profile, this is the profile display name.
   */
  submittedBy: string | null;
  /**
   * Unique creator handle when the catalog join resolved a profile. Present → the
   * byline links to `/:handle`.
   */
  creatorHandle?: string | null;
  /**
   * Handles of people whose proposals were merged into the live version.
   *
   * Joined by the API from the version manifest, never from SPEC. Each links to
   * `/:handle` the same way the owner byline does — a merged contribution is credited
   * publicly or it is not credited at all.
   */
  contributorHandles?: string[];
}

/** Platform sentinel used in fixture / seed SPECs for games with no human creator. */
export const PLATFORM_SUBMITTED_BY = 'gamedev-platform';

/** Re-exported so callers reach one name for "the platform's namespace". */
export { PLATFORM_HANDLE } from './router.js';
import { PLATFORM_HANDLE } from './router.js';

/**
 * True when the byline should read as the site itself rather than a named person —
 * missing values and the platform sentinel both mean "built here, no human creator".
 */
export function isPlatformAuthor(submittedBy: string | null | undefined): boolean {
  return !submittedBy || submittedBy === PLATFORM_SUBMITTED_BY;
}

/**
 * The handle a game's page lives under: its creator's, or the platform's when there
 * is no creator to name.
 *
 * Every published game has a page, so this never returns null — which is what lets
 * the catalog and the player link to one unconditionally. The server applies the same
 * fallback (`game-page-routes.ts`), and a wrong guess here is corrected by the page's
 * own canonical redirect rather than by a 404.
 */
export function gamePageHandle(entry: Pick<CatalogEntry, 'creatorHandle'>): string {
  return entry.creatorHandle ?? PLATFORM_HANDLE;
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

/**
 * `width` asks the API for a baked size variant instead of the original screenshot.
 *
 * Worth asking for: the arcade shows the same PNG at ~48 CSS px in the moment strip
 * and a few hundred as a card poster, and a PNG cannot be decoded partially — so
 * without this the browser decodes a full screenshot for every near-fold poster
 * (and again for each moment thumb after engage). An API that has no variant serves
 * the original, so this is safe to ask for against any deploy.
 */
export function catalogMediaUrl(slug: string, filename: string, width?: number): string {
  const base = `${API_BASE}/api/games/${encodeURIComponent(slug)}/media/${encodeURIComponent(filename)}`;
  return width === undefined ? base : `${base}?w=${width}`;
}

// Prefer a mid-capture still; opening is often an empty frame.
export function defaultScreenshotIndex(screenshots: Array<{ name: string }>): number {
  const idx = screenshots.findIndex((shot) => shot.name !== 'opening');
  return idx >= 0 ? idx : 0;
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
  return (CATALOG_ORIENTATIONS as readonly unknown[]).includes(value) ? (value as CatalogOrientation) : 'any';
}

/**
 * null rather than a guess when the field is missing or unrecognised: the UI only
 * warns a phone visitor off a game it *knows* is keyboard-only, so an absent value
 * has to mean "unknown", never "fine" and never "broken".
 */
function parseCatalogTouch(value: unknown): CatalogTouch | null {
  return (CATALOG_TOUCH_VALUES as readonly unknown[]).includes(value) ? (value as CatalogTouch) : null;
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

  return body.map((entry) => normalizeCatalogEntry(entry)).filter((entry): entry is CatalogEntry => entry !== null);
}

/**
 * Coerce one catalog-shaped API object into a CatalogEntry. Used by `/api/catalog` and
 * by the public creator profile page so media/byline fields are never dropped.
 */
export function normalizeCatalogEntry(value: unknown): CatalogEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.slug !== 'string' ||
    typeof entry.title !== 'string' ||
    typeof entry.genre !== 'string' ||
    typeof entry.controls !== 'string' ||
    typeof entry.status !== 'string' ||
    entry.status !== 'published'
  ) {
    return null;
  }
  return {
    slug: entry.slug,
    title: entry.title,
    genre: entry.genre,
    controls: entry.controls,
    status: entry.status,
    media: parseCatalogMedia(entry.media),
    multiplayer: parseCatalogMultiplayer(entry.multiplayer),
    saves: entry.saves === 'player' ? 'player' : null,
    world: entry.world === 'shared' ? 'shared' : null,
    sensing: entry.sensing === 'tilt' || entry.sensing === 'backdrop' ? entry.sensing : null,
    orientation: parseCatalogOrientation(entry.orientation),
    touch: parseCatalogTouch(entry.touch),
    submittedBy: parseCatalogSubmittedBy(entry.submittedBy ?? entry.submitted_by),
    creatorHandle: parseCatalogCreatorHandle(entry.creatorHandle),
    // Validated element-wise for the same reason the owner handle is: a byline that
    // links somewhere is a byline that can link somewhere wrong.
    contributorHandles: Array.isArray(entry.contributorHandles)
      ? entry.contributorHandles
          .map((handle) => parseCatalogCreatorHandle(handle))
          .filter((handle): handle is string => handle !== null)
      : undefined,
  };
}

function parseCatalogCreatorHandle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(trimmed)) return null;
  return trimmed;
}

/** Same rules as the API: null / "null" / missing → null; otherwise length-capped text. */
function parseCatalogSubmittedBy(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'null' || trimmed === '~') return null;
  return trimmed.slice(0, 40);
}

/** Thrown by {@link fetchPublishedGame} so callers can tell a miss from a glitch. */
export type GameFetchError = Error & { status?: number };

export async function fetchPublishedGame(slug: string): Promise<PublishedGame> {
  // Credentialed because a game is playable at this address before it is published —
  // by its creator always, by anyone else once the creator shares it. Without the
  // session cookie a creator opening their own unpublished game gets a 404.
  const response = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}`, { credentials: 'include' });

  if (!response.ok) {
    const error = new Error(
      await readApiErrorMessage(response, `Game request failed (${response.status})`),
    ) as GameFetchError;
    error.status = response.status;
    throw error;
  }

  const body = (await response.json()) as PublishedGame;
  if (typeof body?.html !== 'string' || typeof body?.title !== 'string') {
    throw new Error('Game response was malformed');
  }
  return body;
}
