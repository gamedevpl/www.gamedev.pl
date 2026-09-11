import type { EditorDefinition } from '../../studioApi.js';

export type EditorSurfaceMode = 'docked' | 'full';

export function editorSurfaceModeForDefinition(
  definition: EditorDefinition,
  controllerActive = false,
): EditorSurfaceMode {
  if (definition.controller === true && controllerActive) return 'docked';
  const hasBoard =
    Object.keys(definition.layers ?? {}).length > 0 ||
    Object.values(definition.content).some(
      (collection) => collection.item.widget === 'tilemap' || collection.item.widget === 'path',
    );
  return hasBoard ? 'full' : 'docked';
}
