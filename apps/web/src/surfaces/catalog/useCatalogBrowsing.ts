import { useEffect, useMemo, useState } from 'react';
import { type CatalogEntry } from '../../catalog.js';
import { CATALOG_CATEGORY_IDS, entriesInCategory, type CatalogCategoryId } from './catalogCategory.js';
import { CATALOG_PAGE_SIZE } from './catalogPagination.js';
import { RAIL_CARD_LIMIT } from './CatalogRail.js';

export type CatalogShelf = { id: CatalogCategoryId; entries: CatalogEntry[] };

function scrollToBrowseEverything() {
  document.getElementById('browse-everything')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Category shelves, the See-all filter and the Browse everything pager.
export function useCatalogBrowsing({
  displayedEntries,
  userOrderKey,
}: {
  displayedEntries: CatalogEntry[];
  userOrderKey: string;
}) {
  // Set by a shelf's See all; cleared by All or Clear.
  const [categoryFilter, setCategoryFilter] = useState<CatalogCategoryId | null>(null);
  const [browsePage, setBrowsePage] = useState(1);

  // A stale page number from a filtered list is not a page.
  useEffect(() => {
    setBrowsePage(1);
  }, [userOrderKey, categoryFilter]);

  function clearCategoryFilter() {
    setCategoryFilter(null);
  }

  function scrollToShelf(id: CatalogCategoryId) {
    document.getElementById(`shelf-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function jumpToAll() {
    setCategoryFilter(null);
    scrollToBrowseEverything();
  }

  function seeAllInCategory(id: CatalogCategoryId) {
    setCategoryFilter(id);
    scrollToBrowseEverything();
  }

  // A shorter destination page must not strand the reader past its end.
  function changeBrowsePage(next: number) {
    setBrowsePage(next);
    scrollToBrowseEverything();
  }

  // Shelves below the fold, same order as the grid, grouped by category.
  const shelfCategories = useMemo<CatalogShelf[]>(
    () =>
      CATALOG_CATEGORY_IDS.map((id) => ({
        id,
        entries: entriesInCategory(displayedEntries, id).slice(0, RAIL_CARD_LIMIT),
      })).filter((shelf) => shelf.entries.length > 0),
    [displayedEntries],
  );

  const browseEntries = useMemo(
    () => (categoryFilter ? entriesInCategory(displayedEntries, categoryFilter) : displayedEntries),
    [displayedEntries, categoryFilter],
  );
  const browsePageCount = Math.max(1, Math.ceil(browseEntries.length / CATALOG_PAGE_SIZE));
  const clampedBrowsePage = Math.min(browsePage, browsePageCount);
  const pageEntries = useMemo(
    () => browseEntries.slice((clampedBrowsePage - 1) * CATALOG_PAGE_SIZE, clampedBrowsePage * CATALOG_PAGE_SIZE),
    [browseEntries, clampedBrowsePage],
  );

  return {
    categoryFilter,
    clearCategoryFilter,
    shelfCategories,
    browseEntries,
    pageEntries,
    browsePageCount,
    clampedBrowsePage,
    scrollToShelf,
    jumpToAll,
    seeAllInCategory,
    changeBrowsePage,
  };
}
