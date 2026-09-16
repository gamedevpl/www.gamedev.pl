import { describe, expect, it } from 'vitest';
import { collectionProblems, documentProblems, itemProblems } from './editorContentTools.js';
import type { EditorCollectionSpec, EditorDefinition, EditorLabel } from './studioApi.js';

const label = { en: 'Board', pl: 'Plansza' };
const name = (value: EditorLabel) => value.en;

const tilemap = {
  widget: 'tilemap',
  grid: { minCols: 3, maxCols: 5, minRows: 2, maxRows: 4 },
  tiles: [
    { key: 'floor', char: '.', label },
    { key: 'wall', char: '#', label },
  ],
  properties: { title: { type: 'text', max: 10 } },
  constraints: [],
} as unknown as EditorCollectionSpec['item'];

const board = (rows: string[], title = 'ok') => ({ properties: { title }, rows }) as never;

const collection = (min: number, max: number) =>
  ({ widget: 'collection', label, itemLabel: label, min, max, item: tilemap, defaults: [] }) as EditorCollectionSpec;

describe('the gate sees the grid the server will check', () => {
  it('reports a board with too few rows', () => {
    expect(itemProblems(tilemap, board(['...']), name).join()).toContain('has 1 rows (allowed 2-4)');
  });

  it('reports a board with too many rows', () => {
    expect(itemProblems(tilemap, board(['...', '...', '...', '...', '...']), name).join()).toContain('5 rows');
  });

  it('reports rows narrower than the declared minimum', () => {
    expect(itemProblems(tilemap, board(['..', '..']), name).join()).toContain('rows are 2 wide (allowed 3-5)');
  });

  it('reports a ragged board, which the server refuses as non-rectangular', () => {
    expect(itemProblems(tilemap, board(['...', '....']), name).join()).toContain('row 2 is 4 wide, expected 3');
  });

  it('reports a character no declared tile uses', () => {
    expect(itemProblems(tilemap, board(['..Z', '...']), name).join()).toContain('undeclared tile character "Z"');
  });

  it('reports a property value the server would refuse', () => {
    expect(itemProblems(tilemap, board(['...', '.#.'], 'this title is too long'), name).join()).toContain(
      'at most 10 characters',
    );
  });

  it('stays quiet on a board that fits its grid', () => {
    expect(itemProblems(tilemap, board(['...', '.#.']), name)).toEqual([]);
  });
});

describe('the gate sees how many items a collection may hold', () => {
  it('reports a collection below its declared minimum', () => {
    expect(collectionProblems(collection(2, 4), []).join()).toContain('has 0 items (allowed 2-4)');
  });

  it('reports a collection above its declared maximum', () => {
    const items = [board(['...', '...']), board(['...', '...']), board(['...', '...'])];
    expect(collectionProblems(collection(1, 2), items).join()).toContain('has 3 items (allowed 1-2)');
  });

  it('stays quiet on a collection within its bounds', () => {
    expect(collectionProblems(collection(0, 4), [board(['...', '...'])])).toEqual([]);
  });
});

describe('the publish document gate checks params', () => {
  const definition: EditorDefinition = {
    version: 1,
    content: {},
    params: { width: { type: 'int', min: 80, max: 200, label, default: 140 } },
  };

  it('reports a param outside its declared bounds', () => {
    expect(documentProblems(definition, { params: { width: 12 } }).join()).toContain('must be an integer 80-200');
  });

  it('stays quiet when every param fits', () => {
    expect(documentProblems(definition, { params: { width: 140 } })).toEqual([]);
  });
});
