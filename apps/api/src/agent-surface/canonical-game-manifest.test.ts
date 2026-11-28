import { describe, expect, it } from 'vitest';
import { GAME_KIT_MODULES } from '../platform/games-repo-contract.js';
import { canonicalGameManifest } from './canonical-game-manifest.js';

const [first, second] = GAME_KIT_MODULES;

describe('canonicalGameManifest', () => {
  // 2026-11-27: two builds appended `rng`; the gate refused both.
  it('reorders engine.modules into the kit order and keeps the rest', () => {
    const content = JSON.stringify({ title: 'x', engine: { modules: [second, first], extra: 1 } });
    const fixed = JSON.parse(canonicalGameManifest({ path: 'GAME.json', content }).content);
    expect(fixed).toEqual({ title: 'x', engine: { modules: [first, second], extra: 1 } });
  });

  it('leaves ordered, duplicated, unknown or unparsable manifests and other files alone', () => {
    const cases = [
      { path: 'GAME.json', content: JSON.stringify({ engine: { modules: [first, second] } }) },
      { path: 'GAME.json', content: JSON.stringify({ engine: { modules: [second, first, second] } }) },
      { path: 'GAME.json', content: JSON.stringify({ engine: { modules: [second, 'nope'] } }) },
      { path: 'GAME.json', content: '{ not json' },
      { path: 'game.ts', content: 'export {}' },
    ];
    for (const file of cases) expect(canonicalGameManifest(file)).toBe(file);
  });
});
