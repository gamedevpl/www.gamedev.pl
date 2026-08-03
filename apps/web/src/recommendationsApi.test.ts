// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearCachedCatalogSortPayload,
  orderCatalogByRecommendations,
  readCachedCatalogSortPayload,
  writeCachedCatalogSortPayload,
} from './recommendationsApi.js';

describe('orderCatalogByRecommendations', () => {
  const entries = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }, { slug: 'd' }];

  it('keeps catalog order when ranking is empty', () => {
    expect(orderCatalogByRecommendations(entries, null)).toEqual(entries);
    expect(orderCatalogByRecommendations(entries, [])).toEqual(entries);
  });

  it('reorders by ranking and appends anything missing', () => {
    expect(orderCatalogByRecommendations(entries, ['c', 'a', 'missing'])).toEqual([
      { slug: 'c' },
      { slug: 'a' },
      { slug: 'b' },
      { slug: 'd' },
    ]);
  });
});

describe('catalog sort signals cache', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('round-trips a payload through sessionStorage for a viewer', () => {
    writeCachedCatalogSortPayload(
      {
        items: [{ slug: 'neon-drift', reason: 'popular' }],
        popularity: [{ slug: 'neon-drift', sessions: 3 }],
        lastPlayed: [{ slug: 'mid-game', lastPlayedAt: '2026-07-29T12:00:00.000Z' }],
        newest: ['pixel-pong', 'neon-drift'],
      },
      'g:alice',
    );
    expect(readCachedCatalogSortPayload('g:alice')).toEqual({
      items: [{ slug: 'neon-drift', reason: 'popular' }],
      popularity: [{ slug: 'neon-drift', sessions: 3 }],
      lastPlayed: [{ slug: 'mid-game', lastPlayedAt: '2026-07-29T12:00:00.000Z' }],
      newest: ['pixel-pong', 'neon-drift'],
    });
    expect(readCachedCatalogSortPayload('g:bob')).toBeNull();
    expect(readCachedCatalogSortPayload(null)).toBeNull();
  });

  it('ignores legacy unscoped cache entries', () => {
    sessionStorage.setItem(
      'gdpl.catalogSortSignals',
      JSON.stringify({ items: [{ slug: 'old', reason: 'popular' }], popularity: [], lastPlayed: [], newest: [] }),
    );
    expect(readCachedCatalogSortPayload(null)).toBeNull();
  });

  it('clearCachedCatalogSortPayload drops the entry', () => {
    writeCachedCatalogSortPayload({ items: [], popularity: [], lastPlayed: [], newest: [] }, 'g:alice');
    clearCachedCatalogSortPayload();
    expect(readCachedCatalogSortPayload('g:alice')).toBeNull();
  });
});
