import { SUBMISSION_IN_FLIGHT_STATES } from '@gamedevpl/contract';
import type { SubmissionState } from './submissionApi.js';
import type { StudioGame } from './studioApi.js';

/** In-progress builds — same “live” treatment as the home rail / studio shelf. */
export const STUDIO_LIVE_STATUSES: ReadonlySet<SubmissionState> = new Set(SUBMISSION_IN_FLIGHT_STATES);

export type StudioShelfFilter = 'all' | 'building' | 'live';

/**
 * A shelf row. One game, even when the store still holds both the published job and an
 * in-flight improvement on the same slug.
 *
 * `livePublishedAt` is stamped only when the open row is that improvement: the tip to
 * talk to is the new job (no `publishedAt` of its own), but the game is still live in
 * the catalog, so Live filters / Play / stats need the sibling's publish time without
 * flipping the composer onto `improve()` (that path requires the published job's token).
 * Empty string means “catalog-live, publish time unknown” (`lastKnownStatus` said
 * published but no timestamp) — present for liveness, falsy so the UI skips the date.
 */
export type StudioShelfGame = StudioGame & { livePublishedAt?: string };

/** Show search + filter chips once the shelf is no longer a glanceable handful. */
export const STUDIO_SHELF_TOOLS_AT = 5;

export function isStudioGamePublished(game: StudioGame): boolean {
  if (game.live === false) return false;
  return Boolean(game.publishedAt && game.slug) || game.lastKnownStatus === 'published';
}

/** Live in the catalog — this job, or a published sibling collapsed behind an improve tip. */
export function isStudioGameShelfLive(game: StudioShelfGame): boolean {
  return isStudioGamePublished(game) || game.livePublishedAt !== undefined;
}

function shelfRank(game: StudioShelfGame): number {
  const status = game.lastKnownStatus;
  if (status && STUDIO_LIVE_STATUSES.has(status)) return 0;
  if (isStudioGameShelfLive(game)) return 1;
  return 2;
}

/** Active builds first, then live games, then the rest — newest within each band. */
export function sortStudioGames(games: readonly StudioShelfGame[]): StudioShelfGame[] {
  return [...games].sort((a, b) => {
    const byRank = shelfRank(a) - shelfRank(b);
    if (byRank !== 0) return byRank;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * One row per game. An improvement is a new job on an existing slug — listing both the
 * live game and the revise tip as separate picks is the same title twice in the switcher.
 * Prefer the newest job (the tip); keep the sibling's publish time when the tip itself
 * is not yet published.
 */
export function collapseStudioGames(games: readonly StudioGame[]): StudioShelfGame[] {
  const bySlug = new Map<string, StudioGame[]>();
  const unslugged: StudioShelfGame[] = [];

  for (const game of games) {
    if (!game.slug) {
      unslugged.push(game);
      continue;
    }
    const group = bySlug.get(game.slug);
    if (group) group.push(game);
    else bySlug.set(game.slug, [game]);
  }

  const collapsed: StudioShelfGame[] = [];
  for (const group of bySlug.values()) {
    const newest = [...group].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!;
    if (isStudioGamePublished(newest)) {
      collapsed.push(newest);
      continue;
    }
    const liveSibling = group.find((game) => isStudioGamePublished(game));
    collapsed.push(liveSibling ? { ...newest, livePublishedAt: liveSibling.publishedAt ?? '' } : newest);
  }

  return [...collapsed, ...unslugged];
}

export function matchesStudioShelfFilter(game: StudioShelfGame, filter: StudioShelfFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'building') {
    return Boolean(game.lastKnownStatus && STUDIO_LIVE_STATUSES.has(game.lastKnownStatus));
  }
  return isStudioGameShelfLive(game);
}

export function matchesStudioShelfQuery(game: StudioShelfGame, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return game.title.toLowerCase().includes(q) || (game.slug?.toLowerCase().includes(q) ?? false);
}

export function filterStudioGames(
  games: readonly StudioShelfGame[],
  opts: { filter?: StudioShelfFilter; query?: string } = {},
): StudioShelfGame[] {
  const filter = opts.filter ?? 'all';
  const query = opts.query ?? '';
  return sortStudioGames(games).filter(
    (game) => matchesStudioShelfFilter(game, filter) && matchesStudioShelfQuery(game, query),
  );
}

/**
 * Two-letter mark for shelf rows — first letter of the first two words.
 * One-word titles take the first two letters. Skips empty tokens; prefers letters/digits.
 */
export function studioGameInitials(title: string): string {
  const words = title
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) {
    const word = words[0]!;
    return word.slice(0, Math.min(2, word.length)).toLocaleUpperCase();
  }
  return `${words[0]![0]!}${words[1]![0]!}`.toLocaleUpperCase();
}
