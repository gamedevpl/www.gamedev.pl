import { describe, expect, it } from 'vitest';
import { draftShapeProblems } from './editor-draft-shape.js';
import type { EditorDefinition } from './editor-contract.js';

const L = (en: string, pl: string) => ({ en, pl });
const grid = { minCols: 4, maxCols: 8, minRows: 2, maxRows: 4 };

const tilemapDefinition = {
  version: 2,
  content: {
    boards: {
      widget: 'collection',
      label: L('Boards', 'Plansze'),
      itemLabel: L('Board', 'Plansza'),
      min: 1,
      max: 2,
      item: {
        widget: 'tilemap',
        grid,
        tiles: [
          { key: 'floor', char: '.', label: L('Floor', 'Podłoga') },
          { key: 'goal', char: 'G', label: L('Goal', 'Cel') },
        ],
        properties: { name: { type: 'text', max: 24 } },
        constraints: [{ tile: 'goal', exactly: 1 }],
      },
      defaults: [],
    },
  },
} as unknown as EditorDefinition;

const board = (rows: string[]) => ({ properties: { name: 'One' }, rows });

describe('what a draft may still be while it is being painted', () => {
  it('allows the counts a creator passes through on the way to one goal', () => {
    expect(draftShapeProblems(tilemapDefinition, { boards: [board(['.GG.', '.G.G'])] })).toEqual([]);
    expect(draftShapeProblems(tilemapDefinition, { boards: [board(['....', '....'])] })).toEqual([]);
  });

  it('allows a board smaller than the declared minimum, and a collection below its min', () => {
    expect(draftShapeProblems(tilemapDefinition, { boards: [board(['.'])] })).toEqual([]);
    expect(draftShapeProblems(tilemapDefinition, { boards: [] })).toEqual([]);
  });

  it('allows a property the definition gained after the draft was written', () => {
    expect(draftShapeProblems(tilemapDefinition, { boards: [{ properties: {}, rows: ['....'] }] })).toEqual([]);
  });
});

describe('what a draft may never be, however unfinished', () => {
  it('refuses a hole where an item belongs', () => {
    expect(draftShapeProblems(tilemapDefinition, { boards: [null] })).toHaveLength(1);
  });

  it('refuses an item with no rows, which the shell cannot recognise as a board', () => {
    const problems = draftShapeProblems(tilemapDefinition, { boards: [{ properties: {} }] });
    expect(problems.some((problem) => problem.includes('rows is missing'))).toBe(true);
  });

  it('refuses more items than declared, and rows past the declared grid', () => {
    expect(
      draftShapeProblems(tilemapDefinition, { boards: [board(['..']), board(['..']), board(['..'])] }),
    ).toHaveLength(1);
    const wide = draftShapeProblems(tilemapDefinition, { boards: [board(['.'.repeat(40)])] });
    expect(wide.some((problem) => problem.includes('wide'))).toBe(true);
  });

  it('refuses a property of the wrong declared type, and text past its bound', () => {
    const typed = draftShapeProblems(tilemapDefinition, { boards: [{ properties: { name: 7 }, rows: ['....'] }] });
    expect(typed.some((problem) => problem.includes('must be a string'))).toBe(true);
    const long = draftShapeProblems(tilemapDefinition, {
      boards: [{ properties: { name: 'x'.repeat(99) }, rows: ['....'] }],
    });
    expect(long.some((problem) => problem.includes('characters'))).toBe(true);
  });

  it('refuses a section the definition never declared', () => {
    expect(draftShapeProblems(tilemapDefinition, { params: { speed: 2 } })).toHaveLength(1);
    expect(draftShapeProblems(tilemapDefinition, { layers: {} })).toHaveLength(1);
  });
});

const layeredDefinition = {
  version: 2,
  content: {},
  layers: {
    terrain: {
      widget: 'tilemap',
      label: L('Terrain', 'Teren'),
      grid,
      tiles: [
        { key: 'floor', char: '.', label: L('Floor', 'Podłoga') },
        { key: 'wall', char: '#', label: L('Wall', 'Ściana') },
      ],
      properties: {},
      constraints: [],
    },
  },
} as unknown as EditorDefinition;

describe('a declared layer is part of the document, not an optional extra', () => {
  it('accepts a layer mid-edit, however small', () => {
    expect(draftShapeProblems(layeredDefinition, { layers: { terrain: { properties: {}, rows: ['.'] } } })).toEqual([]);
  });

  it('refuses a declared layer that is not there at all', () => {
    const problems = draftShapeProblems(layeredDefinition, { layers: {} });
    expect(problems.some((problem) => problem.includes('terrain is missing'))).toBe(true);
  });

  it('refuses a layer with no rows to paint on', () => {
    const problems = draftShapeProblems(layeredDefinition, { layers: { terrain: { properties: {} } } });
    expect(problems.some((problem) => problem.includes('rows is missing'))).toBe(true);
  });
});

const pathDefinition = {
  version: 2,
  content: {
    tracks: {
      widget: 'collection',
      label: L('Tracks', 'Trasy'),
      itemLabel: L('Track', 'Trasa'),
      min: 1,
      max: 2,
      item: { widget: 'path', gridCols: 8, gridRows: 8, minPoints: 3, maxPoints: 8, closed: true, properties: {} },
      defaults: [],
    },
  },
} as unknown as EditorDefinition;

describe('a path point is a coordinate pair or it is nothing', () => {
  it('accepts fewer points than the declared minimum', () => {
    expect(draftShapeProblems(pathDefinition, { tracks: [{ properties: {}, points: [{ x: 1, y: 2 }] }] })).toEqual([]);
  });

  it('refuses a point with no coordinates, or coordinates that are not numbers', () => {
    const empty = draftShapeProblems(pathDefinition, { tracks: [{ properties: {}, points: [{}] }] });
    expect(empty).toHaveLength(2);
    const wrong = draftShapeProblems(pathDefinition, { tracks: [{ properties: {}, points: [{ x: 'oops', y: 1 }] }] });
    expect(wrong.some((problem) => problem.includes('x must be a whole number'))).toBe(true);
  });
});
