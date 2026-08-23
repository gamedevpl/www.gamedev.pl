/**
 * Rank catalog games for home-page ordering.
 *
 * Two signal sources, deliberately kept apart from anonymous play telemetry:
 *
 * 1. **Community** — nightly scorecards (sessions, votes, finish rate). Aggregates
 *    about games, never about people — the same numbers the operator digest already
 *    trusts.
 * 2. **Personal** — signed-in play affinity (`users/{uid}/playAffinity`) plus optional
 *    anonymous recent-play hints from the browser. Identity-attached affinity is an
 *    account feature like votes and saves; it is *not* play telemetry and must never
 *    be joined to the anonymous streams.
 *
 * The arcade grid is sorted by this ranking (not duplicated in a second section).
 * When there is no signal at all, the caller keeps games-repo order.
 */

export type { RecommendReason } from '@gamedevpl/contract';
import type { RecommendReason } from '@gamedevpl/contract';

export interface RecommendGame {
  slug: string;
  genre: string;
}

export interface RecommendScorecardSignals {
  sessions: number;
  votesUp: number;
  votesDown: number;
  finishRate: number | null;
  medianPlaySeconds: number;
}

export interface RecommendAffinity {
  slug: string;
  openCount: number;
  lastPlayedAt: string;
}

export interface RankRecommendationsInput {
  games: RecommendGame[];
  scorecards: ReadonlyMap<string, RecommendScorecardSignals>;
  /** Signed-in play history. Empty for anonymous callers. */
  affinity: RecommendAffinity[];
  /** Client-declared recent slugs (anonymous cold start). Already capped by the route. */
  recentHints: string[];
  /**
   * Cap on returned rows. Omit or pass the catalog length to rank the whole list.
   * Soft ceiling of 500 guards a pathological catalog.
   */
  limit?: number;
  /** Wall clock for "continue" recency; injectable for tests. */
  nowMs?: number;
}

export interface RankedRecommendation {
  slug: string;
  reason: RecommendReason;
  score: number;
}

/** How far back a play still counts as "continue playing". */
export const CONTINUE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const MAX_LIMIT = 500;
const MAX_CONTINUE = 2;

export function normalizeGenre(genre: string): string {
  return genre.trim().toLowerCase();
}

/**
 * Community popularity from a scorecard. Logarithmic session scale so one hit does
 * not drown everything; vote net and finish rate reward games people stick with.
 */
export function communityScore(signals: RecommendScorecardSignals | undefined): number {
  if (!signals) return 0;
  const voteNet = signals.votesUp - signals.votesDown;
  const finish = signals.finishRate ?? 0;
  return (
    Math.log1p(Math.max(0, signals.sessions)) * 3 +
    voteNet * 1.5 +
    finish * 4 +
    Math.log1p(Math.max(0, signals.medianPlaySeconds))
  );
}

function genreWeights(
  gamesBySlug: ReadonlyMap<string, RecommendGame>,
  affinity: RecommendAffinity[],
  recentHints: string[],
): Map<string, number> {
  const weights = new Map<string, number>();
  const bump = (slug: string, amount: number) => {
    const game = gamesBySlug.get(slug);
    if (!game) return;
    const key = normalizeGenre(game.genre);
    if (!key) return;
    weights.set(key, (weights.get(key) ?? 0) + amount);
  };
  for (const entry of affinity) {
    bump(entry.slug, Math.max(1, entry.openCount));
  }
  for (const slug of recentHints) {
    bump(slug, 1);
  }
  return weights;
}

/**
 * Rank every published game for catalog sort order. Continues (recent personal plays)
 * lead; the rest mix community popularity with genre affinity. Games with no signal
 * keep a stable zero score and trail the rest in their input order.
 *
 * Returns `[]` when nothing has a community or personal signal — the client then
 * leaves games-repo order alone rather than inventing a shuffle.
 */
export function rankRecommendations(input: RankRecommendationsInput): RankedRecommendation[] {
  const limit = Math.max(1, Math.min(input.limit ?? (input.games.length || 1), MAX_LIMIT));
  const nowMs = input.nowMs ?? Date.now();
  const gamesBySlug = new Map(input.games.map((game) => [game.slug, game]));
  const published = new Set(gamesBySlug.keys());
  const weights = genreWeights(gamesBySlug, input.affinity, input.recentHints);
  const hasPersonalSignal = weights.size > 0;

  const affinityBySlug = new Map(input.affinity.filter((a) => published.has(a.slug)).map((a) => [a.slug, a]));

  const continueSlugs = [...affinityBySlug.values()]
    .filter((entry) => {
      const playedAt = Date.parse(entry.lastPlayedAt);
      return Number.isFinite(playedAt) && nowMs - playedAt <= CONTINUE_WINDOW_MS;
    })
    .sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt) || b.openCount - a.openCount)
    .slice(0, MAX_CONTINUE)
    .map((entry) => entry.slug);

  const continueSet = new Set(continueSlugs);
  const playedSet = new Set(affinityBySlug.keys());
  for (const slug of input.recentHints) {
    if (published.has(slug)) playedSet.add(slug);
  }

  const discovery: RankedRecommendation[] = [];
  for (const game of input.games) {
    if (continueSet.has(game.slug)) continue;

    const base = communityScore(input.scorecards.get(game.slug));
    const genreKey = normalizeGenre(game.genre);
    const genreBoost = genreKey ? (weights.get(genreKey) ?? 0) * 2 : 0;
    // Lightly demote already-played games so the grid surfaces new ones after continues.
    const replayPenalty = playedSet.has(game.slug) && !continueSet.has(game.slug) ? 4 : 0;
    const score = base + genreBoost - replayPenalty;

    let reason: RecommendReason = 'popular';
    if (hasPersonalSignal && genreBoost > 0) {
      reason = playedSet.has(game.slug) ? 'because_you_played' : 'for_you';
    }

    discovery.push({ slug: game.slug, reason, score });
  }

  // Stable among ties: higher score first, then original catalog index.
  const catalogIndex = new Map(input.games.map((game, index) => [game.slug, index]));
  discovery.sort((a, b) => b.score - a.score || (catalogIndex.get(a.slug) ?? 0) - (catalogIndex.get(b.slug) ?? 0));

  const ranked: RankedRecommendation[] = [
    ...continueSlugs.map((slug) => ({
      slug,
      reason: 'continue' as const,
      score: communityScore(input.scorecards.get(slug)) + 100,
    })),
    ...discovery,
  ];

  const hasSignal = ranked.some((item) => item.score > 0 || item.reason === 'continue');
  if (!hasSignal) return [];

  return ranked.slice(0, limit);
}
