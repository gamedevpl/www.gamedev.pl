/**
 * Rank catalog games for the home-page recommendations rail.
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
 * The main arcade catalog stays in repo order (docs/improvement-loop-plan.md: measured
 * outcomes do not reorder the catalog in v1). This module only feeds a separate rail.
 */

export type RecommendReason = 'popular' | 'for_you' | 'because_you_played' | 'continue';

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
  limit: number;
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

const DEFAULT_LIMIT = 8;
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
 * Rank games for the rail. Continues (recent personal plays) lead; the rest mix
 * community popularity with genre affinity so a puzzle fan sees more puzzles without
 * hiding what everyone else is playing.
 */
export function rankRecommendations(input: RankRecommendationsInput): RankedRecommendation[] {
  const limit = Math.max(1, Math.min(input.limit || DEFAULT_LIMIT, 24));
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
    // Already-played games stay eligible but sit lower so the rail discovers new ones.
    const replayPenalty = playedSet.has(game.slug) ? 4 : 0;
    const score = base + genreBoost - replayPenalty;

    let reason: RecommendReason = 'popular';
    if (hasPersonalSignal && genreBoost > 0) {
      reason = playedSet.has(game.slug) ? 'because_you_played' : 'for_you';
    }

    discovery.push({ slug: game.slug, reason, score });
  }

  discovery.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));

  const ranked: RankedRecommendation[] = [
    ...continueSlugs.map((slug) => ({
      slug,
      reason: 'continue' as const,
      score: communityScore(input.scorecards.get(slug)) + 100,
    })),
    ...discovery,
  ];

  // Drop zero-evidence cold catalog padding when nothing has a signal at all.
  const meaningful = ranked.filter((item) => item.score > 0 || item.reason === 'continue');
  if (meaningful.length === 0) return [];

  return meaningful.slice(0, limit);
}
