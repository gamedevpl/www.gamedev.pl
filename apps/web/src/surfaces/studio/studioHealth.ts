import type { GameHealth } from '../../healthApi.js';
import type { StudioGame } from '../../studioApi.js';

// Round the total first: rounding the remainder alone yields "1m 60s".
export function formatSeconds(seconds: number): string {
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

export function healthFor(game: StudioGame, rows: GameHealth[]): GameHealth | null {
  if (!game.slug) return null;
  return rows.find((row) => row.slug === game.slug) ?? null;
}
