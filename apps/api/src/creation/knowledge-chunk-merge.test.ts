import { describe, expect, it, vi } from 'vitest';
import { CHUNKS_FETCH_SIZE, mergeSameFileChunks } from './knowledge-chunk-merge.js';
import { createQueryKnowledge } from './knowledge-search.js';

const chunk = (repoPath: string, snippet: string) => ({ repoPath, snippet });

describe('mergeSameFileChunks', () => {
  it('keeps one entry per file at its best rank and appends later chunks', () => {
    const merged = mergeSameFileChunks(
      [chunk('a.md', 'a1'), chunk('b.md', 'b1'), chunk('a.md', 'a2'), chunk('c.md', 'c1'), chunk('a.md', 'a3')],
      5,
    );

    expect(merged.map((c) => c.repoPath)).toEqual(['a.md', 'b.md', 'c.md']);
    expect(merged[0]!.snippet).toBe('a1\n\n[…]\n\na2\n\n[…]\n\na3');
  });

  it('caps distinct files but still merges chunks of kept files', () => {
    const merged = mergeSameFileChunks([chunk('a.md', 'a1'), chunk('b.md', 'b1'), chunk('a.md', 'a2')], 1);

    expect(merged).toEqual([chunk('a.md', 'a1\n\n[…]\n\na2')]);
  });

  it('does not mutate its input', () => {
    const input = [chunk('a.md', 'a1'), chunk('a.md', 'a2')];
    mergeSameFileChunks(input, 5);

    expect(input[0]!.snippet).toBe('a1');
  });
});

describe('queryKnowledge chunks mode', () => {
  it('over-fetches and merges same-file chunks', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const result = (repoPath: string, content: string) => ({
      chunk: { content, documentMetadata: { uri: repoPath, structData: { repoPath, sourceCommit: 'commit-1' } } },
    });
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init!.body as string);
      const body = { results: [result('a.md', 'a1'), result('b.md', 'b1'), result('a.md', 'a2')] };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const queryKnowledge = createQueryKnowledge({
      engineId: 'gamedevpl-knowledge',
      getAccessToken: async () => 'test-token',
      fetchImpl,
    });

    const out = await queryKnowledge({ query: 'q', mode: 'chunks' });

    expect(capturedBody?.pageSize).toBe(CHUNKS_FETCH_SIZE);
    expect(out.repoPaths).toEqual(['a.md', 'b.md']);
    expect(out.chunks[0]!.snippet).toContain('a2');
  });
});
