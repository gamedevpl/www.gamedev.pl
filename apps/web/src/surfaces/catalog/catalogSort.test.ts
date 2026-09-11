// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import type { CatalogEntry } from '../../catalog.js';
import {
  applyCatalogFilters,
  filterUnplayedEntries,
  orderCatalogEntries,
  readCatalogFilters,
  readCatalogSortMode,
  sortCatalogEntries,
  type CatalogSortSignals,
} from './catalogSort.js';
import { rememberRecentPlay } from '../../recentPlays.js';

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
    expect(sortCatalogEntries(catalog, 'alpha', emptySignals).map((e) => e.slug)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('sorts by most played sessions', () => {
    const signals: CatalogSortSignals = {
      ...emptySignals,
      sessions: new Map([
        ['mid', 40],
        ['zeta', 10],
      ]),
    };
    expect(sortCatalogEntries(catalog, 'most_played', signals).map((e) => e.slug)).toEqual(['mid', 'zeta', 'alpha']);
  });

  it('sorts by recommended slug order', () => {
    const signals: CatalogSortSignals = {
      ...emptySignals,
      recommended: ['mid', 'alpha'],
    };
    expect(sortCatalogEntries(catalog, 'recommended', signals).map((e) => e.slug)).toEqual(['mid', 'alpha', 'zeta']);
  });

  it('sorts by newest slug order', () => {
    const signals: CatalogSortSignals = {
      ...emptySignals,
      newest: ['zeta', 'alpha', 'mid'],
    };
    expect(sortCatalogEntries(catalog, 'newest', signals).map((e) => e.slug)).toEqual(['zeta', 'alpha', 'mid']);
  });

  it('sorts last played from affinity then local recent', () => {
    rememberRecentPlay('alpha');
    rememberRecentPlay('zeta');
    const signals: CatalogSortSignals = {
      ...emptySignals,
      affinityLastPlayed: new Map([['mid', '2026-07-29T12:00:00.000Z']]),
    };
    expect(sortCatalogEntries(catalog, 'last_played', signals).map((e) => e.slug)).toEqual(['mid', 'zeta', 'alpha']);
  });
});

describe('orderCatalogEntries', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('pins the creator’s games first, then the rest in sort order', () => {
    const signals: CatalogSortSignals = {
      ...emptySignals,
      recommended: ['zeta', 'mid', 'alpha'],
    };
    expect(orderCatalogEntries(catalog, 'recommended', signals, new Set(['mid'])).map((e) => e.slug)).toEqual([
      'mid',
      'zeta',
      'alpha',
    ]);
  });

  it('keeps normal sort when the visitor owns nothing in the catalog', () => {
    const signals: CatalogSortSignals = {
      ...emptySignals,
      recommended: ['mid', 'alpha'],
    };
    expect(orderCatalogEntries(catalog, 'recommended', signals, new Set()).map((e) => e.slug)).toEqual([
      'mid',
      'alpha',
      'zeta',
    ]);
  });
});

describe('catalog filters', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps only unplayed games for not_played', () => {
    rememberRecentPlay('mid');
    const affinity = new Map([['alpha', '2026-07-28T12:00:00.000Z']]);
    expect(filterUnplayedEntries(catalog, affinity).map((e) => e.slug)).toEqual(['zeta']);
  });

  it('applies not_played without hiding the creator’s other games when off', () => {
    rememberRecentPlay('mid');
    expect(applyCatalogFilters(catalog, new Set(), new Map()).map((e) => e.slug)).toEqual(['zeta', 'alpha', 'mid']);
  });

  it('keeps only the creator’s published games for your_games', () => {
    const mine = new Set(['alpha', 'mid']);
    expect(applyCatalogFilters(catalog, new Set(['your_games']), new Map(), mine).map((e) => e.slug)).toEqual([
      'alpha',
      'mid',
    ]);
  });

  it('combines your_games and not_played', () => {
    rememberRecentPlay('mid');
    const mine = new Set(['alpha', 'mid', 'zeta']);
    expect(
      applyCatalogFilters(
        catalog,
        new Set(['your_games', 'not_played']),
        new Map([['alpha', '2026-07-28T12:00:00.000Z']]),
        mine,
      ).map((e) => e.slug),
    ).toEqual(['zeta']);
  });

  it('migrates the legacy not_played sort into filters', () => {
    localStorage.setItem('gdpl.catalogSort', 'not_played');
    expect([...readCatalogFilters()]).toEqual(['not_played']);
    expect(readCatalogSortMode()).toBe('recommended');
    expect(localStorage.getItem('gdpl.catalogFilters')).toBe(JSON.stringify(['not_played']));
  });

  it('migrates the legacy not_played boolean into filters', () => {
    localStorage.setItem('gdpl.catalogNotPlayed', '1');
    expect([...readCatalogFilters()]).toEqual(['not_played']);
  });

  it('round-trips your_games and not_played in storage', () => {
    localStorage.setItem('gdpl.catalogFilters', JSON.stringify(['your_games', 'not_played']));
    expect([...readCatalogFilters()].sort()).toEqual(['not_played', 'your_games']);
  });
});
