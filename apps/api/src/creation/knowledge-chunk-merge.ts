import type { KnowledgeChunk } from './knowledge-search.js';

// Over-fetch so merged same-file chunks still fill a page.
export const CHUNKS_FETCH_SIZE = 10;
const SAME_FILE_SEPARATOR = '\n\n[…]\n\n';

// One entry per file; later same-file chunks append to its snippet.
export function mergeSameFileChunks(chunks: KnowledgeChunk[], maxFiles: number): KnowledgeChunk[] {
  const byPath = new Map<string, KnowledgeChunk>();
  for (const chunk of chunks) {
    const existing = byPath.get(chunk.repoPath);
    if (existing) {
      existing.snippet += SAME_FILE_SEPARATOR + chunk.snippet;
    } else if (byPath.size < maxFiles) {
      byPath.set(chunk.repoPath, { ...chunk });
    }
  }
  return [...byPath.values()];
}
