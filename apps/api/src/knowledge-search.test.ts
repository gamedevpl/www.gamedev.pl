import { describe, expect, it, vi } from 'vitest';
import {
  applyResultSizeBudget,
  createQueryKnowledge,
  DEFAULT_RESULT_TARGET_BYTES,
  looksLikeEmptyAnswer,
  scopeToFilter,
  type KnowledgeChunk,
} from './knowledge-search.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function answerBody(text: string, opts: { state?: string; repoPath?: string } = {}) {
  return {
    answer: {
      state: opts.state ?? 'SUCCEEDED',
      answerText: text,
      references: [
        {
          chunkInfo: {
            content: 'export interface PartyApi { join(): void; }',
            documentMetadata: {
              uri: opts.repoPath ?? 'kits/current/shared/modules/party.d.ts',
              structData: {
                repoPath: opts.repoPath ?? 'kits/current/shared/modules/party.d.ts',
                sourceCommit: 'commit-1',
              },
            },
          },
        },
      ],
    },
  };
}

function searchBody(count: number, contentBytes = 200) {
  return {
    results: Array.from({ length: count }, (_, i) => ({
      chunk: {
        content: 'x'.repeat(contentBytes),
        documentMetadata: {
          uri: `kits/current/shared/modules/module-${i}.d.ts`,
          structData: { repoPath: `kits/current/shared/modules/module-${i}.d.ts`, sourceCommit: 'commit-1' },
        },
      },
    })),
  };
}

function testClient(overrides: Parameters<typeof createQueryKnowledge>[0]) {
  return createQueryKnowledge({ getAccessToken: async () => 'test-token', ...overrides });
}

describe('scopeToFilter', () => {
  it('maps each scope to the corpus filter the games-repo corpus documents', () => {
    expect(scopeToFilter('kit')).toBe('corpus: ANY("kit-api","module","vertical","digest")');
    expect(scopeToFilter('editor')).toBe('corpus: ANY("editor")');
    expect(scopeToFilter('examples')).toBe('corpus: ANY("example")');
    expect(scopeToFilter('docs')).toBe('corpus: ANY("doc","skill","spec")');
    expect(scopeToFilter(undefined)).toBeUndefined();
  });
});

describe('looksLikeEmptyAnswer', () => {
  it('flags the known "no answer" boilerplate', () => {
    expect(looksLikeEmptyAnswer('This cannot be answered from the given sources.')).toBe(true);
    expect(looksLikeEmptyAnswer('No answer could be generated for this query.')).toBe(true);
    expect(looksLikeEmptyAnswer('')).toBe(true);
    expect(looksLikeEmptyAnswer('   ')).toBe(true);
  });

  it('flags a non-SUCCEEDED state regardless of text', () => {
    expect(looksLikeEmptyAnswer('some text', 'FAILED')).toBe(true);
  });

  it('accepts a real answer', () => {
    expect(looksLikeEmptyAnswer('The party module handles same-screen multiplayer.')).toBe(false);
  });
});

