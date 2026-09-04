import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type CatalogEntry } from '../../catalog.js';
import {
  applyCatalogFilters,
  orderCatalogEntries,
  type CatalogFilterId,
  type CatalogSortMode,
  type CatalogSortSignals,
} from './catalogSort.js';

// Orders the catalog, then commits that order once per key.
export function useCatalogOrdering({
  catalogEntries,
  sortMode,
  filters,
  signals,
  mySlugs,
  canFilterYourGames,
  viewerUid,
  recommendationsRefreshKey,
  layoutReady,
}: {
  catalogEntries: CatalogEntry[];
  sortMode: CatalogSortMode;
  filters: Set<CatalogFilterId>;
  signals: CatalogSortSignals;
  mySlugs: Set<string>;
  canFilterYourGames: boolean;
  viewerUid: string | null;
  recommendationsRefreshKey: number;
  layoutReady: boolean;
}): { desiredOrder: CatalogEntry[]; displayedEntries: CatalogEntry[]; userOrderKey: string } {
  const [displayedEntries, setDisplayedEntries] = useState<CatalogEntry[]>([]);
  const desiredOrderRef = useRef<CatalogEntry[]>([]);
  const paintedOrderKeyRef = useRef<string | null>(null);

  const desiredOrder = useMemo(() => {
    // A sticky your_games pref must not empty the catalog for nothing.
    const activeFilters = canFilterYourGames ? filters : new Set([...filters].filter((id) => id !== 'your_games'));
    const filtered = applyCatalogFilters(catalogEntries, activeFilters, signals.affinityLastPlayed, mySlugs);
    return orderCatalogEntries(filtered, sortMode, signals, mySlugs);
  }, [catalogEntries, sortMode, filters, signals, mySlugs, canFilterYourGames]);
  desiredOrderRef.current = desiredOrder;

  const filterKey = [...filters].sort().join(',');
  // recommendationsRefreshKey: post-play re-rank is deliberate user-visible intent.
  const userOrderKey = `${sortMode}|${filterKey}|${viewerUid ?? ''}|r${recommendationsRefreshKey}`;

  // Commit once per key: a later signal refresh must not reshuffle cards.
  useLayoutEffect(() => {
    if (!layoutReady) {
      paintedOrderKeyRef.current = null;
      return;
    }
    if (paintedOrderKeyRef.current === userOrderKey) return;
    paintedOrderKeyRef.current = userOrderKey;
    setDisplayedEntries(desiredOrderRef.current);
  }, [layoutReady, userOrderKey]);

  return { desiredOrder, displayedEntries, userOrderKey };
}
