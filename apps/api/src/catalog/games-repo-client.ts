import type { GitHubClient } from './github-client.js';

// Null means no games repo configured — routes 404 instead of erroring.

// Built once in the composition root and injected, not resolved per caller.
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
