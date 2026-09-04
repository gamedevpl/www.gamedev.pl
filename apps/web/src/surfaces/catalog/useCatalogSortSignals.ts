import { useEffect, useState } from 'react';
import { getRecentPlays } from '../../recentPlays.js';
import {
  fetchCatalogSortSignals,
  readCachedCatalogSortPayload,
  type CatalogSortPayload,
} from '../../recommendationsApi.js';
import { EMPTY_CATALOG_SORT_SIGNALS, type CatalogSortSignals } from './catalogSort.js';

function payloadToSignals(payload: CatalogSortPayload): CatalogSortSignals {
  return {
    recommended: payload.items.map((item) => item.slug),
    newest: payload.newest,
    sessions: new Map(payload.popularity.map((row) => [row.slug, row.sessions])),
    affinityLastPlayed: new Map(payload.lastPlayed.map((row) => [row.slug, row.lastPlayedAt])),
  };
}

function sameCatalogSortSignals(a: CatalogSortSignals, b: CatalogSortSignals): boolean {
  if (a.recommended.length !== b.recommended.length || a.newest.length !== b.newest.length) return false;
  if (a.sessions.size !== b.sessions.size || a.affinityLastPlayed.size !== b.affinityLastPlayed.size) return false;
  for (let i = 0; i < a.recommended.length; i++) {
    if (a.recommended[i] !== b.recommended[i]) return false;
  }
  for (let i = 0; i < a.newest.length; i++) {
    if (a.newest[i] !== b.newest[i]) return false;
  }
  for (const [slug, sessions] of a.sessions) {
    if (b.sessions.get(slug) !== sessions) return false;
  }
  for (const [slug, at] of a.affinityLastPlayed) {
    if (b.affinityLastPlayed.get(slug) !== at) return false;
  }
  return true;
}

function initialSignals(viewerUid: string | null): { signals: CatalogSortSignals; ready: boolean } {
  if (typeof sessionStorage === 'undefined') {
    return { signals: EMPTY_CATALOG_SORT_SIGNALS, ready: false };
  }
  const cached = readCachedCatalogSortPayload(viewerUid);
  if (!cached) return { signals: EMPTY_CATALOG_SORT_SIGNALS, ready: false };
  return { signals: payloadToSignals(cached), ready: true };
}

// Signals fetch in parallel with the catalog, never after it.
export function useCatalogSortSignals(
  viewerUid: string | null,
  recommendationsRefreshKey: number,
): { signals: CatalogSortSignals; signalsReady: boolean } {
  const [signals, setSignals] = useState<CatalogSortSignals>(() => initialSignals(viewerUid).signals);
  const [signalsReady, setSignalsReady] = useState(() => initialSignals(viewerUid).ready);

  useEffect(() => {
    let cancelled = false;
    // Viewer-scoped cache paints first; the response replaces it only when different.
    const cached = readCachedCatalogSortPayload(viewerUid);
    if (cached) {
      setSignals(payloadToSignals(cached));
      setSignalsReady(true);
    } else {
      setSignalsReady(false);
    }
    // A post-play refresh asked for a re-rank, so take it.
    const forceReplace = recommendationsRefreshKey > 0;
    void fetchCatalogSortSignals(getRecentPlays(), viewerUid)
      .then((payload) => {
        if (cancelled) return;
        const next = payloadToSignals(payload);
        if (forceReplace) {
          setSignals(next);
        } else {
          setSignals((prev) => (sameCatalogSortSignals(prev, next) ? prev : next));
        }
        setSignalsReady(true);
      })
      .catch(() => {
        // Transport failure must not leave the arcade stuck on the loading mascot.
        if (cancelled) return;
        setSignalsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [recommendationsRefreshKey, viewerUid]);

  return { signals, signalsReady };
}
