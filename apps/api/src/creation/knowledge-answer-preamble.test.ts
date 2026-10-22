import { describe, expect, it, vi } from 'vitest';
import { createQueryKnowledge, looksLikeEmptyAnswer } from './knowledge-search.js';

describe('answer preamble', () => {
  it('corrects a premise only on source evidence and reports a miss as not covered', async () => {
    let body: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      body = JSON.parse(init!.body as string);
      const answer = { state: 'SUCCEEDED', answerText: 'createTimeTrial records a ghost.', references: [] };
      return new Response(JSON.stringify({ answer }), { status: 200 });
    });
    const queryKnowledge = createQueryKnowledge({
      getAccessToken: async () => 'test-token',
      engineId: 'gamedevpl-knowledge',
      fetchImpl,
    });

    await queryKnowledge({ query: 'best lap ghost replay', mode: 'answer' });

    const preamble = (body?.answerGenerationSpec as { promptSpec: { preamble: string } }).promptSpec.preamble;
    expect(preamble).toContain('If a source contradicts an assumption');
    expect(preamble).toContain('never conclude that the platform lacks a feature');
    expect(preamble).toContain('"The sources do not cover this."');
  });

  it('treats only the exact not-covered reply as an empty answer', () => {
    expect(looksLikeEmptyAnswer('The sources do not cover this.')).toBe(true);
    expect(looksLikeEmptyAnswer('  the sources do not cover this  ')).toBe(true);
    expect(looksLikeEmptyAnswer('The sources do not cover this API detail, but createTimeTrial records a ghost.')).toBe(
      false,
    );
  });
});
