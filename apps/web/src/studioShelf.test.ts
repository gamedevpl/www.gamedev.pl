import { describe, expect, it } from 'vitest';
import type { StudioGame } from './studioApi.js';
import { filterStudioGames, sortStudioGames, STUDIO_SHELF_TOOLS_AT } from './studioShelf.js';

function game(partial: Partial<StudioGame> & Pick<StudioGame, 'token' | 'title'>): StudioGame {
  return {
    createdAt: partial.createdAt ?? '2026-07-01T00:00:00.000Z',
    lastKnownStatus: partial.lastKnownStatus ?? null,
    ...partial,
  };
}

describe('studioShelf', () => {
  it('keeps shelf tools off for a small handful of games', () => {
    expect(STUDIO_SHELF_TOOLS_AT).toBe(5);
  });

  it('sorts active builds ahead of published games, newest within each band', () => {
    const sorted = sortStudioGames([
      game({
        token: 'old-live',
        title: 'Old Live',
        lastKnownStatus: 'published',
        publishedAt: '2026-06-01T00:00:00.000Z',
        slug: 'old-live',
        createdAt: '2026-06-01T00:00:00.000Z',
      }),
      game({
        token: 'new-build',
        title: 'New Build',
        lastKnownStatus: 'building',
        createdAt: '2026-07-20T00:00:00.000Z',
      }),
      game({
        token: 'older-build',
        title: 'Older Build',
        lastKnownStatus: 'queued',
        createdAt: '2026-07-10T00:00:00.000Z',
      }),
      game({
        token: 'new-live',
        title: 'New Live',
        lastKnownStatus: 'published',
        publishedAt: '2026-07-15T00:00:00.000Z',
        slug: 'new-live',
        createdAt: '2026-07-15T00:00:00.000Z',
      }),
    ]);

    expect(sorted.map((item) => item.token)).toEqual(['new-build', 'older-build', 'new-live', 'old-live']);
  });

  it('filters by building / live and by title or slug query', () => {
    const games = [
      game({
        token: 'a',
        title: 'Sky Dodge',
        slug: 'sky-dodge',
        lastKnownStatus: 'published',
        publishedAt: '2026-07-01T00:00:00.000Z',
      }),
      game({ token: 'b', title: 'Arena Tag', lastKnownStatus: 'building' }),
      game({ token: 'c', title: 'Moon Run', lastKnownStatus: 'needs_changes' }),
    ];

    expect(filterStudioGames(games, { filter: 'building' }).map((item) => item.token)).toEqual(['b']);
    expect(filterStudioGames(games, { filter: 'live' }).map((item) => item.token)).toEqual(['a']);
    expect(filterStudioGames(games, { query: 'dodge' }).map((item) => item.token)).toEqual(['a']);
    expect(filterStudioGames(games, { query: 'arena' }).map((item) => item.token)).toEqual(['b']);
    expect(filterStudioGames(games, { query: 'zzz' })).toEqual([]);
  });
});
