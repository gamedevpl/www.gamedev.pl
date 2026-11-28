import { describe, expect, it } from 'vitest';
import { manifestModulesProblem } from './manifest-modules-problem.js';

const game = (modules: unknown) => JSON.stringify({ engine: { modules } });

describe('manifestModulesProblem', () => {
  // 2026-11-27: the gate refused both; local typecheck passed.
  it('names the canonical order when a module is appended out of place', () => {
    const problem = manifestModulesProblem(game(['input', 'drawing', 'gfx', 'ui', 'effects', 'audio', 'rng']));
    expect(problem).toContain('out of order');
    expect(problem).toContain('Reorder to:');
  });

  it('passes a manifest the gate accepts, and leaves a missing array alone', () => {
    expect(manifestModulesProblem(game(['input', 'drawing', 'gfx', 'ui', 'effects', 'audio']))).toBeNull();
    expect(manifestModulesProblem('{}')).toBeNull();
  });

  it('refuses a duplicate, an unknown or non-string module, an empty list and invalid JSON', () => {
    expect(manifestModulesProblem(game(['input', 'input']))).toContain('duplicate');
    expect(manifestModulesProblem(game(['input', 'warp']))).toContain('not a GameKit module');
    expect(manifestModulesProblem(game(['input', 7]))).toContain('not a GameKit module');
    expect(manifestModulesProblem('{')).toContain('not valid JSON');
  });
});
