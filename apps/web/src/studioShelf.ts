import type { SubmissionState } from './submissionApi.js';
import type { StudioGame } from './studioApi.js';

/** In-progress builds — same “live” treatment as the home rail / studio shelf. */
export const STUDIO_LIVE_STATUSES = new Set<SubmissionState>(['queued', 'building', 'in_review', 'publishing']);

export type StudioShelfFilter = 'all' | 'building' | 'live';

/** Show search + filter chips once the shelf is no longer a glanceable handful. */
export const STUDIO_SHELF_TOOLS_AT = 5;

export function isStudioGamePublished(game: StudioGame): boolean {
  return Boolean(game.publishedAt && game.slug) || game.lastKnownStatus === 'published';
}

function shelfRank(game: StudioGame): number {
  const status = game.lastKnownStatus;
  if (status && STUDIO_LIVE_STATUSES.has(status)) return 0;
  if (isStudioGamePublished(game)) return 1;
  return 2;
}

/** Active builds first, then live games, then the rest — newest within each band. */
export function sortStudioGames(games: readonly StudioGame[]): StudioGame[] {
  return [...games].sort((a, b) => {
    const byRank = shelfRank(a) - shelfRank(b);
    if (byRank !== 0) return byRank;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function matchesStudioShelfFilter(game: StudioGame, filter: StudioShelfFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'building') {
    return Boolean(game.lastKnownStatus && STUDIO_LIVE_STATUSES.has(game.lastKnownStatus));
  }
  return isStudioGamePublished(game);
}

export function matchesStudioShelfQuery(game: StudioGame, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return game.title.toLowerCase().includes(q) || (game.slug?.toLowerCase().includes(q) ?? false);
}

export function filterStudioGames(
  games: readonly StudioGame[],
  opts: { filter?: StudioShelfFilter; query?: string } = {},
): StudioGame[] {
  const filter = opts.filter ?? 'all';
  const query = opts.query ?? '';
  return sortStudioGames(games).filter(
    (game) => matchesStudioShelfFilter(game, filter) && matchesStudioShelfQuery(game, query),
  );
}
