import type {
  EditorCollectionItemSpec,
  EditorContentDoc,
  EditorDefinition,
  EditorItemContent,
  EditorLayerContent,
  EditorLayerSpec,
  EditorLayersDoc,
  EditorParamSpec,
  EditorParamValue,
  EditorPathSpec,
  EditorPropertySpec,
  EditorTilemapSpec,
} from './studioApi.js';

const LAYERS_KEY = 'layers';

// The value a declared field starts at.
export function defaultPropertyValue(spec: EditorPropertySpec): unknown {
  if (spec.type === 'text') return '';
  if (spec.type === 'int' || spec.type === 'number') return spec.min;
  if (spec.type === 'enum') return spec.values[0];
  return false;
}

// Every declared field at its starting value.
export function declaredDefaults(specs: Record<string, EditorPropertySpec> | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(specs ?? {}).map(([name, spec]) => [name, defaultPropertyValue(spec)]));
}

// What the definition declares, all of it and nothing else.
export function fillDeclaredValues(definition: EditorDefinition, doc: EditorContentDoc): EditorContentDoc {
  const filled: EditorContentDoc = {};
  for (const [key, spec] of Object.entries(definition.content)) {
    const items = Array.isArray(doc[key]) ? (doc[key] as EditorItemContent[]) : spec.defaults;
    filled[key] = items.map((item) => fillItem(spec.item, item));
  }
  if (definition.layers) {
    const layers = doc[LAYERS_KEY];
    filled[LAYERS_KEY] = fillLayers(definition.layers, isRecord(layers) ? (layers as EditorLayersDoc) : {});
  }
  if (definition.params) filled.params = fillParams(definition.params, doc.params);
  return filled;
}

// Anything the merge added must still be written back.
export function differsFromStored(stored: EditorContentDoc, shown: EditorContentDoc): boolean {
  return stableJson(stored) !== stableJson(shown);
}

// Key order is not content, so reordering is no change.
function stableJson(value: unknown): string {
  const sorted = (inner: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify(value, (_key, inner: unknown) => (isRecord(inner) ? sorted(inner) : inner));
}

function fillParams(specs: Record<string, EditorParamSpec>, values: unknown): Record<string, EditorParamValue> {
  const current = (isRecord(values) ? values : {}) as Record<string, EditorParamValue>;
  const filled: Record<string, EditorParamValue> = {};
  for (const [name, spec] of Object.entries(specs)) {
    filled[name] = current[name] === undefined ? spec.default : current[name];
  }
  return filled;
}

// An item carries its container and declared properties only.
function fillItem(spec: EditorCollectionItemSpec, item: EditorItemContent): EditorItemContent {
  if (!isRecord(item)) return item;
  const raw = item as unknown as Record<string, unknown>;
  const properties = withDeclared(spec.properties, raw.properties);
  if (spec.widget === 'tilemap') {
    const rows = Array.isArray(raw.rows) ? raw.rows : blankRows(spec);
    return { properties, rows } as unknown as EditorItemContent;
  }
  if (spec.widget === 'path') {
    const points = Array.isArray(raw.points) ? raw.points : blankPathPoints(spec);
    return { properties, points } as unknown as EditorItemContent;
  }
  if (spec.widget !== 'layered') return { properties } as unknown as EditorItemContent;
  const layers = fillLayers(spec.layers, (isRecord(raw.layers) ? raw.layers : {}) as EditorLayersDoc);
  return { properties, layers } as unknown as EditorItemContent;
}

// A layer declared later has nothing to fill from.
function fillLayers(specs: Record<string, EditorLayerSpec>, layers: EditorLayersDoc): EditorLayersDoc {
  const filled: EditorLayersDoc = {};
  for (const [key, spec] of Object.entries(specs)) {
    filled[key] = layers[key] === undefined ? blankLayerContent(spec) : fillLayerContent(spec, layers[key]);
  }
  return filled;
}

// The smallest legal board, so the creator has something to paint on.
export function blankLayerContent(spec: EditorLayerSpec): EditorLayerContent {
  if (spec.widget !== 'tilemap') return [];
  return { properties: declaredDefaults(spec.properties), rows: blankRows(spec) };
}

export function blankRows(spec: EditorTilemapSpec): string[] {
  const fill = spec.tiles[0]?.char ?? '.';
  return Array.from({ length: spec.grid.minRows }, () => fill.repeat(spec.grid.minCols));
}

export function blankPathPoints(spec: EditorPathSpec) {
  const cells = Array.from({ length: spec.gridCols * spec.gridRows }, (_, index) => ({
    x: index % spec.gridCols,
    y: Math.floor(index / spec.gridCols),
  }));
  return Array.from({ length: spec.minPoints }, (_, index) => {
    if (index < cells.length) return cells[index];
    if (cells.length === 1) return cells[0];
    return cells[1 + ((index - cells.length) % (cells.length - 1))];
  });
}

// A saved layer that no longer matches its widget cannot serve.
function fillLayerContent(spec: EditorLayerSpec, value: EditorLayerContent): EditorLayerContent {
  if (spec.widget === 'entities') {
    if (!Array.isArray(value)) return blankLayerContent(spec);
    return value.map((entity) =>
      isRecord(entity) ? { properties: withDeclared(spec.properties, entity.properties) } : entity,
    );
  }
  const rows = isRecord(value) ? (value as { rows?: unknown }).rows : undefined;
  if (!Array.isArray(rows)) return blankLayerContent(spec);
  return { properties: withDeclared(spec.properties, (value as { properties?: unknown }).properties), rows };
}

// Only absent values are filled; a chosen falsy value stays.
function withDeclared(
  specs: Record<string, EditorPropertySpec> | undefined,
  properties: unknown,
): Record<string, unknown> {
  const current = isRecord(properties) ? properties : {};
  const filled: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(specs ?? {})) {
    filled[name] = current[name] === undefined ? defaultPropertyValue(spec) : current[name];
  }
  return filled;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
