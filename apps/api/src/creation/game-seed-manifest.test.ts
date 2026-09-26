import { describe, expect, it } from 'vitest';
import { seedManifestError } from './game-seed.js';

describe('seedManifestError', () => {
  it('gives the seed repair model the canonical module order', () => {
    expect(
      seedManifestError([
        { path: 'GAME.json', content: JSON.stringify({ engine: { modules: ['effects', 'input', 'gfx', 'audio'] } }) },
      ]),
    ).toContain('["input","gfx","effects","audio"]');
  });

  it('accepts an ordered manifest', () => {
    expect(
      seedManifestError([
        { path: 'GAME.json', content: JSON.stringify({ engine: { modules: ['input', 'gfx', 'effects', 'audio'] } }) },
      ]),
    ).toBeNull();
  });
});