describe('queryKnowledge — mode=answer', () => {
  it('returns synthesized prose with attribution', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(answerBody('The party module handles same-screen multiplayer.')));
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    const result = await queryKnowledge({ query: 'how do parties work', mode: 'answer' });

    expect(result.mode).toBe('answer');
    expect(result.fallback).toBe(false);
    expect(result.answer).toContain('party module');
    expect(result.repoPaths).toEqual(['kits/current/shared/modules/party.d.ts']);
    expect(result.indexedCommit).toBe('commit-1');
    expect(result.guidance).toMatch(/get_kit_api/);
    expect(result.warnings).toEqual([]);
  });

  it('sends the required quota-project header and hits :answer', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(answerBody('An answer.')));
    const queryKnowledge = createQueryKnowledge({
      engineId: 'gamedevpl-knowledge',
      fetchImpl,
      getAccessToken: async () => 'test-token',
      quotaProject: 'gamedevpl',
    });

    await queryKnowledge({ query: 'q', mode: 'answer' });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(':answer');
    expect(url).toContain('eu-discoveryengine.googleapis.com');
    expect((init.headers as Record<string, string>)['x-goog-user-project']).toBe('gamedevpl');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-token');
  });

  it('dedupes references that cite the same chunk more than once', async () => {
    const oneRef = answerBody('The party module handles same-screen multiplayer.');
    const body = {
      answer: {
        ...oneRef.answer,
        // One chunk cited twice, as answer synthesis does for multi-sentence support.
        references: [...oneRef.answer.references, ...oneRef.answer.references],
      },
    };
    const fetchImpl = vi.fn(async () => jsonResponse(body));
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    const result = await queryKnowledge({ query: 'how do parties work', mode: 'answer' });

    expect(result.chunks).toHaveLength(1);
    expect(result.repoPaths).toEqual(['kits/current/shared/modules/party.d.ts']);
  });

  it('keeps distinct chunks from the same file when their content differs', async () => {
    const base = answerBody('one');
    const other = answerBody('two');
    other.answer.references[0].chunkInfo.content = 'export interface PartyApi { leave(): void; }';
    const body = {
      answer: { ...base.answer, references: [...base.answer.references, ...other.answer.references] },
    };
    const fetchImpl = vi.fn(async () => jsonResponse(body));
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    const result = await queryKnowledge({ query: 'how do parties work', mode: 'answer' });

    expect(result.chunks).toHaveLength(2);
  });

  it('does not collide two distinct (repoPath, content) pairs that share a delimiter', async () => {
    const one = answerBody('one', { repoPath: 'a b' });
    one.answer.references[0].chunkInfo.content = 'c';
    const two = answerBody('two', { repoPath: 'a' });
    two.answer.references[0].chunkInfo.content = 'b c';
    const body = {
      answer: { ...one.answer, references: [...one.answer.references, ...two.answer.references] },
    };
    const fetchImpl = vi.fn(async () => jsonResponse(body));
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    const result = await queryKnowledge({ query: 'how do parties work', mode: 'answer' });

    expect(result.chunks).toHaveLength(2);
  });
});

describe('queryKnowledge — mode=chunks', () => {
  it('returns raw chunks, no answer field', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(searchBody(3)));
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    const result = await queryKnowledge({ query: 'party module', mode: 'chunks' });

    expect(result.mode).toBe('chunks');
    expect(result.answer).toBeUndefined();
    expect(result.chunks).toHaveLength(3);
    expect(result.repoPaths).toHaveLength(3);
  });

  it('dedupes search results that return the same chunk twice', async () => {
    const body = searchBody(1);
    body.results.push(body.results[0]);
    const fetchImpl = vi.fn(async () => jsonResponse(body));
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    const result = await queryKnowledge({ query: 'party module', mode: 'chunks' });

    expect(result.chunks).toHaveLength(1);
  });

  it('applies the scope filter to the search request body', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init!.body as string);
      return jsonResponse(searchBody(1));
    });
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    await queryKnowledge({ query: 'q', mode: 'chunks', scope: 'editor' });

    expect(capturedBody?.filter).toBe('corpus: ANY("editor")');
    expect((capturedBody?.contentSearchSpec as Record<string, unknown>)?.searchResultMode).toBe('CHUNKS');
  });
});

