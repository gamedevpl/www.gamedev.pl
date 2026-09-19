import { describe, expect, it } from 'vitest';
import { blankItem, collectionProblems, itemProblems, layerProblems } from './editorContentTools.js';
import type { EditorCollectionSpec, EditorLabel, EditorLayerSpec } from './studioApi.js';

const L = (en: string, pl: string): EditorLabel => ({ en, pl });
const name = (label: EditorLabel) => label.en;
const grid = { minCols: 16, maxCols: 28, minRows: 10, maxRows: 18 };

// The type demands properties and constraints; this spec omits both.
const bareTilemap = {
  widget: 'tilemap',
  label: L('Objects', 'Obiekty'),
  grid,
  tiles: [
    { key: 'none', char: '.', label: L('Empty', 'Puste') },
    { key: 'start', char: 'S', label: L('Start', 'Pole startowe'), color: '#5bd1ff' },
  ],
} as unknown as EditorLayerSpec;

const bareEntities = {
  widget: 'entities',
  label: L('Spawns', 'Punkty'),
  min: 0,
  max: 8,
} as unknown as EditorLayerSpec;

// Fits the declared grid; the missing declarations are what matter.
const rows = Array.from({ length: grid.minRows }, (_, index) =>
  index === 1 ? `.S${'.'.repeat(grid.minCols - 2)}`.slice(0, grid.minCols) : '.'.repeat(grid.minCols),
);

describe('a spec that declares neither properties nor constraints', () => {
  it('reports no problems for a tilemap layer instead of throwing', () => {
    expect(layerProblems(bareTilemap, { properties: {}, rows }, name)).toEqual([]);
  });

  it('reports no problems for an entity layer instead of throwing', () => {
    expect(layerProblems(bareEntities, [{ properties: {} }], name)).toEqual([]);
  });

  it('checks a collection item against it without throwing', () => {
    const spec = bareTilemap as unknown as EditorCollectionSpec['item'];
    expect(itemProblems(spec, { properties: {}, rows }, name)).toEqual([]);
  });

  it('builds a blank item from it, with rows and no properties', () => {
    const spec = bareTilemap as unknown as EditorCollectionSpec['item'];
    const blank = blankItem(spec) as { properties: Record<string, unknown>; rows: string[] };
    expect(blank.properties).toEqual({});
    expect(blank.rows).toHaveLength(grid.minRows);
    expect(blank.rows[0]).toHaveLength(grid.minCols);
  });

  it('checks an entities collection against it without throwing', () => {
    const collection = {
      widget: 'collection',
      label: L('Spawns', 'Punkty'),
      itemLabel: L('Spawn', 'Punkt'),
      min: 0,
      max: 8,
      item: { widget: 'entities', label: L('Spawn', 'Punkt') },
      defaults: [],
    } as unknown as EditorCollectionSpec;
    expect(collectionProblems(collection, [{ properties: {} }])).toEqual([]);
  });
});
