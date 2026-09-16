import { describe, expect, it } from 'vitest';
import { collectionProblems, isPathItem, isTilemapItem, itemProblems, layerProblems } from './editorContentTools.js';
import type { EditorCollectionSpec, EditorLabel, EditorLayerSpec } from './studioApi.js';

const label = { en: 'Board', pl: 'Plansza' };
const name = (value: EditorLabel) => value.en;
const grid = { minCols: 1, maxCols: 4, minRows: 1, maxRows: 4 };

const tilemap = {
  widget: 'tilemap',
  grid,
  tiles: [{ key: 'floor', char: '.', label }],
  properties: {},
  constraints: [],
} as unknown as EditorCollectionSpec['item'];

const path = {
  widget: 'path',
  gridCols: 8,
  gridRows: 8,
  minPoints: 1,
  maxPoints: 8,
  closed: false,
  properties: {},
} as unknown as EditorCollectionSpec['item'];

const entities = {
  widget: 'collection',
  label,
  itemLabel: label,
  min: 0,
  max: 4,
  defaults: [],
  item: { widget: 'entities', properties: {}, constraints: [{ uniqueBy: 'slot' }] },
} as unknown as EditorCollectionSpec;

describe('a guard that lied about the shape let a malformed document reach the painter', () => {
  it('does not accept a rows that is not an array of strings', () => {
    expect(isTilemapItem({ properties: {}, rows: null })).toBe(false);
    expect(isTilemapItem({ properties: {}, rows: [1, 2] })).toBe(false);
    expect(isTilemapItem({ properties: {}, rows: ['..'] })).toBe(true);
  });

  it('does not accept a points that is not an array', () => {
    expect(isPathItem({ properties: {}, points: null })).toBe(false);
    expect(isPathItem({ properties: {}, points: [] })).toBe(true);
  });
});

describe('malformed content is reported, not thrown on', () => {
  it('reports a board whose rows are not there', () => {
    expect(() => itemProblems(tilemap, { properties: {}, rows: null } as never, name)).not.toThrow();
    expect(itemProblems(tilemap, { properties: {}, rows: null } as never, name)).toEqual(['Needs a board of rows']);
  });

  it('reports a path whose points are not there', () => {
    expect(itemProblems(path, { properties: {}, points: null } as never, name)).toEqual(['Needs a list of points']);
  });

  it('reports a nested layer whose rows are not there, rather than throwing', () => {
    const layered = {
      widget: 'layered',
      properties: {},
      constraints: [],
      layers: {
        terrain: {
          widget: 'tilemap',
          label,
          grid,
          tiles: [{ key: 'f', char: '.', label }],
          properties: {},
          constraints: [],
        },
      },
    } as unknown as EditorCollectionSpec['item'];
    const item = { properties: {}, layers: { terrain: { properties: {}, rows: null } } };
    expect(() => itemProblems(layered, item as never, name)).not.toThrow();
    expect(itemProblems(layered, item as never, name).join()).toContain('needs a tilemap document');
  });

  it('skips a collection entity with no properties object instead of throwing', () => {
    const items = [{ properties: null }, { properties: { slot: 1 } }] as never;
    expect(() => collectionProblems(entities, items)).not.toThrow();
    expect(collectionProblems(entities, items)).toEqual([]);
  });

  it('reports an entity layer holding a malformed entity', () => {
    const spec = {
      widget: 'entities',
      label,
      min: 0,
      max: 4,
      properties: {},
      constraints: [],
    } as unknown as EditorLayerSpec;
    expect(layerProblems(spec, [{ properties: null }], name)).toEqual(['Layer needs an entity list']);
  });
});

describe('a guard that ignored properties let the item list crash', () => {
  it('rejects a board with no properties object', () => {
    expect(isTilemapItem({ properties: null, rows: ['..'] })).toBe(false);
  });

  it('rejects a path with no properties object', () => {
    expect(isPathItem({ properties: null, points: [] })).toBe(false);
  });

  it('rejects a path whose points are not objects', () => {
    expect(isPathItem({ properties: {}, points: [null] })).toBe(false);
    expect(isPathItem({ properties: {}, points: [{ x: 1, y: 2 }] })).toBe(true);
  });

  it('does not throw on a path holding a null point', () => {
    expect(() => itemProblems(path, { properties: {}, points: [null] } as never, name)).not.toThrow();
    expect(itemProblems(path, { properties: {}, points: [null] } as never, name)).toEqual(['Needs a list of points']);
  });

  it('reports an entity item that is not a property sheet', () => {
    const spec = { widget: 'entities', properties: {}, constraints: [] } as unknown as EditorCollectionSpec['item'];
    expect(itemProblems(spec, null as never, name)).toEqual(['Needs a property sheet']);
    expect(itemProblems(spec, { properties: null } as never, name)).toEqual(['Needs a property sheet']);
    expect(itemProblems(spec, { properties: {} } as never, name)).toEqual([]);
  });
});
