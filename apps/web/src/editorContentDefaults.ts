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
  EditorPropertySpec,
  GameEditorState,
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

// A draft saved before a field was declared has a hole.
export function fillDeclaredValues(definition: EditorDefinition, doc: EditorContentDoc): EditorContentDoc {
  const filled: EditorContentDoc = { ...doc };
  for (const [key, spec] of Object.entries(definition.content)) {
    const items = doc[key];
    if (Array.isArray(items)) filled[key] = items.map((item) => fillItem(spec.item, item));
  }
  const layers = doc[LAYERS_KEY];
  if (definition.layers && isRecord(layers)) {
    filled[LAYERS_KEY] = fillLayers(definition.layers, layers as EditorLayersDoc);
  }
  if (definition.params) filled.params = fillParams(definition.params, doc.params);
  return filled;
}

// A draft the definition moved under differs from what the server holds.
export function draftHasHole(loaded: GameEditorState): boolean {
  if (!loaded.draft) return false;
  const stored = loaded.draft.content;
  return JSON.stringify(fillDeclaredValues(loaded.definition, stored)) !== JSON.stringify(stored);
}

function fillParams(specs: Record<string, EditorParamSpec>, values: unknown): Record<string, EditorParamValue> {
  const filled: Record<string, EditorParamValue> = isRecord(values)
    ? { ...(values as Record<string, EditorParamValue>) }
    : {};
  for (const [name, spec] of Object.entries(specs)) {
    if (filled[name] === undefined) filled[name] = spec.default;
  }
  return filled;
}

function fillItem(spec: EditorCollectionItemSpec, item: EditorItemContent): EditorItemContent {
  if (!isRecord(item)) return item;
  const raw = item as unknown as Record<string, unknown>;
  const properties = withDeclared(spec.properties, raw.properties);
  if (spec.widget !== 'layered') return { ...raw, properties } as unknown as EditorItemContent;
  const layers = isRecord(raw.layers) ? fillLayers(spec.layers, raw.layers as EditorLayersDoc) : raw.layers;
  return { ...raw, properties, layers } as unknown as EditorItemContent;
}

function fillLayers(specs: Record<string, EditorLayerSpec>, layers: EditorLayersDoc): EditorLayersDoc {
  const filled: EditorLayersDoc = { ...layers };
  for (const [key, spec] of Object.entries(specs)) {
    if (layers[key] !== undefined) filled[key] = fillLayerContent(spec, layers[key]);
  }
  return filled;
}

function fillLayerContent(spec: EditorLayerSpec, value: EditorLayerContent): EditorLayerContent {
  if (spec.widget === 'entities') {
    if (!Array.isArray(value)) return value;
    return value.map((entity) =>
      isRecord(entity) ? { ...entity, properties: withDeclared(spec.properties, entity.properties) } : entity,
    );
  }
  if (!isRecord(value)) return value;
  return { ...value, properties: withDeclared(spec.properties, value.properties) };
}

// Only absent values are filled; a chosen falsy value stays.
function withDeclared(
  specs: Record<string, EditorPropertySpec> | undefined,
  properties: unknown,
): Record<string, unknown> {
  const filled: Record<string, unknown> = isRecord(properties) ? { ...properties } : {};
  for (const [name, spec] of Object.entries(specs ?? {})) {
    if (filled[name] === undefined) filled[name] = defaultPropertyValue(spec);
  }
  return filled;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
