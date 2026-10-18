import { useEffect, useMemo, useState } from 'react';
import type { CatalogEntry } from './catalog.js';
import type { CatalogStatus } from './useCatalogData.js';
import { fetchGamePage } from './gamePageApi.js';

// `playableEntries` is the catalog plus the unlisted game its /play link names.
export type UnlistedPlayLookup = { unlistedLoading: boolean; playableEntries: CatalogEntry[] };

type UnlistedPlayOptions = {
  slug: string | null;
  catalogEntries: CatalogEntry[];
  catalogStatus: CatalogStatus;
  fetchPage?: typeof fetchGamePage;
};

// Resolves an unlisted game's entry for its own /play link.
export function useUnlistedPlayEntry({
  slug,
  catalogEntries,
  catalogStatus,
  fetchPage = fetchGamePage,
}: UnlistedPlayOptions): UnlistedPlayLookup {
  const missing = slug !== null && catalogStatus === 'ready' && !catalogEntries.some((game) => game.slug === slug);
  const [lookup, setLookup] = useState<{ slug: string; entry: CatalogEntry | null } | null>(null);

  useEffect(() => {
    if (!missing || slug === null) return;
    let cancelled = false;
    fetchPage(slug)
      .then((page) => {
        if (!cancelled) setLookup({ slug, entry: page.entry.listed === false ? page.entry : null });
      })
      .catch(() => {
        if (!cancelled) setLookup({ slug, entry: null });
      });
    return () => {
      cancelled = true;
    };
  }, [missing, slug, fetchPage]);

  const found = missing && lookup?.slug === slug ? lookup.entry : null;
  const playableEntries = useMemo(() => (found ? [...catalogEntries, found] : catalogEntries), [catalogEntries, found]);
  return { unlistedLoading: missing && lookup?.slug !== slug, playableEntries };
}
