import { genaicode } from 'genaicode';
import { toOpenAIRequest } from 'genaicode/providers';
import type { GenerationRequest } from 'genaicode';
import { describe, expect, it } from 'vitest';
import { OPENAI_FALLBACK_MODEL as LUNA, VertexChecker } from './moderation.js';
import { OPENAI_REFINE_FALLBACK_MODEL } from './vertex-fallback-models.js';

describe('VertexChecker on the OpenAI stand-in', () => {
  // Luna rejects temperature 0; genaicode strips it on the wire.
  it('falls back to the OpenAI stand-in after Vertex capacity misses', async () => {
    const seen: GenerationRequest[] = [];
    const checker = new VertexChecker({
      retryDelayMs: 0,
      fallbackModel: LUNA,
      fallbackApiKey: 'test-key',
      client: genaicode({
        name: 'stub',
        async generate(request) {
          seen.push(request);
          if (seen.length < 3) throw new Error('429 Resource exhausted');
          return { parts: [{ type: 'text', text: '{"allowed": true, "category": null}' }] };
        },
      }),
    });

    expect(await checker.check('A cozy farming game')).toEqual({ allowed: true });
    expect(seen.map((request) => request.temperature)).toEqual([0, 0, 0]);
  });
});

describe('OpenAI stand-in models on the wire', () => {
  // A model genaicode does not know would send temperature again.
  it.each([LUNA, OPENAI_REFINE_FALLBACK_MODEL])('%s is sent without temperature', (model) => {
    const request = toOpenAIRequest({ prompt: [{ type: 'user', text: 'hi' }], temperature: 0 }, model);
    expect(request.model).toBe(model);
    expect(request.temperature).toBeUndefined();
  });
});
