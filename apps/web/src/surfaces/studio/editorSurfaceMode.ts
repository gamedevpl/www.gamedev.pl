import type { EditorDefinition } from '../../studioApi.js';

export type EditorSurfaceMode = 'docked' | 'full';

// Every collection item that draws a grid the creator paints on.
const BOARD_WIDGETS = new Set(['tilemap', 'path', 'layered']);

export function editorSurfaceModeForDefinition(
  definition: EditorDefinition,
  controllerActive = false,
): EditorSurfaceMode {
  if (definition.controller === true && controllerActive) return 'docked';
  const hasBoard =
    Object.keys(definition.layers ?? {}).length > 0 ||
    Object.values(definition.content).some((collection) => BOARD_WIDGETS.has(collection.item.widget));
  return hasBoard ? 'full' : 'docked';
}
