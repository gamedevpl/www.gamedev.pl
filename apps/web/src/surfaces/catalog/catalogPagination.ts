export const CATALOG_PAGE_SIZE = 24;

export type CatalogPageToken = number | 'ellipsis';

// Pager tokens: first, last, and a window around the current page.
export function buildCatalogPageTokens(current: number, total: number): CatalogPageToken[] {
  if (total <= 1) return [1];
  const window = new Set<number>([1, total, current - 1, current, current + 1]);
  const pages = [...window].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const tokens: CatalogPageToken[] = [];
  for (let i = 0; i < pages.length; i++) {
    const gap = i > 0 ? pages[i] - pages[i - 1] : 0;
    // A single skipped page is cheaper to show than to elide.
    if (gap === 2) tokens.push(pages[i - 1] + 1);
    else if (gap > 2) tokens.push('ellipsis');
    tokens.push(pages[i]);
  }
  return tokens;
}
