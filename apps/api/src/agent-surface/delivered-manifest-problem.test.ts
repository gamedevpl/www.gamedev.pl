import { describe, expect, it } from 'vitest';
import { deliveredManifestProblem } from './delivered-manifest-problem.js';

const game = (modules: string[], extra: Record<string, unknown> = {}) => [
  { path: 'game.ts', content: 'export {};' },
  {
    path: 'GAME.json',
    content: JSON.stringify({ engine: { modules }, audio: { sounds: ['click'], music: 'calm-loop' }, ...extra }),
  },
];

describe('deliveredManifestProblem', () => {
  // 2026-11-27: the gate refused both; local typecheck passed.
  it('names the canonical order when a module is appended out of place', () => {
    const problem = deliveredManifestProblem(game(['input', 'drawing', 'gfx', 'ui', 'effects', 'audio', 'rng']));
    expect(problem).toContain('out of order');
    expect(problem).toContain('Reorder to:');
  });

  it('passes a manifest the gate accepts, and a delivery without GAME.json', () => {
    expect(deliveredManifestProblem(game(['input', 'drawing', 'gfx', 'ui', 'effects', 'audio']))).toBeNull();
    expect(deliveredManifestProblem([{ path: 'game.ts', content: 'export {};' }])).toBeNull();
  });

  it('refuses a duplicate module and invalid JSON', () => {
    expect(deliveredManifestProblem(game(['input', 'input']))).toContain('duplicate');
    expect(deliveredManifestProblem([{ path: 'GAME.json', content: '{' }])).toContain('not valid JSON');
  });
});
