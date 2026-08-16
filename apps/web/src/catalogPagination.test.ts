import { describe, expect, it } from 'vitest';
import { buildCatalogPageTokens } from './catalogPagination.js';

describe('buildCatalogPageTokens', () => {
  it('returns a single page when there is nothing to paginate', () => {
    expect(buildCatalogPageTokens(1, 1)).toEqual([1]);
    expect(buildCatalogPageTokens(1, 0)).toEqual([1]);
  });

  it('lists every page when the run is short', () => {
    expect(buildCatalogPageTokens(1, 3)).toEqual([1, 2, 3]);
    expect(buildCatalogPageTokens(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('collapses a long run around the current page with ellipses', () => {
    expect(buildCatalogPageTokens(1, 10)).toEqual([1, 2, 'ellipsis', 10]);
    expect(buildCatalogPageTokens(5, 10)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10]);
    expect(buildCatalogPageTokens(10, 10)).toEqual([1, 'ellipsis', 9, 10]);
  });

  it('never emits two ellipses back to back near the edges', () => {
    expect(buildCatalogPageTokens(2, 10)).toEqual([1, 2, 3, 'ellipsis', 10]);
    expect(buildCatalogPageTokens(9, 10)).toEqual([1, 'ellipsis', 8, 9, 10]);
  });
});
