import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '../../catalog.js';
import { categorizeCatalogEntry, entriesInCategory, isCatalogCategoryId } from './catalogCategory.js';

function entry(partial: Partial<CatalogEntry> & Pick<CatalogEntry, 'slug' | 'title'>): CatalogEntry {
  return {
    genre: 'Arcade',
    controls: 'keys',
    status: 'published',
    media: null,
    multiplayer: null,
    saves: null,
    world: null,
    sensing: null,
    editor: null,
    orientation: 'any',
    touch: null,
    submittedBy: null,
    ...partial,
  };
}

describe('categorizeCatalogEntry', () => {
  it('maps a genre keyword to its shelf', () => {
    expect(categorizeCatalogEntry(entry({ slug: 'a', title: 'A', genre: 'Vertical shmup' }))).toEqual([
      'arcade_racing',
    ]);
    expect(categorizeCatalogEntry(entry({ slug: 'b', title: 'B', genre: 'Western RPG' }))).toEqual(['rpg_adventure']);
    expect(categorizeCatalogEntry(entry({ slug: 'c', title: 'C', genre: 'City builder' }))).toEqual(['strategy_sim']);
    expect(categorizeCatalogEntry(entry({ slug: 'd', title: 'D', genre: 'Match-3 puzzle' }))).toEqual(['puzzle_story']);
  });

  it('falls back to more_to_explore for an unmatched or missing genre', () => {
    expect(categorizeCatalogEntry(entry({ slug: 'a', title: 'A', genre: 'Bureaucracy paperwork' }))).toEqual([
      'more_to_explore',
    ]);
    expect(categorizeCatalogEntry(entry({ slug: 'b', title: 'B', genre: '' }))).toEqual(['more_to_explore']);
  });

  it('grants multiplayer_party on top of the genre category, not instead of it', () => {
    const multiplayer = { mode: 'controllers' as const, minPlayers: 2, maxPlayers: 4 };
    expect(categorizeCatalogEntry(entry({ slug: 'a', title: 'A', genre: 'Arcade racing (3D)', multiplayer }))).toEqual([
      'arcade_racing',
      'multiplayer_party',
    ]);
    expect(categorizeCatalogEntry(entry({ slug: 'b', title: 'B', genre: '', multiplayer }))).toEqual([
      'more_to_explore',
      'multiplayer_party',
    ]);
  });

  it('is case-insensitive', () => {
    expect(categorizeCatalogEntry(entry({ slug: 'a', title: 'A', genre: 'SOULSLIKE' }))).toEqual(['rpg_adventure']);
  });
});

describe('isCatalogCategoryId', () => {
  it('accepts every real id and rejects anything else', () => {
    expect(isCatalogCategoryId('arcade_racing')).toBe(true);
    expect(isCatalogCategoryId('multiplayer_party')).toBe(true);
    expect(isCatalogCategoryId('bogus')).toBe(false);
    expect(isCatalogCategoryId(undefined)).toBe(false);
  });
});

describe('entriesInCategory', () => {
  it('keeps only entries carrying the given shelf, in their original order', () => {
    const entries = [
      entry({ slug: 'a', title: 'A', genre: 'Roguelike' }),
      entry({ slug: 'b', title: 'B', genre: 'City builder' }),
      entry({ slug: 'c', title: 'C', genre: 'Soulslike' }),
    ];
    expect(entriesInCategory(entries, 'rpg_adventure').map((e) => e.slug)).toEqual(['a', 'c']);
    expect(entriesInCategory(entries, 'strategy_sim').map((e) => e.slug)).toEqual(['b']);
    expect(entriesInCategory(entries, 'puzzle_story')).toEqual([]);
  });
});
