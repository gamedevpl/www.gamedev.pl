import { describe, expect, it } from 'vitest';
import { itemProblems } from './editorContentTools.js';
import type { EditorCollectionSpec, EditorLabel } from './studioApi.js';

const label = { en: 'Terrain', pl: 'Teren' };
const name = (value: EditorLabel) => value.en;

const layered = {
  widget: 'layered',
  properties: {},
  constraints: [
    {
      reachable: {
        from: { layer: 'terrain', tile: 'start' },
        blockedBy: [{ layer: 'terrain', tile: 'wall' }],
        require: [{ layer: 'terrain', tile: 'goal' }],
      },
    },
  ],
  layers: {
    terrain: {
      widget: 'tilemap',
      label,
      grid: { minCols: 3, maxCols: 8, minRows: 3, maxRows: 8 },
      tiles: [
        { key: 'floor', char: '.', label },
        { key: 'wall', char: '#', label },
        { key: 'start', char: 'S', label },
        { key: 'goal', char: 'G', label },
      ],
      properties: {},
      constraints: [{ tile: 'goal', exactly: 1 }],
    },
  },
} as unknown as EditorCollectionSpec['item'];

describe('a layered item reports the checks its layers fail', () => {
  it('reports a layer that is not a tilemap at all', () => {
    const problems = itemProblems(layered, { properties: {}, layers: {} } as never, name);
    expect(problems.join()).toContain('Layer needs a tilemap document');
  });

  it('reports a tile count its layer breaks, named by the layer', () => {
    const item = { properties: {}, layers: { terrain: { properties: {}, rows: ['S.G', '...', '..G'] } } };
    expect(itemProblems(layered, item as never, name).join()).toContain('Terrain');
  });

  it('reports a goal the creator has walled off', () => {
    const item = { properties: {}, layers: { terrain: { properties: {}, rows: ['S.#', '..#', '##G'] } } };
    expect(itemProblems(layered, item as never, name).join()).toContain('walled off');
  });

  it('stays quiet on a layered item that satisfies every rule', () => {
    const item = { properties: {}, layers: { terrain: { properties: {}, rows: ['S..', '...', '..G'] } } };
    expect(itemProblems(layered, item as never, name)).toEqual([]);
  });
});
