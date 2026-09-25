import { genaicode, type GenerationRequest } from 'genaicode';
import { describe, expect, it } from 'vitest';
import { VertexSpecRefiner } from './refine.js';

const noGrounding = genaicode({
  name: 'grounding-none',
  async generate() {
    return { parts: [{ type: 'text' as const, text: 'NONE' }] };
  },
});

function exhausted(onCall?: () => void) {
  return genaicode({
    name: 'vertex-exhausted',
    async generate() {
      onCall?.();
      throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
    },
  });
}

describe('spec refinement provider fallback', () => {
  it('uses OpenAI Luna after Vertex capacity failures and validates the same response', async () => {
    let vertexCalls = 0;
    let fallbackRequest: GenerationRequest | undefined;
    const fallback = genaicode({
      name: 'openai-stub',
      async generate(request) {
        fallbackRequest = request;
        return {
          parts: [
            {
              type: 'text' as const,
              text: JSON.stringify({ suggestedTitle: 'Kółko 3D', questions: [{ question: 'Jaki rozmiar planszy?' }] }),
            },
          ],
        };
      },
    });
    const refiner = new VertexSpecRefiner({
      client: exhausted(() => (vertexCalls += 1)),
      groundingClient: noGrounding,
      fallbackClient: fallback,
      fallbackApiKey: 'test-key',
      timeoutMs: 1000,
    });

    const result = await refiner.refine({ concept: 'Stwórz kółko i krzyżyk w przestrzeni 3D', locale: 'pl' });

    expect(vertexCalls).toBe(2);
    expect(result.suggestedTitle).toBe('Kółko 3D');
    expect(result.questions[0]?.question).toBe('Jaki rozmiar planszy?');
    expect(fallbackRequest?.prompt[0]?.text).toContain('entirely in Polish');
    expect(fallbackRequest?.temperature).toBeUndefined();
  });

  it('fails closed when OpenAI Luna also fails', async () => {
    const failing = exhausted();
    const refiner = new VertexSpecRefiner({
      client: failing,
      groundingClient: noGrounding,
      fallbackClient: failing,
      fallbackApiKey: 'test-key',
      timeoutMs: 1000,
    });

    await expect(refiner.refine({ concept: 'A game concept for an unavailable model' })).rejects.toThrow();
  });
});
