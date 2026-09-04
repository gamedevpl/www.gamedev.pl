import type { GameHealth } from '../../healthApi.js';
import type { StudioGame } from '../../studioApi.js';

export function healthFor(game: StudioGame, rows: GameHealth[]): GameHealth | null {
  if (!game.slug) return null;
  return rows.find((row) => row.slug === game.slug) ?? null;
}