describe('live API shape (captured 2026-08-10 against the real gamedevpl-knowledge engine)', () => {
  it('parses a real :search response verbatim', async () => {
    const realSearchResponse = {
      results: [
        {
          chunk: {
            name: 'projects/334141807880/locations/eu/collections/default_collection/dataStores/gamedevpl-knowledge/branches/0/documents/shared-modules-party-ts/chunks/c1',
            id: 'c1',
            content: '# shared/modules/party.ts\n\n```ts\nfunction createParty(config) { /* ... */ }\n```',
            documentMetadata: {
              uri: 'gs://gamedevpl-games-store/knowledge/fe4d2aa9f46136e56a4d125b17c102475fa6e5bc/shared/modules/party.ts.md',
              title: 'party.ts',
              structData: {
                sourceCommit: 'fe4d2aa9f46136e56a4d125b17c102475fa6e5bc',
                repoPath: 'shared/modules/party.ts',
                kitVersion: 'fe4d2aa9f46136e56a4d125b17c102475fa6e5bc',
                corpus: 'module',
              },
            },
            relevanceScore: 0.7711970806121826,
          },
        },
      ],
    };
    const fetchImpl = vi.fn(async () => jsonResponse(realSearchResponse));
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    const result = await queryKnowledge({ query: 'how do parties work in gamekit', mode: 'chunks' });

    expect(result.chunks).toEqual([
      { repoPath: 'shared/modules/party.ts', corpus: 'module', snippet: realSearchResponse.results[0].chunk.content },
    ]);
    expect(result.repoPaths).toEqual(['shared/modules/party.ts']);
    expect(result.indexedCommit).toBe('fe4d2aa9f46136e56a4d125b17c102475fa6e5bc');
  });

  it('parses a real :answer response verbatim', async () => {
    const realAnswerResponse = {
      answer: {
        state: 'SUCCEEDED',
        answerText: 'In GameKit, parties are designed for shared-screen multiplayer experiences.',
        citations: [],
        references: [
          {
            chunkInfo: {
              content: '## Party (shared-screen + phone controllers)\n\n- Select `party` in `GAME.json` ...',
              relevanceScore: 0.8,
              documentMetadata: {
                document:
                  'projects/334141807880/locations/eu/collections/default_collection/dataStores/gamedevpl-knowledge/branches/0/documents/github-skills-develop-canvas-game-references-game-kit-md',
                uri: 'gs://gamedevpl-games-store/knowledge/fe4d2aa9f46136e56a4d125b17c102475fa6e5bc/.github/skills/develop-canvas-game/references/game-kit.md',
                title: 'game-kit',
                pageIdentifier: '0',
                structData: {
                  kitVersion: 'fe4d2aa9f46136e56a4d125b17c102475fa6e5bc',
                  corpus: 'skill',
                  sourceCommit: 'fe4d2aa9f46136e56a4d125b17c102475fa6e5bc',
                  repoPath: '.github/skills/develop-canvas-game/references/game-kit.md',
                },
              },
            },
          },
        ],
        steps: [],
      },
    };
    const fetchImpl = vi.fn(async () => jsonResponse(realAnswerResponse));
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    const result = await queryKnowledge({ query: 'how do parties work in gamekit', mode: 'answer' });

    expect(result.answer).toBe(realAnswerResponse.answer.answerText);
    expect(result.repoPaths).toEqual(['.github/skills/develop-canvas-game/references/game-kit.md']);
    expect(result.indexedCommit).toBe('fe4d2aa9f46136e56a4d125b17c102475fa6e5bc');
    expect(result.chunks[0].snippet).toBe(realAnswerResponse.answer.references[0].chunkInfo.content);
  });
});

describe('empty-answer detection and fallback', () => {
  it('falls back to chunks and labels the result, per invariant 2', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(answerBody('This cannot be answered from the given sources.')))
      .mockResolvedValueOnce(jsonResponse(searchBody(2)));
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    const result = await queryKnowledge({ query: 'obscure question', mode: 'answer' });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.mode).toBe('chunks');
    expect(result.fallback).toBe(true);
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'answer_empty_fallback' })]);
  });
});

