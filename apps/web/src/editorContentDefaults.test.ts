import { describe, expect, it } from 'vitest';
import { differsFromStored, fillDeclaredValues } from './editorContentDefaults.js';
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

  it('drops a property the definition no longer declares', () => {
    const filled = fillDeclaredValues(entitiesDefinition, { boards: [{ properties: { stray: 1, name: 'a' } }] });
    expect(boards(filled)[0].properties).toEqual({ name: 'a', speed: 3 });
  });

  it('drops a key the widget does not own', () => {
    const filled = fillDeclaredValues(entitiesDefinition, { boards: [{ properties: { name: 'a' }, rows: ['..'] }] });
    expect(boards(filled)[0]).toEqual({ properties: { name: 'a', speed: 3 } });
  });

  it('drops a section the definition no longer declares', () => {
    const filled = fillDeclaredValues(entitiesDefinition, { boards: [], retired: [{ properties: {} }] });
    expect(filled.retired).toBeUndefined();
  });

  it('drops a param the definition no longer declares', () => {
    const definition: EditorDefinition = {
      version: 1,
      content: {},
      params: { gravity: { type: 'int', min: 1, max: 9, label, default: 4 } },
    };
    expect(fillDeclaredValues(definition, { params: { gravity: 8, retired: 2 } }).params).toEqual({ gravity: 8 });
  });

  it('reports a draft carrying a retired value as unsaved, so the repair is written', () => {
    const stored = { boards: [{ properties: { name: 'a', speed: 3, stray: 1 } }] };
    const loaded: GameEditorState = {
      version: '7',
      definition: entitiesDefinition,
      content: { boards: [] },
      draft: { content: stored, revision: 8, updatedAt: '' },
    };
    expect(mergeDraft(loaded).unsaved).toBe(true);
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

function loadedWith(draftContent: GameEditorState['draft']): GameEditorState {
  return {
    version: '3',
    definition: entitiesDefinition,
    content: { boards: [{ properties: { name: 'shipped', speed: 5 } }] },
    draft: draftContent,
  };
}

describe('mergeDraft', () => {
  it('hands the panel a draft with no hole where a newly declared field goes', () => {
    const loaded = loadedWith({ content: { boards: [{ properties: { name: 'mine' } }] }, revision: 2, updatedAt: '' });
    expect(boards(mergeDraft(loaded).content)[0].properties).toEqual({ name: 'mine', speed: 3 });
  });

  it('reports the repaired draft as unsaved, so Publish flushes it first', () => {
    const loaded = loadedWith({ content: { boards: [{ properties: { name: 'mine' } }] }, revision: 2, updatedAt: '' });
    expect(mergeDraft(loaded).unsaved).toBe(true);
  });

  it('leaves a draft the definition still fits alone', () => {
    const stored = { boards: [{ properties: { name: 'mine', speed: 4 } }] };
    expect(mergeDraft(loadedWith({ content: stored, revision: 2, updatedAt: '' })).unsaved).toBe(false);
  });

  it('never calls a game with no draft unsaved', () => {
    expect(mergeDraft(loadedWith(null)).unsaved).toBe(false);
  });
});

describe('a root layer the delivery added after the draft was saved', () => {
  const layered: EditorDefinition = {
    version: 1,
    content: {},
    layers: {
      terrain: {
        widget: 'tilemap',
        label,
        grid: { minCols: 1, maxCols: 4, minRows: 1, maxRows: 4 },
        tiles: [{ key: 'floor', char: '.', label }],
        properties: {},
        constraints: [],
      },
      fog: {
        widget: 'tilemap',
        label,
        grid: { minCols: 1, maxCols: 4, minRows: 1, maxRows: 4 },
        tiles: [{ key: 'clear', char: ' ', label }],
        properties: {},
        constraints: [],
      },
    },
  };

  it('survives the draft replacing the layers section, and is reported unsaved', () => {
    const loaded: GameEditorState = {
      version: '5',
      definition: layered,
      content: { layers: { terrain: { properties: {}, rows: ['.'] }, fog: { properties: {}, rows: [' '] } } },
      draft: {
        content: { layers: { terrain: { properties: {}, rows: ['..'] } } },
        revision: 6,
        updatedAt: '',
      },
    };
    const merged = mergeDraft(loaded);
    expect(merged.content.layers).toEqual({
      terrain: { properties: {}, rows: ['..'] },
      fog: { properties: {}, rows: [' '] },
    });
    expect(merged.unsaved).toBe(true);
  });
});

describe('a layer added inside a layered collection item', () => {
  const tile = (key: string, char: string) => ({ key, char, label });
  const layerSpec = (key: string, char: string) => ({
    widget: 'tilemap' as const,
    label,
    grid: { minCols: 2, maxCols: 4, minRows: 1, maxRows: 4 },
    tiles: [tile(key, char)],
    properties: {},
    constraints: [],
  });
  const perItem: EditorDefinition = {
    version: 1,
    content: {
      levels: {
        widget: 'collection',
        label,
        itemLabel: label,
        min: 0,
        max: 4,
        defaults: [],
        item: {
          widget: 'layered',
          properties: {},
          constraints: [],
          layers: { terrain: layerSpec('floor', '.'), fog: layerSpec('clear', ' ') },
        },
      },
    },
  };

  it('is materialised as the smallest legal board, not dropped', () => {
    const filled = fillDeclaredValues(perItem, {
      levels: [{ properties: {}, layers: { terrain: { properties: {}, rows: ['..'] } } }],
    });
    const item = (filled.levels as EditorItemContent[])[0] as { layers: Record<string, unknown> };
    expect(item.layers.terrain).toEqual({ properties: {}, rows: ['..'] });
    expect(item.layers.fog).toEqual({ properties: {}, rows: ['  '] });
  });

  it('makes the draft unsaved, so the new layer reaches the server', () => {
    const loaded: GameEditorState = {
      version: '6',
      definition: perItem,
      content: { levels: [] },
      draft: {
        content: { levels: [{ properties: {}, layers: { terrain: { properties: {}, rows: ['..'] } } }] },
        revision: 7,
        updatedAt: '',
      },
    };
    expect(mergeDraft(loaded).unsaved).toBe(true);
  });
});

describe('a collection whose widget the delivery changed', () => {
  const asTilemap: EditorDefinition = collectionOf({
    widget: 'tilemap',
    grid: { minCols: 3, maxCols: 6, minRows: 2, maxRows: 6 },
    tiles: [{ key: 'floor', char: '.', label }],
    properties: {},
    constraints: [],
  } as unknown as EditorDefinition['content'][string]['item']);

  const asPath: EditorDefinition = collectionOf({
    widget: 'path',
    gridCols: 4,
    gridRows: 4,
    minPoints: 2,
    maxPoints: 8,
    closed: false,
    properties: {},
  } as unknown as EditorDefinition['content'][string]['item']);

  it('gives an old entities item the board its new widget needs', () => {
    const filled = fillDeclaredValues(asTilemap, { boards: [{ properties: {} }] });
    expect(boards(filled)[0]).toEqual({ properties: {}, rows: ['...', '...'] });
  });

  it('gives an old entities item the points its new widget needs', () => {
    const filled = fillDeclaredValues(asPath, { boards: [{ properties: {} }] });
    const item = boards(filled)[0] as { points: unknown[] };
    expect(item.points).toHaveLength(2);
  });

  it('reports the rebuilt item as unsaved, so the painter has something stored', () => {
    const loaded: GameEditorState = {
      version: '9',
      definition: asTilemap,
      content: { boards: [] },
      draft: { content: { boards: [{ properties: {} }] }, revision: 10, updatedAt: '' },
    };
    expect(mergeDraft(loaded).unsaved).toBe(true);
  });

  it('leaves a board that already fits alone', () => {
    const filled = fillDeclaredValues(asTilemap, { boards: [{ properties: {}, rows: ['....', '....'] }] });
    expect(boards(filled)[0]).toEqual({ properties: {}, rows: ['....', '....'] });
  });
});

describe('differsFromStored', () => {
  it('is false for the same document', () => {
    const stored = { boards: [{ properties: { name: 'a', speed: 6 } }] };
    expect(differsFromStored(stored, { boards: [{ properties: { name: 'a', speed: 6 } }] })).toBe(false);
  });

  it('does not call a reordered document a change', () => {
    const stored = { boards: [{ properties: { name: 'a', speed: 6 } }], params: { g: 1 } };
    const shown = { params: { g: 1 }, boards: [{ properties: { speed: 6, name: 'a' } }] };
    expect(differsFromStored(stored, shown)).toBe(false);
  });

  it('still calls a reordered array a change, because item order is content', () => {
    const stored = { boards: [{ properties: { name: 'a' } }, { properties: { name: 'b' } }] };
    const shown = { boards: [{ properties: { name: 'b' } }, { properties: { name: 'a' } }] };
    expect(differsFromStored(stored, shown)).toBe(true);
  });

  it('is true when the shown document gained a field', () => {
    expect(differsFromStored({ boards: [{ properties: {} }] }, { boards: [{ properties: { speed: 3 } }] })).toBe(true);
  });
});

describe('a collection the delivery added after the draft was saved', () => {
  const twoCollections: EditorDefinition = {
    version: 1,
    content: {
      boards: entitiesDefinition.content.boards,
      levels: { ...entitiesDefinition.content.boards, defaults: [{ properties: { name: 'one', speed: 4 } }] },
    },
  };

  it('is shown from the delivered content and reported unsaved', () => {
    const loaded: GameEditorState = {
      version: '4',
      definition: twoCollections,
      content: { boards: [], levels: [{ properties: { name: 'one', speed: 4 } }] },
      draft: { content: { boards: [{ properties: { name: 'mine', speed: 2 } }] }, revision: 3, updatedAt: '' },
    };
    const merged = mergeDraft(loaded);
    expect(merged.content.levels).toEqual([{ properties: { name: 'one', speed: 4 } }]);
    expect(merged.unsaved).toBe(true);
  });
});
