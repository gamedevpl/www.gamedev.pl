import { beforeEach, describe, expect, it } from 'vitest';
import type { CatalogEntry } from './catalog.js';
import { sortCatalogEntries, type CatalogSortSignals } from './catalogSort.js';
import { rememberRecentPlay } from './recentPlays.js';

// @vitest-environment jsdom

function entry(partial: Partial<CatalogEntry> & Pick<CatalogEntry, 'slug' | 'title'>): CatalogEntry {
  return {
    genre: 'Arcade',
    controls: 'keys',
    status: 'published',
    media: null,
    multiplayer: null,
    saves: null,
    world: null,
    orientation: 'any',
    touch: null,
    submittedBy: null,
    ...partial,
  };
}

const catalog = [
  entry({ slug: 'zeta', title: 'Zeta Run' }),
  entry({ slug: 'alpha', title: 'Alpha Quest' }),
  entry({ slug: 'mid', title: 'Mid Game' }),
];

const emptySignals: CatalogSortSignals = {
  recommended: [],
  newest: [],
  sessions: new Map(),
  affinityLastPlayed: new Map(),
};

describe('sortCatalogEntries', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sorts alphabetically by title', () => {
    expect(sortCatalogEntries(catalog, 'alpha', emptySignals).map((e) => e.slug)).toEqual([
      'alpha',
      'mid',
      'zeta',
    ]);
  });

  it('sorts by most played sessions', () => {
    const signals: CatalogSortSignals = {
      ...emptySignals,
      sessions: new Map([
        ['mid', 40],
        ['zeta', 10],
      ]),
    };
    expect(sortCatalogEntries(catalog, 'most_played', signals).map((e) => e.slug)).toEqual([
      'mid',
      'zeta',
      'alpha',
    ]);
  });

  it('sorts by recommended slug order', () => {
    const signals: CatalogSortSignals = {
      ...emptySignals,
      recommended: ['mid', 'alpha'],
    };
    expect(sortCatalogEntries(catalog, 'recommended', signals).map((e) => e.slug)).toEqual([
      'mid',
      'alpha',
      'zeta',
    ]);
  });

  it('sorts by newest slug order', () => {
    const signals: CatalogSortSignals = {
      ...emptySignals,
      newest: ['zeta', 'alpha', 'mid'],
    };
    expect(sortCatalogEntries(catalog, 'newest', signals).map((e) => e.slug)).toEqual([
      'zeta',
      'alpha',
      'mid',
    ]);
  });

  it('sorts last played from affinity then local recent', () => {
    rememberRecentPlay('alpha');
    rememberRecentPlay('zeta');
    const signals: CatalogSortSignals = {
      ...emptySignals,
      affinityLastPlayed: new Map([['mid', '2026-07-29T12:00:00.000Z']]),
    };
    expect(sortCatalogEntries(catalog, 'last_played', signals).map((e) => e.slug)).toEqual([
      'mid',
      'zeta',
      'alpha',
    ]);
  });
});