describe('fail-open behaviour', () => {
  it('degrades a 500 response to a warning-only chunks-mode result', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }));
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    const result = await queryKnowledge({ query: 'q', mode: 'chunks' });

    expect(result.chunks).toEqual([]);
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'upstream_error' })]);
  });

  it('degrades a timeout to a warning-only result without throwing', async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error('aborted');
      err.name = 'TimeoutError';
      throw err;
    });
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    const result = await queryKnowledge({ query: 'q', mode: 'chunks' });

    expect(result.warnings).toEqual([expect.objectContaining({ code: 'upstream_timeout' })]);
  });

  it('degrades a malformed / non-JSON payload rather than throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response('not json', { status: 200 }));
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    const result = await queryKnowledge({ query: 'q', mode: 'chunks' });

    expect(result.warnings).toEqual([expect.objectContaining({ code: 'upstream_error' })]);
  });

  it('falls back to chunks when :answer itself fails, still never throwing', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(jsonResponse(searchBody(1)));
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    const result = await queryKnowledge({ query: 'q', mode: 'answer' });

    expect(result.mode).toBe('chunks');
    expect(result.fallback).toBe(true);
    expect(result.chunks).toHaveLength(1);
  });

  it('degrades to a bare warning when both the answer and the chunks fallback fail', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }));
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    const result = await queryKnowledge({ query: 'q', mode: 'answer' });

    expect(result.chunks).toEqual([]);
    expect(result.answer).toBeUndefined();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('applyResultSizeBudget', () => {
  it('keeps a realistic top-5-chunk response well under the 24 KiB target', () => {
    const chunks: KnowledgeChunk[] = Array.from({ length: 5 }, (_, i) => ({
      repoPath: `kits/current/shared/modules/module-${i}.d.ts`,
      corpus: 'module',
      snippet: 'x'.repeat(3000),
    }));
    const result = applyResultSizeBudget({
      mode: 'chunks',
      fallback: false,
      chunks,
      repoPaths: chunks.map((c) => c.repoPath),
      guidance: 'Verify via get_kit_api.',
      truncated: false,
      cached: false,
      warnings: [],
    });

    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(DEFAULT_RESULT_TARGET_BYTES);
  });

  it('truncates and flags rather than silently exceeding the hard cap', () => {
    const chunks: KnowledgeChunk[] = Array.from({ length: 5 }, (_, i) => ({
      repoPath: `kits/current/shared/modules/module-${i}.d.ts`,
      snippet: 'x'.repeat(20_000),
    }));
    const result = applyResultSizeBudget({
      mode: 'chunks',
      fallback: false,
      chunks,
      repoPaths: chunks.map((c) => c.repoPath),
      guidance: 'g',
      truncated: false,
      cached: false,
      warnings: [],
    });

    expect(result.truncated).toBe(true);
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'result_truncated' })]);
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(32 * 1024);
  });
});

describe('caching', () => {
  it('serves a second identical call from cache without refetching', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(searchBody(1)));
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    const first = await queryKnowledge({ query: 'party module', mode: 'chunks' });
    const second = await queryKnowledge({ query: 'Party Module', mode: 'chunks' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.chunks).toEqual(first.chunks);
  });

  it('does not cross-hit across mode, scope or query', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(searchBody(1)));
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    await queryKnowledge({ query: 'party module', mode: 'chunks', scope: 'kit' });
    await queryKnowledge({ query: 'party module', mode: 'chunks', scope: 'editor' });
    await queryKnowledge({ query: 'party module', mode: 'chunks' });
    await queryKnowledge({ query: 'zone module', mode: 'chunks' });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('flushes the cache once a fetch reports a new indexedCommit', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(searchBody(1)))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              chunk: {
                content: 'updated content',
                documentMetadata: {
                  uri: 'kits/current/shared/modules/module-0.d.ts',
                  structData: { repoPath: 'kits/current/shared/modules/module-0.d.ts', sourceCommit: 'commit-2' },
                },
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(searchBody(1)));
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    await queryKnowledge({ query: 'query a', mode: 'chunks' });
    await queryKnowledge({ query: 'query b', mode: 'chunks' }); // observes commit-2, flushes cache
    const third = await queryKnowledge({ query: 'query a', mode: 'chunks' });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(third.cached).toBe(false);
  });

  it('expires a cache entry after its TTL, even with no new indexedCommit observed', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(searchBody(1)));
    let clock = 0;
    const queryKnowledge = testClient({
      engineId: 'gamedevpl-knowledge',
      fetchImpl,
      cacheTtlMs: 1000,
      now: () => clock,
    });

    const first = await queryKnowledge({ query: 'party module', mode: 'chunks' });
    clock += 500;
    const second = await queryKnowledge({ query: 'party module', mode: 'chunks' });
    clock += 501; // crosses the 1000ms TTL measured from the first fetch
    const third = await queryKnowledge({ query: 'party module', mode: 'chunks' });

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(third.cached).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not cache a fully degraded (both tiers failed) result', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }));
    const queryKnowledge = testClient({ engineId: 'gamedevpl-knowledge', fetchImpl });

    await queryKnowledge({ query: 'q', mode: 'chunks' });
    await queryKnowledge({ query: 'q', mode: 'chunks' });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
