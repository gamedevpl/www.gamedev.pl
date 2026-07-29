// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
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

  it('round-trips a payload through sessionStorage', () => {
    writeCachedCatalogSortPayload({
      items: [{ slug: 'neon-drift', reason: 'popular' }],
      popularity: [{ slug: 'neon-drift', sessions: 3 }],
      lastPlayed: [{ slug: 'mid-game', lastPlayedAt: '2026-07-29T12:00:00.000Z' }],
      newest: ['pixel-pong', 'neon-drift'],
    });
    expect(readCachedCatalogSortPayload()).toEqual({
      items: [{ slug: 'neon-drift', reason: 'popular' }],
      popularity: [{ slug: 'neon-drift', sessions: 3 }],
      lastPlayed: [{ slug: 'mid-game', lastPlayedAt: '2026-07-29T12:00:00.000Z' }],
      newest: ['pixel-pong', 'neon-drift'],
    });
  });
});
