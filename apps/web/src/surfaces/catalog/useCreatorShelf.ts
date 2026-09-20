import { useEffect, useMemo, useRef, useState } from 'react';
import { loadCreatorGames, publishedCreatorSlugs, type CreatorGameItem } from '../../creatorGames.js';

// How stale a pin may get, and the slowest re-read.
const REFRESH_FLOOR_MS = 5 * 60_000;

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

    // Fresh wiring owes a read, so no floor may skip it.
    loadedAt.current = 0;

    // A hidden tab shows no pins, so it asks for none.
    const tick = () => {
      if (!document.hidden) load(Date.now());
    };

    // Re-runs on an activeBuildCount change: a pin may have appeared.
    tick();

    // A transfer in, or a failed first read, changes no local signal.
    const timer = window.setInterval(tick, REFRESH_FLOOR_MS);

    // Catch up on the way back rather than waiting out the interval.
    const onVisible = () => {
      if (document.hidden) return;
      const at = Date.now();
      if (at - loadedAt.current < REFRESH_FLOOR_MS) return;
      load(at);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authLoading, viewerUid, creatorGamesRefreshKey, locale, activeBuildCount]);

  const mySlugs = useMemo(() => publishedCreatorSlugs(creatorItems), [creatorItems]);

  return { mySlugs, creatorGamesReady };
}
