import { describe, expect, it } from 'vitest';
import { resolveRefineFallbackModel } from './vertex-fallback-models.js';

describe('what may stand in for the refiner', () => {
  it('stands nothing in until an operator asks for it', () => {
    expect(resolveRefineFallbackModel({})).toBeUndefined();
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
