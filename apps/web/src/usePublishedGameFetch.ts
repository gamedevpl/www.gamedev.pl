import { useEffect, useState } from 'react';
import { fetchPublishedGame, type FetchProgress, type GameFetchError, type PublishedGame } from './catalog.js';

function asFetchError(err: unknown): GameFetchError {
  if (err instanceof Error) return err as GameFetchError;
  return new Error(typeof err === 'string' ? err : 'Game request failed') as GameFetchError;
}

const RETRY_STATUSES = new Set([404, 409, 502, 503]);
const MAX_FETCH_RETRIES = 3;
export const PUBLISHED_FETCH_RETRY_MS = 4_000;

export function usePublishedGameFetch(slug: string, attempt = 0) {
  const [game, setGame] = useState<PublishedGame | null>(null);
  const [progress, setProgress] = useState<FetchProgress>({ loaded: 0, total: null });
  const [error, setError] = useState<GameFetchError | null>(null);

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    setGame(null);
    setError(null);
    setProgress({ loaded: 0, total: null });

    const run = () => {
      fetchPublishedGame(slug, {
        signal: abort.signal,
        onProgress: (next) => {
          if (!cancelled) setProgress(next);
        },
      })
        .then((next) => {
          if (!cancelled) setGame(next);
        })
        .catch((err: unknown) => {
          if (cancelled || (err instanceof Error && err.name === 'AbortError')) return;
          const failure = asFetchError(err);
          if (failure.status && RETRY_STATUSES.has(failure.status) && tries < MAX_FETCH_RETRIES) {
            tries += 1;
            retryTimer = setTimeout(run, PUBLISHED_FETCH_RETRY_MS);
            return;
          }
          setError(failure);
        });
    };
    run();

    return () => {
      cancelled = true;
      abort.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [slug, attempt]);

  return { game, progress, error };
}
