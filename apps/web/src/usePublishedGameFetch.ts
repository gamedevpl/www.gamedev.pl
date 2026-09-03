import { useEffect, useState } from 'react';
import { fetchPublishedGame, type FetchProgress, type PublishedGame } from './catalog.js';

export function usePublishedGameFetch(slug: string, attempt = 0) {
  const [game, setGame] = useState<PublishedGame | null>(null);
  const [progress, setProgress] = useState<FetchProgress>({ loaded: 0, total: null });
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    setGame(null);
    setError(null);
    setProgress({ loaded: 0, total: null });

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
        setError(err);
      });

    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [slug, attempt]);

  return { game, progress, error };
}
