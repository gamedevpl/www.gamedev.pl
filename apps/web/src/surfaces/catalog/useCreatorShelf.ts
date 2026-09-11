import { useEffect, useMemo, useState } from 'react';
import { loadCreatorGames, publishedCreatorSlugs, type CreatorGameItem } from '../../creatorGames.js';

// Feeds the Studio chip and the Yours pins — never the grid itself.
export function useCreatorShelf({
  authLoading,
  viewerUid,
  locale,
  creatorGamesRefreshKey,
}: {
  authLoading: boolean;
  viewerUid: string | null;
  locale: string;
  creatorGamesRefreshKey: number;
}): { mySlugs: Set<string>; creatorGamesReady: boolean } {
  const [creatorItems, setCreatorItems] = useState<CreatorGameItem[]>([]);
  // Starts false until auth resolves, so the grid never paints unpinned first.
  const [creatorGamesReady, setCreatorGamesReady] = useState(false);

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
    void loadCreatorGames(locale).then((items) => {
      if (cancelled) return;
      setCreatorItems(items);
      setCreatorGamesReady(true);
    });
    const timer = window.setInterval(() => {
      void loadCreatorGames(locale).then((items) => {
        if (!cancelled) setCreatorItems(items);
      });
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authLoading, viewerUid, creatorGamesRefreshKey, locale]);

  const mySlugs = useMemo(() => publishedCreatorSlugs(creatorItems), [creatorItems]);

  return { mySlugs, creatorGamesReady };
}
