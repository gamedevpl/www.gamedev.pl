import { describe, expect, it } from 'vitest';
import { buildSymbolMap, fileRegions, renderSymbolMap, sliceRegion, spliceRegion } from './symbol-map.js';

const RUNTIME = `import { CELL } from './model.ts';

/** Seconds between steps. */
const STEP = 0.16;

/**
 * Start the game and run its loop.
 */
export function startGame() {
  const speed = STEP;
  return speed;
}

function helper(a: number) {
  return a * 2;
}
`;

describe('symbol map', () => {
  it('tiles a file into regions that cover every line', () => {
    const regions = fileRegions('game/runtime.ts', RUNTIME);
    expect(regions.map((region) => region.name)).toEqual(['<imports>', 'STEP', 'startGame', 'helper']);
    // Contiguous and complete: each region starts where the previous ended.
    for (const [index, region] of regions.entries()) {
      if (index === 0) expect(region.startLine).toBe(1);
      else expect(region.startLine).toBe(regions[index - 1].endLine + 1);
    }
    expect(regions.at(-1)!.endLine).toBe(RUNTIME.split('\n').length);
  });

  it('carries the doc comment and signature into the map', () => {
    const regions = fileRegions('game/runtime.ts', RUNTIME);
    const start = regions.find((region) => region.name === 'startGame')!;
    expect(start.doc).toBe('Start the game and run its loop.');
    expect(start.signature).toBe('export function startGame() {');
    expect(renderSymbolMap([start])).toContain('game/runtime.ts:startGame');
  });

  it('slices a region and splices a replacement back exactly', () => {
    const regions = fileRegions('game/runtime.ts', RUNTIME);
    const helper = regions.find((region) => region.name === 'helper')!;
    expect(sliceRegion(RUNTIME, helper)).toContain('return a * 2;');

    const spliced = spliceRegion(RUNTIME, helper, 'function helper(a: number) {\n  return a * 3;\n}\n');
    expect(spliced.ok).toBe(true);
    if (spliced.ok) {
      expect(spliced.source).toContain('return a * 3;');
      expect(spliced.source).not.toContain('return a * 2;');
      // Everything before the region is untouched.
      expect(spliced.source).toContain('export function startGame() {');
    }
  });

  it('refuses a replacement that is a rewrite rather than an edit', () => {
    const regions = fileRegions('game/runtime.ts', RUNTIME);
    const result = spliceRegion(RUNTIME, regions[0], 'x\n'.repeat(500));
    expect(result.ok).toBe(false);
  });

  it('skips the generated editor-content module — an edit there is overwritten', () => {
    const map = buildSymbolMap({
      'game.ts': 'export function main() {}\n',
      'game/editor-content.ts': 'export const DEFAULT_CONTENT = {};\n',
    });
    expect(map.some((region) => region.file === 'game/editor-content.ts')).toBe(false);
    expect(map.some((region) => region.file === 'game.ts')).toBe(true);
  });

  it('handles a file with no top-level declarations', () => {
    const regions = fileRegions('game.ts', "import './game/runtime.ts';\n");
    expect(regions).toHaveLength(1);
    expect(regions[0].name).toBe('<file>');
  });
});
