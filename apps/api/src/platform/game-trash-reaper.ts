import type { GamesStore } from '../delivery/games-store.js';
import type { Store } from './store.js';
import { refuse } from '../store/slices/game-trash.js';

export async function purgeTrashedGame(
  store: Store,
  games: GamesStore | undefined,
  slug: string,
  repoPublished: (slug: string) => Promise<boolean>,
  until?: string,
) {
  if (await repoPublished(slug)) refuse('unpublish_first');
  await store.gameTrash.purge(slug, until, async () => {
    if (!games?.purgeGame) refuse('games_store_unavailable', 503);
    await games.purgeGame(slug);
  });
}

export async function reapTrashedGames(
  store: Store,
  games: GamesStore | undefined,
  repoPublished: (slug: string) => Promise<boolean>,
  now: number,
  onError: (slug: string, error: unknown) => void,
) {
  const until = new Date(now).toISOString();
  let failures = 0;
  for (const row of await store.gameTrash.list(until)) {
    try {
      await purgeTrashedGame(store, games, row.slug, repoPublished, until);
    } catch (error) {
      onError(row.slug, error);
      failures++;
    }
  }
  return failures;
}
