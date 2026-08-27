import type { CatalogOrientation, CatalogTouch } from './catalog-vocab.js';

// One screenshot listed in a game's SPEC media block.
export interface CatalogScreenshot {
  name: string;
  file: string;
}

// Pictures and video a catalog card can show.
export interface CatalogMedia {
  screenshots: CatalogScreenshot[];
  video: string | null;
}

// Present only for games declaring `multiplayer: controllers`.
export interface CatalogMultiplayer {
  mode: 'controllers';
  minPlayers: number;
  maxPlayers: number;
}

// The game keeps progress for signed-in players.
export type CatalogSaves = 'player';

// The game has one world every player writes into.
export type CatalogWorld = 'shared';

// Extra ways a game can be steered beyond keys and touch.
export type CatalogSensing = 'tilt' | 'backdrop';

// Whether the game exposes an EditorKit content editor.
export type CatalogEditor = 'content';

// The status a catalog entry carries when its game is live.

// SPEC frontmatter is agent-authored, so this stays a bare string.
export const CATALOG_PUBLISHED_STATUS = 'published';

// One reading of the repo lane's "is this game live?".
export function isPublishedEntry(entry: { status?: string } | null | undefined): boolean {
  return entry?.status === CATALOG_PUBLISHED_STATUS;
}

// One game's catalog entry, derived from its SPEC frontmatter.
export interface CatalogEntry {
  slug: string;
  // Agent-authored, prompt-influenced text — render escaped.
  title: string;
  genre: string;
  controls: string;
  status: string;
  media: CatalogMedia | null;
  multiplayer: CatalogMultiplayer | null;
  // Advisory badge only; the bridge never gates on it.
  saves: CatalogSaves | null;
  // Advisory like saves, but it promises other people are here.
  world: CatalogWorld | null;
  sensing: CatalogSensing | null;
  editor: CatalogEditor | null;
  orientation: CatalogOrientation;
  // Absent on the SPEC-only GraphQL fallback, null once normalized.
  touch?: CatalogTouch | null;
  // Who commissioned the game; unverified, and null when unknown.
  submittedBy: string | null;
  // Set when the catalog join resolved a creator profile.
  creatorHandle?: string | null;
  // Handles whose proposals were merged into the live version.
  contributorHandles?: string[];
  // AI-generated punchy summary/taglines (e.g. from Flash-Lite).
  tagline?: { en?: string; pl?: string } | null;
  // AI-generated concise keybindings summary.
  shortControls?: { en?: string; pl?: string } | null;
  // AI-generated search keywords for intent matching.
  searchKeywords?: string[] | null;
}
