import type { StudioGame } from '../../studioApi.js';
import { isStudioGameShelfLive } from '../../studioShelf.js';

export function canShareStudioGame(game: StudioGame | null): boolean {
  return Boolean(
    game?.slug && game.lastKnownStatus !== 'abandoned' && (game.viewerRole !== 'editor' || isStudioGameShelfLive(game)),
  );
}

export function canClaimPublishHandle(game: StudioGame, handle?: string | null): boolean {
  return (
    !handle &&
    game.viewerRole !== 'editor' &&
    (game.lastKnownStatus === 'in_review' || game.lastKnownStatus === 'publishing')
  );
}
