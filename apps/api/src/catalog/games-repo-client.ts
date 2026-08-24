import type { GitHubClient } from './github-client.js';

/**
 * Builds a games-repo client from the environment, or null when there is none.
 *
 * Null makes every route that depends on it answer 404, exactly as an absent slug gate
 * already does for votes and saves — the feature is simply not there, rather than there
 * and broken.
 *
 * Shared by every feature that reads a game's manifest off the games repo (P2 worlds, P3
 * zones), so it is built once in `platform/app.ts` and injected rather than each caller
 * resolving its own — the same shared-construction rule `published-slugs.ts` follows for
 * the catalog gate.
 */
export async function createGamesRepoClientFromEnv(
  fetchImpl?: typeof fetch,
): Promise<Pick<GitHubClient, 'getGameManifest'> | null> {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repo = process.env.GAMES_REPO?.trim();
  if (token && repo) {
    const { createGitHubClient } = await import('./github-client.js');
    return createGitHubClient({ token, repo, fetchImpl });
  }

  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv !== 'production' && nodeEnv !== 'test') {
    const { resolveLocalGamesDir, createLocalGamesClient } = await import('./local-games-repo.js');
    const local = await resolveLocalGamesDir();
    return createLocalGamesClient({ rootDir: local.rootDir });
  }

  return null;
}
