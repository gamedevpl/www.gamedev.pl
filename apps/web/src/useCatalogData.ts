import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { fetchCatalog, type CatalogEntry } from './catalog.js';
import type { User } from './AuthContext.js';
import type { AppRoute } from './core/router.js';

export type CatalogStatus = 'loading' | 'ready' | 'error';

export type UseCatalogDataOptions = {
  user: User | null;
  privateBeta: boolean;
  authLoading: boolean;
  publicPlayAllowed: boolean;
  routeView: AppRoute['view'];
  setRecommendationsRefreshKey: Dispatch<SetStateAction<number>>;
  setMyGamesRefreshKey: Dispatch<SetStateAction<number>>;
};

export type UseCatalogDataResult = {
  catalogStatus: CatalogStatus;
  catalogError: string | null;
  catalogEntries: CatalogEntry[];
  handleRetryCatalog: () => void;
  handlePullToRefresh: () => Promise<void>;
};

// Give the catalog effect a beat before the pull indicator dismisses.
const PULL_TO_REFRESH_SETTLE_MS = 450;

// The published catalog, plus the two gestures that ask for it again.
export function useCatalogData({
  user,
  privateBeta,
  authLoading,
  publicPlayAllowed,
  routeView,
  setRecommendationsRefreshKey,
  setMyGamesRefreshKey,
}: UseCatalogDataOptions): UseCatalogDataResult {
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>('loading');
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([]);
  // Bumped by Retry so a failed load re-fetches in place.
  const [catalogReloadKey, setCatalogReloadKey] = useState(0);

  useEffect(() => {
    // Fetching before /api/health answers would 401-spam every anonymous visitor.
    if (authLoading) return;
    // Promotional deep links load the game directly, without opening the catalog.
    if (publicPlayAllowed) return;
    // Private beta gates /api/catalog on a session; an anonymous fetch 401s.
    if (privateBeta && !user) return;
    // Home, /play, /create, and /party all need the catalog loaded.
    if (routeView !== 'home' && routeView !== 'play' && routeView !== 'create' && routeView !== 'party') return;

    let cancelled = false;
    // Soft refreshes keep the last-good grid; only cold loads show loading.
    setCatalogStatus((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    // Clear a stale soft-refresh notice as soon as a retry starts.
    setCatalogError(null);

    void fetchCatalog()
      .then((entries) => {
        if (cancelled) return;
        setCatalogEntries(entries);
        setCatalogError(null);
        setCatalogStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // A failed soft refresh keeps the grid; the error rides in catalogError.
        setCatalogEntries((prev) => (prev.length > 0 ? prev : []));
        setCatalogError(err instanceof Error ? err.message : null);
        setCatalogStatus((prev) => (prev === 'ready' ? 'ready' : 'error'));
      });

    return () => {
      cancelled = true;
    };
  }, [user, privateBeta, authLoading, publicPlayAllowed, routeView, catalogReloadKey]);

  const handleRetryCatalog = useCallback(() => {
    setCatalogReloadKey((n) => n + 1);
  }, []);

  // Standalone PWA has no chrome pull gesture; this restores it.
  const handlePullToRefresh = useCallback(async () => {
    setCatalogReloadKey((n) => n + 1);
    setRecommendationsRefreshKey((n) => n + 1);
    setMyGamesRefreshKey((n) => n + 1);
    // The effect races the fetch; the gesture only needs to feel done.
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, PULL_TO_REFRESH_SETTLE_MS);
    });
  }, [setRecommendationsRefreshKey, setMyGamesRefreshKey]);

  return { catalogStatus, catalogError, catalogEntries, handleRetryCatalog, handlePullToRefresh };
}
