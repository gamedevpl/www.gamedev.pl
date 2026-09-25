import { describe, expect, it } from 'vitest';
import { resolveRefineFallbackModel } from './vertex-fallback-models.js';

describe('what may stand in for the refiner', () => {
  it('stands nothing in without an OpenAI key', () => {
    expect(resolveRefineFallbackModel({})).toBeUndefined();
  });

  it('uses Luna on a second vendor when an OpenAI key is available', () => {
    expect(resolveRefineFallbackModel({ OPENAI_API_KEY: 'test-key' })).toBe('gpt-6-luna');
    expect(resolveRefineFallbackModel({ REFINE_FALLBACK_MODEL: 'gpt-6-luna' })).toBeUndefined();
    expect(resolveRefineFallbackModel({ REFINE_FALLBACK_MODEL: 'gpt-6-luna', OPENAI_API_KEY: 'test-key' })).toBe(
      'gpt-6-luna',
    );
  });

  it('accepts a peer Vertex serves when one is configured', () => {
    expect(resolveRefineFallbackModel({ REFINE_FALLBACK_MODEL: 'gemini-3.8-flash' })).toBe('gemini-3.8-flash');
  });

  // Claude comes through the Anthropic and OpenRouter seed providers.
  it('refuses a model Vertex does not serve us, peer or not', () => {
    expect(resolveRefineFallbackModel({ REFINE_FALLBACK_MODEL: 'claude-sonnet-5' })).toBeUndefined();
    expect(resolveRefineFallbackModel({ REFINE_FALLBACK_MODEL: 'claude-opus-5' })).toBeUndefined();
  });

  // Refinement shapes what gets built.
  it('refuses a cheaper model rather than degrading', () => {
    expect(resolveRefineFallbackModel({ REFINE_FALLBACK_MODEL: 'gemini-3.0-flash' })).toBeUndefined();
    expect(resolveRefineFallbackModel({ REFINE_FALLBACK_MODEL: 'gpt-5.6-luna' })).toBeUndefined();
  });
});
