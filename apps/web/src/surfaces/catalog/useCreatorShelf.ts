import { useEffect, useMemo, useRef, useState } from 'react';
import { loadCreatorGames, publishedCreatorSlugs, type CreatorGameItem } from '../../creatorGames.js';

// How stale a pin may get without a local signal.
const RETURN_REFRESH_FLOOR_MS = 5 * 60_000;

// Feeds the Studio chip and the Yours pins — never the grid itself.
export function useCreatorShelf({
  authLoading,
  viewerUid,
  locale,
  creatorGamesRefreshKey,
  activeBuildCount,
}: {
  authLoading: boolean;
  viewerUid: string | null;
  locale: string;
  creatorGamesRefreshKey: number;
  // Badge count; a change means a build started or finished.
  activeBuildCount: number;
}): { mySlugs: Set<string>; creatorGamesReady: boolean } {
  const [creatorItems, setCreatorItems] = useState<CreatorGameItem[]>([]);
  // Starts false until auth resolves, so the grid never paints unpinned first.
  const [creatorGamesReady, setCreatorGamesReady] = useState(false);
  const loadedAt = useRef(0);

  useEffect(() => {
    if (authLoading) return;
    if (!viewerUid) {
      setCreatorItems([]);
      setCreatorGamesReady(true);
      return;
    }
    // Drop the previous viewer's shelf immediately on account switch.
    setCreatorItems([]);
    setCreatorGamesReady(false);
  }, [authLoading, viewerUid, locale]);

  useEffect(() => {
    if (authLoading || !viewerUid) return;
    let cancelled = false;

    const load = (at: number) => {
      loadedAt.current = at;
      void loadCreatorGames(locale).then((items) => {
        if (cancelled) return;
        setCreatorItems(items);
        setCreatorGamesReady(true);
      });
    };

    // Re-runs on an activeBuildCount change: the only local reason a pin appears.
    load(Date.now());

    // Another device may have published; re-read on return, floored.
    const onVisible = () => {
      if (document.hidden) return;
      const at = Date.now();
      if (at - loadedAt.current < RETURN_REFRESH_FLOOR_MS) return;
      load(at);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authLoading, viewerUid, creatorGamesRefreshKey, locale, activeBuildCount]);

  const mySlugs = useMemo(() => publishedCreatorSlugs(creatorItems), [creatorItems]);

  return { mySlugs, creatorGamesReady };
}
