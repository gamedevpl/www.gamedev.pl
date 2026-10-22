import { describe, expect, it, vi } from 'vitest';
import { createQueryKnowledge } from './knowledge-search.js';

describe('spell correction', () => {
  it('searches and answers the query as typed', async () => {
    const bodies: Record<string, Record<string, unknown>> = {};
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.endsWith(':answer') ? 'answer' : 'search';
      bodies[path] = JSON.parse(init!.body as string);
      const answer = { state: 'SUCCEEDED', answerText: 'createTimeTrial records a ghost.', references: [] };
      return new Response(JSON.stringify(path === 'answer' ? { answer } : { results: [] }), { status: 200 });
    });
    const queryKnowledge = createQueryKnowledge({
      getAccessToken: async () => 'test-token',
      engineId: 'gamedevpl-knowledge',
      fetchImpl,
    });

    await queryKnowledge({ query: 'best lap ghost replay', mode: 'chunks' });
    await queryKnowledge({ query: 'best lap ghost replay', mode: 'answer' });

    expect(bodies.search?.spellCorrectionSpec).toEqual({ mode: 'SUGGESTION_ONLY' });
    expect(bodies.answer?.queryUnderstandingSpec).toEqual({ disableSpellCorrection: true });
  });
});
