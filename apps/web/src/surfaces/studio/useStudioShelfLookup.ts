import { useEffect, useState } from 'react';
import { fetchStudioGames, type StudioGamesResponse } from '../../studioApi.js';

export function useStudioShelfLookup({
  requestedGame,
  resolved,
  loadedFor,
  loading,
  failed,
  truncated,
  onLoaded,
}: {
  requestedGame?: string;
  resolved: boolean;
  loadedFor?: string;
  loading: boolean;
  failed: boolean;
  truncated: boolean;
  onLoaded: (page: StudioGamesResponse, game?: string) => void;
}): { pending: boolean; failed: boolean } {
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const needed = Boolean(requestedGame && !resolved && truncated && !loading && !failed && loadedFor !== requestedGame);
  useEffect(() => {
    setFailedFor(null);
    if (!needed || !requestedGame) return;
    let cancelled = false;
    void fetchStudioGames(requestedGame)
      .then((page) => {
        if (!cancelled) onLoaded(page, requestedGame);
      })
      .catch(() => {
        if (!cancelled) setFailedFor(requestedGame);
      });
    return () => {
      cancelled = true;
    };
  }, [needed, requestedGame, onLoaded]);
  return { pending: needed && failedFor !== requestedGame, failed: failedFor === requestedGame };
}
