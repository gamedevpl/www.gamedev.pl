import { describe, expect, it } from 'vitest';
import type { StudioGame } from './studioApi.js';
import {
  collapseStudioGames,
  filterStudioGames,
  isStudioGamePublished,
  isStudioGameShelfLive,
  sortStudioGames,
  studioGameInitials,
  STUDIO_SHELF_TOOLS_AT,
} from './studioShelf.js';

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

  it('collapses a published game and its improve tip into one shelf row', () => {
    const collapsed = collapseStudioGames([
      game({
        token: 'live',
        title: 'Miniature Warfare 2D',
        slug: 'miniature-warfare-2d',
        lastKnownStatus: 'published',
        publishedAt: '2026-07-01T00:00:00.000Z',
        createdAt: '2026-07-01T00:00:00.000Z',
      }),
      game({
        token: 'tip',
        title: 'Miniature Warfare 2D',
        slug: 'miniature-warfare-2d',
        lastKnownStatus: 'building',
        createdAt: '2026-07-20T00:00:00.000Z',
      }),
      game({
        token: 'solo',
        title: 'TV Tycoon',
        slug: 'tv-tycoon',
        lastKnownStatus: 'published',
        publishedAt: '2026-07-10T00:00:00.000Z',
        createdAt: '2026-07-10T00:00:00.000Z',
      }),
    ]);

    expect(collapsed.map((item) => item.token)).toEqual(['tip', 'solo']);
    expect(collapsed[0]?.livePublishedAt).toBe('2026-07-01T00:00:00.000Z');
    expect(isStudioGameShelfLive(collapsed[0]!)).toBe(true);
    // Tip itself stays unpublished so composer/playtest keep using feedback, not improve.
    expect(collapsed[0]?.publishedAt).toBeUndefined();
  });

  it('keeps an improve tip catalog-live when the sibling has no publish timestamp', () => {
    // lastKnownStatus alone is enough for isStudioGamePublished; publishedAt is only
    // present "when known". The tip must still pass the Live filter.
    const collapsed = collapseStudioGames([
      game({
        token: 'legacy-live',
        title: 'Sky Dodge',
        slug: 'sky-dodge',
        lastKnownStatus: 'published',
        createdAt: '2026-06-01T00:00:00.000Z',
      }),
      game({
        token: 'tip',
        title: 'Sky Dodge',
        slug: 'sky-dodge',
        lastKnownStatus: 'building',
        createdAt: '2026-07-20T00:00:00.000Z',
      }),
    ]);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.token).toBe('tip');
    expect(collapsed[0]?.livePublishedAt).toBe('');
    expect(isStudioGameShelfLive(collapsed[0]!)).toBe(true);
    expect(filterStudioGames(collapsed, { filter: 'live' }).map((item) => item.token)).toEqual(['tip']);
  });

  it('treats live: false as deleted, regardless of publishedAt history', () => {
    const deleted = game({
      token: 'gone',
      title: 'Comet Courier',
      slug: 'comet-courier',
      lastKnownStatus: 'published',
      publishedAt: '2026-07-01T00:00:00.000Z',
      live: false,
    });
    expect(isStudioGamePublished(deleted)).toBe(false);
    expect(isStudioGameShelfLive(deleted)).toBe(false);
  });

  it('keeps a sibling with no publication record out of the deleted read (games-repo entries)', () => {
    const legacy = game({
      token: 'legacy',
      title: 'TV Tycoon',
      slug: 'tv-tycoon',
      lastKnownStatus: 'published',
      publishedAt: '2026-07-01T00:00:00.000Z',
    });
    expect(isStudioGamePublished(legacy)).toBe(true);
  });

  it("does not resurrect a deleted publication as an improve tip's live sibling", () => {
    const collapsed = collapseStudioGames([
      game({
        token: 'deleted-live',
        title: 'Sky Dodge',
        slug: 'sky-dodge',
        lastKnownStatus: 'published',
        publishedAt: '2026-06-01T00:00:00.000Z',
        live: false,
      }),
      game({
        token: 'tip',
        title: 'Sky Dodge',
        slug: 'sky-dodge',
        lastKnownStatus: 'building',
        createdAt: '2026-07-20T00:00:00.000Z',
      }),
    ]);

    expect(collapsed[0]?.livePublishedAt).toBeUndefined();
    expect(isStudioGameShelfLive(collapsed[0]!)).toBe(false);
  });

  it('filters by building / live and by title or slug query', () => {
    const games = collapseStudioGames([
      game({
        token: 'a',
        title: 'Sky Dodge',
        slug: 'sky-dodge',
        lastKnownStatus: 'published',
        publishedAt: '2026-07-01T00:00:00.000Z',
      }),
      game({ token: 'b', title: 'Arena Tag', lastKnownStatus: 'building' }),
      game({ token: 'c', title: 'Moon Run', lastKnownStatus: 'needs_changes' }),
      // Same slug as the live game — must not double-count under Live or All.
      game({
        token: 'a-tip',
        title: 'Sky Dodge',
        slug: 'sky-dodge',
        lastKnownStatus: 'building',
        createdAt: '2026-07-20T00:00:00.000Z',
      }),
    ]);

    expect(
      filterStudioGames(games, { filter: 'building' })
        .map((item) => item.token)
        .sort(),
    ).toEqual(['a-tip', 'b']);
    expect(filterStudioGames(games, { filter: 'live' }).map((item) => item.token)).toEqual(['a-tip']);
    expect(filterStudioGames(games, { query: 'dodge' }).map((item) => item.token)).toEqual(['a-tip']);
    expect(filterStudioGames(games, { query: 'arena' }).map((item) => item.token)).toEqual(['b']);
    expect(filterStudioGames(games, { query: 'zzz' })).toEqual([]);
  });

  it('builds two-letter shelf marks from the first two title words', () => {
    expect(studioGameInitials('2D Total War')).toBe('2T');
    expect(studioGameInitials('Sky Dodge')).toBe('SD');
    expect(studioGameInitials('Asteroids')).toBe('AS');
    expect(studioGameInitials('  ')).toBe('?');
    expect(studioGameInitials('Łódź Arcade')).toBe('ŁA');
  });
});
