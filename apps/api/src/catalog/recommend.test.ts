import { describe, expect, it } from 'vitest';
import {
  communityScore,
  CONTINUE_WINDOW_MS,
  normalizeGenre,
  rankRecommendations,
  type RecommendScorecardSignals,
} from './recommend.js';

function signals(partial: Partial<RecommendScorecardSignals> = {}): RecommendScorecardSignals {
  return {
    sessions: 0,
    votesUp: 0,
    votesDown: 0,
    finishRate: null,
    medianPlaySeconds: 0,
    ...partial,
  };
}

const catalog = [
  { slug: 'puzzle-one', genre: 'Puzzle' },
  { slug: 'puzzle-two', genre: 'puzzle' },
  { slug: 'arcade-hit', genre: 'Arcade' },
  { slug: 'quiet-arcade', genre: 'Arcade' },
  { slug: 'lonely', genre: 'Strategy' },
];

describe('normalizeGenre', () => {
  it('trims and lowercases', () => {
    expect(normalizeGenre('  Puzzle ')).toBe('puzzle');
  });
});

describe('communityScore', () => {
  it('is zero with no evidence', () => {
    expect(communityScore(undefined)).toBe(0);
    expect(communityScore(signals())).toBe(0);
  });

  it('rewards sessions, net votes, finish rate and play time', () => {
    const quiet = communityScore(signals({ sessions: 2 }));
    const loud = communityScore(
      signals({ sessions: 40, votesUp: 8, votesDown: 1, finishRate: 0.6, medianPlaySeconds: 90 }),
    );
    expect(loud).toBeGreaterThan(quiet);
  });
});

describe('rankRecommendations', () => {
  const nowMs = Date.parse('2026-07-29T12:00:00.000Z');

  it('returns empty when nothing has a signal', () => {
    expect(
      rankRecommendations({
        games: catalog,
        scorecards: new Map(),
        affinity: [],
        recentHints: [],
        limit: 8,
        nowMs,
      }),
    ).toEqual([]);
  });

  it('ranks by community popularity when there is no personal history', () => {
    const scorecards = new Map([
      ['arcade-hit', signals({ sessions: 50, votesUp: 10, finishRate: 0.4 })],
      ['puzzle-one', signals({ sessions: 5, votesUp: 1 })],
      ['quiet-arcade', signals({ sessions: 12, votesUp: 2 })],
    ]);

    const ranked = rankRecommendations({
      games: catalog,
      scorecards,
      affinity: [],
      recentHints: [],
      limit: 3,
      nowMs,
    });

    expect(ranked.map((item) => item.slug)).toEqual(['arcade-hit', 'quiet-arcade', 'puzzle-one']);
    expect(ranked.every((item) => item.reason === 'popular')).toBe(true);
  });

  it('returns the full catalog when limit is omitted', () => {
    const scorecards = new Map([['arcade-hit', signals({ sessions: 10 })]]);
    const ranked = rankRecommendations({
      games: catalog,
      scorecards,
      affinity: [],
      recentHints: [],
      nowMs,
    });
    expect(ranked.map((item) => item.slug)).toEqual([
      'arcade-hit',
      'puzzle-one',
      'puzzle-two',
      'quiet-arcade',
      'lonely',
    ]);
  });

  it('surfaces recent plays as continue, then genre-matched discoveries', () => {
    const scorecards = new Map([
      ['arcade-hit', signals({ sessions: 80, votesUp: 20 })],
      ['puzzle-one', signals({ sessions: 10 })],
      ['puzzle-two', signals({ sessions: 8 })],
      ['quiet-arcade', signals({ sessions: 30 })],
    ]);

    const ranked = rankRecommendations({
      games: catalog,
      scorecards,
      affinity: [
        {
          slug: 'puzzle-one',
          openCount: 4,
          lastPlayedAt: new Date(nowMs - 60_000).toISOString(),
        },
      ],
      recentHints: [],
      limit: 4,
      nowMs,
    });

    expect(ranked[0]).toMatchObject({ slug: 'puzzle-one', reason: 'continue' });
    // The other puzzle should beat the arcade hit despite fewer sessions, because of genre.
    expect(ranked.some((item) => item.slug === 'puzzle-two' && item.reason === 'for_you')).toBe(true);
  });

  it('ignores continue plays older than the window', () => {
    const ranked = rankRecommendations({
      games: catalog,
      scorecards: new Map([['arcade-hit', signals({ sessions: 10 })]]),
      affinity: [
        {
          slug: 'puzzle-one',
          openCount: 2,
          lastPlayedAt: new Date(nowMs - CONTINUE_WINDOW_MS - 1_000).toISOString(),
        },
      ],
      recentHints: [],
      limit: 4,
      nowMs,
    });

    expect(ranked.find((item) => item.slug === 'puzzle-one')?.reason).not.toBe('continue');
  });

  it('uses anonymous recent hints for genre affinity without inventing continue', () => {
    const ranked = rankRecommendations({
      games: catalog,
      scorecards: new Map([
        ['arcade-hit', signals({ sessions: 40 })],
        ['puzzle-two', signals({ sessions: 5 })],
      ]),
      affinity: [],
      recentHints: ['puzzle-one'],
      limit: 3,
      nowMs,
    });

    expect(ranked.find((item) => item.reason === 'continue')).toBeUndefined();
    expect(ranked.some((item) => item.slug === 'puzzle-two' && item.reason === 'for_you')).toBe(true);
  });
});
