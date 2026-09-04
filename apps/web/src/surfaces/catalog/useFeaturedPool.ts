import { useEffect, useState } from 'react';
import { fetchFeaturedSlugs } from '../../featuredApi.js';

// Caps the featured-pool wait; a stall must not block the grid.
const FEATURED_POOL_TIMEOUT_MS = 1200;

// Curated pool for the featured slot; fetched once, not personalized.
export function useFeaturedPool(): { featuredPool: string[]; featuredPoolReady: boolean } {
  const [featuredPool, setFeaturedPool] = useState<string[]>([]);
  // Gates showCurated; fetchFeaturedSlugs fails open, so this always resolves.
  const [featuredPoolReady, setFeaturedPoolReady] = useState(false);

  useEffect(() => {
    let settled = false;
    const settle = (slugs: string[]) => {
      if (settled) return;
      settled = true;
      setFeaturedPool(slugs);
      setFeaturedPoolReady(true);
    };
    void fetchFeaturedSlugs().then(settle);
    const timer = window.setTimeout(() => settle([]), FEATURED_POOL_TIMEOUT_MS);
    return () => {
      settled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return { featuredPool, featuredPoolReady };
}
