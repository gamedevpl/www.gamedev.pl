import { describe, expect, it } from 'vitest';
import { resolveRefineFallbackModel } from './vertex-fallback-models.js';

describe('what may stand in for the refiner', () => {
  // Vertex 404s Claude for this project, under either publisher.
  it('stands nothing in until an operator names a model that exists', () => {
    expect(resolveRefineFallbackModel({})).toBeUndefined();
  });

  it('accepts another peer when one is configured', () => {
    expect(resolveRefineFallbackModel({ REFINE_FALLBACK_MODEL: 'claude-opus-5' })).toBe('claude-opus-5');
  });

  // Refinement shapes what gets built.
  it('refuses a cheaper model rather than degrading', () => {
    expect(resolveRefineFallbackModel({ REFINE_FALLBACK_MODEL: 'gemini-3.0-flash' })).toBeUndefined();
    expect(resolveRefineFallbackModel({ REFINE_FALLBACK_MODEL: 'gpt-5.6-luna' })).toBeUndefined();
  });
});
