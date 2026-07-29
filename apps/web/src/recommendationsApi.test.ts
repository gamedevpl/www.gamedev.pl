import { describe, expect, it } from 'vitest';
import { orderCatalogByRecommendations } from './recommendationsApi.js';

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
