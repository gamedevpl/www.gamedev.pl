import { describe, expect, it } from 'vitest';
import { fillDeclaredValues } from './editorContentDefaults.js';
import { mergeDraft } from './surfaces/studio/editorPanelHelpers.js';
import type { EditorDefinition, EditorItemContent, GameEditorState } from './studioApi.js';

const label = { en: 'Boards', pl: 'Plansze' };

function collectionOf(item: EditorDefinition['content'][string]['item']): EditorDefinition {
  return {
    version: 1,
    content: { boards: { widget: 'collection', label, itemLabel: label, min: 0, max: 9, item, defaults: [] } },
  };
}

const entitiesDefinition = collectionOf({
  widget: 'entities',
  properties: { speed: { type: 'int', min: 3, max: 9 }, name: { type: 'text', max: 20 } },
  constraints: [],
});

function boards(doc: ReturnType<typeof fillDeclaredValues>): EditorItemContent[] {
  return doc.boards as EditorItemContent[];
}

describe('fillDeclaredValues', () => {
  it('fills a property the game declared after the draft was saved', () => {
    const filled = fillDeclaredValues(entitiesDefinition, { boards: [{ properties: { name: 'first' } }] });
    expect(boards(filled)[0].properties).toEqual({ name: 'first', speed: 3 });
  });

  it('starts each declared type at the value a blank item would use', () => {
    const definition = collectionOf({
      widget: 'entities',
      properties: {
        title: { type: 'text', max: 4 },
        size: { type: 'number', min: 1.5, max: 9 },
        kind: { type: 'enum', values: ['red', 'blue'] },
        locked: { type: 'bool' },
      },
      constraints: [],
    });
    const filled = fillDeclaredValues(definition, { boards: [{ properties: {} }] });
    expect(boards(filled)[0].properties).toEqual({ title: '', size: 1.5, kind: 'red', locked: false });
  });

  it('keeps a falsy value the creator chose rather than resetting it', () => {
    const definition = collectionOf({
      widget: 'entities',
      properties: { title: { type: 'text', max: 4 }, size: { type: 'int', min: 2, max: 9 }, on: { type: 'bool' } },
      constraints: [],
    });
    const filled = fillDeclaredValues(definition, { boards: [{ properties: { title: '', size: 0, on: false } }] });
    expect(boards(filled)[0].properties).toEqual({ title: '', size: 0, on: false });
  });

  it('leaves an undeclared property in place for the server to report', () => {
    const filled = fillDeclaredValues(entitiesDefinition, { boards: [{ properties: { stray: 1, name: 'a' } }] });
    expect(boards(filled)[0].properties).toEqual({ stray: 1, name: 'a', speed: 3 });
  });

  it('leaves a hole where an item should be, so the gap is still visible', () => {
    const filled = fillDeclaredValues(entitiesDefinition, { boards: [null as unknown as EditorItemContent] });
    expect(boards(filled)[0]).toBeNull();
  });

  it('keeps a tilemap item rows untouched while filling its properties', () => {
    const definition = collectionOf({
      widget: 'tilemap',
      grid: { minCols: 1, maxCols: 4, minRows: 1, maxRows: 4 },
      tiles: [{ key: 'floor', char: '.', label }],
      properties: { par: { type: 'int', min: 2, max: 9 } },
      constraints: [],
    });
    const filled = fillDeclaredValues(definition, { boards: [{ properties: {}, rows: ['..'] }] });
    expect(boards(filled)[0]).toEqual({ properties: { par: 2 }, rows: ['..'] });
  });

  it('fills the layers a layered item owns', () => {
    const definition = collectionOf({
      widget: 'layered',
      properties: {},
      constraints: [],
      layers: {
        walls: {
          widget: 'tilemap',
          label,
          grid: { minCols: 1, maxCols: 4, minRows: 1, maxRows: 4 },
          tiles: [{ key: 'floor', char: '.', label }],
          properties: { theme: { type: 'enum', values: ['cave', 'ice'] } },
          constraints: [],
        },
        spawns: {
          widget: 'entities',
          label,
          min: 0,
          max: 4,
          properties: { hp: { type: 'int', min: 5, max: 9 } },
          constraints: [],
        },
      },
    });
    const filled = fillDeclaredValues(definition, {
      boards: [{ properties: {}, layers: { walls: { properties: {}, rows: ['.'] }, spawns: [{ properties: {} }] } }],
    });
    const item = boards(filled)[0] as { layers: Record<string, unknown> };
    expect(item.layers.walls).toEqual({ properties: { theme: 'cave' }, rows: ['.'] });
    expect(item.layers.spawns).toEqual([{ properties: { hp: 5 } }]);
  });

  it('fills the definition-wide layers document', () => {
    const definition: EditorDefinition = {
      version: 1,
      content: {},
      layers: {
        spawns: {
          widget: 'entities',
          label,
          min: 0,
          max: 4,
          properties: { hp: { type: 'int', min: 7, max: 9 } },
          constraints: [],
        },
      },
    };
    const filled = fillDeclaredValues(definition, { layers: { spawns: [{ properties: {} }] } });
    expect(filled.layers).toEqual({ spawns: [{ properties: { hp: 7 } }] });
  });

  it('fills a param the game declared after the draft was saved', () => {
    const definition: EditorDefinition = {
      version: 1,
      content: {},
      params: {
        gravity: { type: 'int', min: 1, max: 9, label, default: 4 },
        drag: { type: 'int', min: 0, max: 9, label, default: 2 },
      },
    };
    const filled = fillDeclaredValues(definition, { params: { gravity: 8 } });
    expect(filled.params).toEqual({ gravity: 8, drag: 2 });
  });
});

describe('mergeDraft', () => {
  it('hands the panel a draft with no hole where a newly declared field goes', () => {
    const loaded: GameEditorState = {
      version: '3',
      definition: entitiesDefinition,
      content: { boards: [{ properties: { name: 'shipped', speed: 5 } }] },
      draft: { content: { boards: [{ properties: { name: 'mine' } }] }, revision: 2, updatedAt: '' },
    };
    expect(boards(mergeDraft(loaded))[0].properties).toEqual({ name: 'mine', speed: 3 });
  });
});
