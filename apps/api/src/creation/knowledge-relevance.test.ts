import { describe, expect, it, vi } from 'vitest';
import { createQueryKnowledge } from './knowledge-search.js';

describe('relevance threshold', () => {
  it('keeps every ranked chunk, also on the empty-answer fallback', async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith(':answer')) {
        const answer = { state: 'SUCCEEDED', answerText: 'The sources do not cover this.', references: [] };
        return new Response(JSON.stringify({ answer }), { status: 200 });
      }
      bodies.push(JSON.parse(init!.body as string));
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
    const queryKnowledge = createQueryKnowledge({
      getAccessToken: async () => 'test-token',
      engineId: 'gamedevpl-knowledge',
      fetchImpl,
    });

    await queryKnowledge({ query: 'best lap time', mode: 'chunks' });
    await queryKnowledge({ query: 'best lap ghost car replay', mode: 'answer' });

    expect(bodies).toHaveLength(2);
    for (const body of bodies) expect(body.relevanceThreshold).toBe('LOWEST');
  });
});
