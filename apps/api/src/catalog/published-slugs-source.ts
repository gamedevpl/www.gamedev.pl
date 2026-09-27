import { createGitHubClient } from './github-client.js';
import type { GameSnapshotReader } from './game-snapshot.js';
import { createPublishedSlugGate, type PublishedSlugGate } from './published-slugs.js';

export async function createPublishedSlugGateFromEnv(
  fetchImpl?: typeof fetch,
  snapshot?: Pick<GameSnapshotReader, 'getCatalog'> | null,
): Promise<PublishedSlugGate | null> {
  if (snapshot) {
    return createPublishedSlugGate({
      ttlMs: 60_000,
      client: {
        async getCatalog() {
          const catalog = await snapshot.getCatalog();
          if (!catalog) throw new Error('published snapshot catalog unavailable');
          return catalog;
        },
      },
    });
  }
  const token = process.env.GITHUB_TOKEN?.trim();
  const repo = process.env.GAMES_REPO?.trim();
  if (token && repo) {
    return createPublishedSlugGate({ client: createGitHubClient({ token, repo, fetchImpl }) });
  }

  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv !== 'production' && nodeEnv !== 'test') {
    const { resolveLocalGamesDir, createLocalGamesClient } = await import('./local-games-repo.js');
    const local = await resolveLocalGamesDir();
    return createPublishedSlugGate({ client: createLocalGamesClient({ rootDir: local.rootDir }) });
  }

  return null;
}
