import { describe, expect, it } from 'vitest';
import { resolveRefineFallbackModel } from './vertex-fallback-models.js';

describe('what may stand in for the refiner', () => {
  it('defaults to a peer model', () => {
    expect(resolveRefineFallbackModel({})).toBe('claude-sonnet-5');
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
