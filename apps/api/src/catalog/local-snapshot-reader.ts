import { isPublishedEntry } from '@gamedevpl/contract';
import { mediaContentType, type GameSnapshotReader } from './game-snapshot.js';
import { bakeGameDocument } from './game-snapshot-publish.js';
import type { GitHubClient } from './github-client.js';

// Local dev only: bakes from the local games tree on demand.
export function createLocalSnapshotReader(client: GitHubClient, ref: string): GameSnapshotReader {
  const readCatalog = async () => (await client.getCatalog(ref)).filter(isPublishedEntry);
  return {
    getPointer: async () => null,
    getCatalog: readCatalog,
    getCatalogFresh: readCatalog,
    getGame: (slug) => bakeGameDocument(client, ref, slug),
    async getMedia(slug, filename, width) {
      // No baked variants locally; callers fall back to the original.
      if (width !== undefined) return null;
      const bytes = await client.getGameMedia(ref, slug, filename);
      return bytes ? { body: Buffer.from(bytes), contentType: mediaContentType(filename) } : null;
    },
  };
}

// Test seam: a games client plus the snapshot baked from it.
export function withSnapshot(githubClient: GitHubClient, ref = 'main') {
  return { githubClient, snapshotReader: createLocalSnapshotReader(githubClient, ref) };
}
