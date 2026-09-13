import { describe, expect, it } from 'vitest';
import {
  createHudRegionsReader,
  hudCoverage,
  MAX_HUD_REGIONS,
  parseHudRegions,
  PURE_UI_COVERAGE,
} from './hud-regions.js';

describe('parseHudRegions', () => {
  it('returns null when nothing was declared', () => {
    expect(parseHudRegions(undefined, 900, 900)).toBeNull();
    expect(parseHudRegions({ x: 1 }, 900, 900)).toBeNull();
  });

  it('keeps an explicitly empty declaration', () => {
    expect(parseHudRegions([], 900, 900)).toEqual([]);
  });

  it('clamps to the frame, rounds, and trims labels', () => {
    const regions = parseHudRegions(
      [
        { x: -10, y: 5.4, w: 120, h: 30, label: '  score  ' },
        { x: 850, y: 850, w: 200, h: 200 },
        { x: 10, y: 10, w: 0, h: 30 },
        { x: 'nope', y: 0, w: 1, h: 1 },
        null,
      ],
      900,
      900,
    );
    expect(regions).toEqual([
      { x: 0, y: 5, w: 110, h: 30, label: 'score' },
      { x: 850, y: 850, w: 50, h: 50 },
    ]);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ x: index, y: 0, w: 5, h: 5 }));
    expect(parseHudRegions(many, 900, 900)).toHaveLength(MAX_HUD_REGIONS);
  });
});

describe('hudCoverage', () => {
  it('is the share of the frame under HUD rectangles', () => {
    expect(hudCoverage([{ x: 0, y: 0, w: 450, h: 900 }], 900, 900)).toBeCloseTo(0.5);
    expect(hudCoverage([], 900, 900)).toBe(0);
    expect(
      hudCoverage(
        [
          { x: 0, y: 0, w: 900, h: 900 },
          { x: 0, y: 0, w: 900, h: 900 },
        ],
        900,
        900,
      ),
    ).toBe(1);
  });

  it('counts overlapped pixels once, so a panel and its labels are one area', () => {
    // Each covers 40%; summed they would read 80% and refuse.
    const panel = { x: 0, y: 0, w: 360, h: 900 };
    const labelsInside = { x: 0, y: 0, w: 360, h: 900 };

    expect(hudCoverage([panel, labelsInside], 900, 900)).toBeCloseTo(0.4);
    expect(hudCoverage([panel, labelsInside], 900, 900)).toBeLessThan(PURE_UI_COVERAGE);
  });

  it('adds the parts of an overlapping rectangle that stick out', () => {
    const left = { x: 0, y: 0, w: 450, h: 900 };
    const straddling = { x: 300, y: 0, w: 300, h: 900 };

    // Union is x in [0, 600) of a 900-wide frame.
    expect(hudCoverage([left, straddling], 900, 900)).toBeCloseTo(600 / 900);
  });
});

describe('createHudRegionsReader', () => {
  it('reads the hud list from the delivered CAPTURE.json', async () => {
    const seen: string[] = [];
    const read = createHudRegionsReader({
      getSourceFile: async (_slug, _version, name) => {
        seen.push(name);
        return JSON.stringify({ seed: 1, hud: [{ x: 1, y: 2, w: 3, h: 4, label: 'lives' }] });
      },
    });
    expect(await read({ slug: 'g', version: 'v1', width: 900, height: 900 })).toEqual([
      { x: 1, y: 2, w: 3, h: 4, label: 'lives' },
    ]);
    expect(seen).toEqual(['CAPTURE.json']);
  });

  it('is null for a missing or unparsable file', async () => {
    const missing = createHudRegionsReader({ getSourceFile: async () => null });
    expect(await missing({ slug: 'g', version: 'v1', width: 900, height: 900 })).toBeNull();
    const broken = createHudRegionsReader({ getSourceFile: async () => '{oops' });
    expect(await broken({ slug: 'g', version: 'v1', width: 900, height: 900 })).toBeNull();
    const undeclared = createHudRegionsReader({ getSourceFile: async () => '{"seed": 3}' });
    expect(await undeclared({ slug: 'g', version: 'v1', width: 900, height: 900 })).toBeNull();
  });
});
