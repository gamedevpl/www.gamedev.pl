import { describe, expect, it, vi } from 'vitest';
import { EXAMPLE_DEMOTION, scopeToBoostSpec, scopeToFilter } from './knowledge-corpus-policy.js';
import { createQueryKnowledge } from './knowledge-search.js';

function capturingClient(reply: unknown) {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(init!.body as string));
    return new Response(JSON.stringify(reply), { status: 200 });
  });
  const query = createQueryKnowledge({ engineId: 'e', getAccessToken: async () => 't', fetchImpl });
  return { bodies, query };
}

const searchReply = {
  results: [{ chunk: { content: 'c', documentMetadata: { structData: { repoPath: 'shared/game-kit.d.ts' } } } }],
};

describe('example demotion', () => {
  it('demotes example code only in an unscoped search', async () => {
    const { bodies, query } = capturingClient(searchReply);

    await query({ query: 'undo a move', mode: 'chunks' });
    await query({ query: 'undo a move', mode: 'chunks', scope: 'examples' });

    expect(bodies[0]?.boostSpec).toEqual({
      conditionBoostSpecs: [{ condition: 'corpus: ANY("example")', boost: EXAMPLE_DEMOTION }],
    });
    expect(bodies[1]).not.toHaveProperty('boostSpec');
    expect(scopeToBoostSpec('kit')).toBeUndefined();
  });

  it('sends the same demotion with an unscoped answer request', async () => {
    const answer = { answer: { state: 'SUCCEEDED', answerText: 'Use createUndoStack.', references: [] } };
    const { bodies, query } = capturingClient(answer);

    await query({ query: 'undo a move' });

    const searchParams = (bodies[0]?.searchSpec as { searchParams: Record<string, unknown> }).searchParams;
    expect(searchParams.boostSpec).toEqual(scopeToBoostSpec(undefined));
    expect(searchParams.filter).toBe(scopeToFilter(undefined));
  });
});
