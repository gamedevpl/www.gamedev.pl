import {
  validateEditorContent,
  type CollectionItemSpec,
  type EditorDefinition,
  type EditorLayerSpec,
} from './editor-contract.js';

// Painting passes through every rule that describes a finished level.
const OPEN_GRID = { minCols: 1, minRows: 1 };

// Same validator, with the finished-level rules switched off.
export function draftShapeProblems(definition: EditorDefinition, content: unknown): string[] {
  return validateEditorContent(draftRules(definition), content);
}

function draftRules(definition: EditorDefinition): EditorDefinition {
  const content: EditorDefinition['content'] = {};
  for (const [key, spec] of Object.entries(definition.content)) {
    content[key] = { ...spec, min: 0, item: draftItemRules(spec.item) };
  }
  const layers = definition.layers
    ? Object.fromEntries(Object.entries(definition.layers).map(([key, spec]) => [key, draftLayerRules(spec)]))
    : undefined;
  return {
    ...definition,
    content,
    ...(layers ? { layers } : {}),
    ...(definition.constraints ? { constraints: [] } : {}),
  };
}

function draftItemRules(spec: CollectionItemSpec): CollectionItemSpec {
  if (spec.widget === 'tilemap') return { ...spec, grid: { ...spec.grid, ...OPEN_GRID }, constraints: [] };
  if (spec.widget === 'entities') return { ...spec, constraints: [] };
  if (spec.widget === 'path') return { ...spec, minPoints: 0, closed: false };
  return {
    ...spec,
    constraints: [],
    layers: Object.fromEntries(Object.entries(spec.layers).map(([key, layer]) => [key, draftLayerRules(layer)])),
  };
}

function draftLayerRules(spec: EditorLayerSpec): EditorLayerSpec {
  if (spec.widget === 'tilemap') return { ...spec, grid: { ...spec.grid, ...OPEN_GRID }, constraints: [] };
  return { ...spec, min: 0, constraints: [] };
}
