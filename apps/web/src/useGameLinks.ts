import { useEffect, useState } from 'react';
import type { CatalogLinks } from '@gamedevpl/contract';
import { fetchGamePage } from './gamePageApi.js';

// Known links, else the public game page's; null until known.
export function useGameLinks(slug: string | undefined, known: CatalogLinks | null | undefined): CatalogLinks | null {
  const [fetched, setFetched] = useState<{ slug: string; links: CatalogLinks | null } | null>(null);
  const needsFetch = Boolean(slug) && known === undefined;

  useEffect(() => {
    if (!needsFetch || !slug) return;
    let cancelled = false;
    fetchGamePage(slug)
      .then((page) => {
        if (!cancelled) setFetched({ slug, links: page.entry.links ?? null });
      })
      .catch(() => {
        if (!cancelled) setFetched({ slug, links: null });
      });
    return () => {
      cancelled = true;
    };
  }, [needsFetch, slug]);

  if (known !== undefined) return known;
  return fetched && fetched.slug === slug ? fetched.links : null;
}
