import type { StudioTab } from '../../core/router.js';
import type { StudioGame } from '../../studioApi.js';

// Always the thread — build and live ask the same question.
export function defaultTabFor(): StudioTab {
  return 'thread';
}

export function tabAvailable(game: StudioGame, tab: StudioTab): boolean {
  // Edit exists only where the latest build ships an editor definition.
  if (tab === 'edit') return Boolean(game.editable && game.slug);

  // Code surface: any owned game with a slug, no manifest gate.
  if (tab === 'code') return Boolean(game.codeSurface && game.slug);
  return true;
}

export function resolveTab(game: StudioGame, requested?: StudioTab): StudioTab {
  if (requested && tabAvailable(game, requested)) return requested;
  return defaultTabFor();
}

// Slug when it has one; token is the pre-slug fallback.

// A token in the URL is a grant left in history.
export function studioAddress(game: StudioGame): string {
  return game.slug ?? game.token;
}
