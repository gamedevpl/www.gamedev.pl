// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import type { CatalogEntry } from './catalog.js';
import {
  applyCatalogFilters,
  filterUnplayedEntries,
  filterYourGamesEntries,
  readCatalogFilters,
  readCatalogSortMode,
  sortCatalogEntries,
  type CatalogSortSignals,
} from './catalogSort.js';
import { rememberRecentPlay } from './recentPlays.js';

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

describe('catalog filters', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps only unplayed games for not_played', () => {
    rememberRecentPlay('mid');
    const affinity = new Map([['alpha', '2026-07-28T12:00:00.000Z']]);
    expect(filterUnplayedEntries(catalog, affinity).map((e) => e.slug)).toEqual(['zeta']);
  });

  it('keeps only the creator’s published slugs for your_games', () => {
    expect(filterYourGamesEntries(catalog, new Set(['mid', 'missing'])).map((e) => e.slug)).toEqual(['mid']);
  });

  it('ANDs your_games with not_played', () => {
    rememberRecentPlay('mid');
    const affinity = new Map<string, string>();
    expect(
      applyCatalogFilters(catalog, new Set(['your_games', 'not_played']), affinity, new Set(['mid', 'zeta'])).map(
        (e) => e.slug,
      ),
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
});
