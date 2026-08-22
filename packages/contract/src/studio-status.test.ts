import { describe, expect, it } from 'vitest';
import type { StudioGame, StudioHealthResponse, StudioScorecardsResponse } from './studio-status.js';

describe('studio status shapes', () => {
  it('types a shelf row status against the submission vocabulary', () => {
    const game: StudioGame = {
      token: 't',
      title: 'My Game',
      createdAt: 'now',
      lastKnownStatus: 'published',
      slug: 'my-game',
    };
    expect(game.lastKnownStatus).toBe('published');
  });

  it('requires the truncation counts the route always sends', () => {
    const health: StudioHealthResponse = {
      days: ['2026-08-22'],
      truncated: false,
      gamesTruncated: false,
      totalGames: 3,
      games: [],
    };
    expect(health.totalGames).toBe(3);
  });

  it('keeps the scorecard truncation counts the web used to drop', () => {
    const page: StudioScorecardsResponse = { scorecards: [], truncated: true, totalGames: 9 };
    expect(page.truncated).toBe(true);
  });
});
