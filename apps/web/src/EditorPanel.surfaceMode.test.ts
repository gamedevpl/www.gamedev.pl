import { describe, expect, it } from 'vitest';
import { editorSurfaceModeForDefinition } from './editorSurfaceMode.js';
import type { EditorDefinition } from './studioApi.js';

const label = { en: 'Terrain', pl: 'Teren' };
const layered: EditorDefinition = {
  version: 2,
  content: {},
  layers: {
    terrain: {
      widget: 'tilemap',
      label,
      grid: { minCols: 1, maxCols: 4, minRows: 1, maxRows: 4 },
      tiles: [],
      properties: {},
      constraints: [],
    },
  },
};

describe('EditorPanel surface mode', () => {
  it('docks declaration-only tuning beside the running game', () => {
    expect(
      editorSurfaceModeForDefinition({
        version: 1,
        content: {},
        params: {
          speed: { type: 'number', min: 0.5, max: 2, default: 1, label: { en: 'Speed', pl: 'Tempo' } },
        },
      }),
    ).toBe('docked');
  });

  it('uses the full surface for a declaration-rendered board', () => {
    expect(editorSurfaceModeForDefinition(layered)).toBe('full');
  });

  it('keeps an active controller docked beside the running game', () => {
    expect(editorSurfaceModeForDefinition({ ...layered, controller: true }, true)).toBe('docked');
  });

  it('restores a controller board fallback to the full surface', () => {
    expect(editorSurfaceModeForDefinition({ ...layered, controller: true }, false)).toBe('full');
  });
});
