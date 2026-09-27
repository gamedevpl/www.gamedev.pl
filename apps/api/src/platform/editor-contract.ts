// Types and L4 validation live in @gamedevpl/contract.

export {
  EDITOR_CONTENT_FILE,
  EDITOR_FILE,
  EDITOR_SPEC_KEY,
  EDITOR_SPEC_VALUE,
  GENERATED_CONTENT_PATH,
  LAYERS_KEY,
  MAX_COLLECTIONS,
  MAX_COLLECTION_ITEMS,
  MAX_CONSTRAINTS,
  MAX_EDITOR_JSON_BYTES,
  MAX_ENUM_VALUES,
  MAX_GRID_COLS,
  MAX_GRID_ROWS,
  MAX_LAYER_ITEMS,
  MAX_LAYER_TOTAL_CELLS,
  MAX_LAYERS,
  MAX_PARAMS,
  MAX_PATH_POINTS,
  MAX_PROPERTIES,
  MAX_TEXT_LENGTH,
  MAX_TILES,
  PARAMS_KEY,
  isPlainObject,
  propertyValueErrors,
  validateCollectionContent,
  validateEditorContent,
  validateItemContent,
  validateLayerContent,
  type CollectionItemSpec,
  type CollectionSpec,
  type EditorConstraint,
  type EditorContentDocument,
  type EditorDefinition,
  type EditorLabel,
  type EditorLayerConstraint,
  type EditorLayerContent,
  type EditorLayerSpec,
  type EditorLayersContent,
  type EditorVersion,
  type EntitiesItemSpec,
  type EntitiesLayerSpec,
  type EntityItemContent,
  type LayerTileRef,
  type LayeredItemContent,
  type LayeredItemSpec,
  type ParamSpec,
  type ParamValue,
  type PathItemContent,
  type PathItemSpec,
  type PathPoint,
  type PropertySpec,
  type TileSpec,
  type TilemapItemContent,
  type TilemapItemSpec,
  type TilemapLayerSpec,
} from '@gamedevpl/contract';

import {
  EDITOR_CONTENT_FILE,
  LAYERS_KEY,
  MAX_COLLECTIONS,
  MAX_COLLECTION_ITEMS,
  MAX_EDITOR_JSON_BYTES,
  MAX_LAYERS,
  PARAMS_KEY,
  isPlainObject,
  validateCollectionContent,
  valueProblem,
  type CollectionSpec,
  type EditorContentDocument,
  type EditorDefinition,
  type EditorLabel,
  type EditorLayerSpec,
  type EntityItemContent,
  type PathItemContent,
  type PropertySpec,
  type TilemapItemContent,
} from '@gamedevpl/contract';

export { valueProblem };

import { KEY_PATTERN, isLabel, validateParams } from './editor-contract-fields.js';
import {
  validateCollectionItemSpec,
  checkLayerGrids,
  validateLayerSpec,
  validateLayerConstraints,
} from './editor-contract-items.js';

export function parseEditorDefinition(source: string): { definition: EditorDefinition | null; errors: string[] } {
  const errors: string[] = [];
  if (Buffer.byteLength(source, 'utf8') > MAX_EDITOR_JSON_BYTES) {
    errors.push(`EDITOR.json exceeds ${MAX_EDITOR_JSON_BYTES} bytes`);
    return { definition: null, errors };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    errors.push('EDITOR.json is not valid JSON');
    return { definition: null, errors };
  }
  if (!isPlainObject(parsed)) {
    errors.push('EDITOR.json must be a JSON object');
    return { definition: null, errors };
  }
  if (parsed.version !== 1 && parsed.version !== 2) {
    errors.push('EDITOR.json "version" must be 1 or 2');
    return { definition: null, errors };
  }
  const unknownKeys = Object.keys(parsed).filter(
    (key) => !['version', 'content', PARAMS_KEY, LAYERS_KEY, 'constraints', 'controller', 'validate'].includes(key),
  );
  if (unknownKeys.length > 0) {
    errors.push(`EDITOR.json has unknown top-level keys: ${unknownKeys.join(', ')}`);
  }
  const params =
    parsed[PARAMS_KEY] === undefined ? {} : validateParams(parsed[PARAMS_KEY], errors, parsed.version === 1);
  const hasParams = Object.keys(params).length > 0;
  // Tunables-only games may omit content; declaring nothing is refused.
  if (parsed.content !== undefined && !isPlainObject(parsed.content)) {
    errors.push('EDITOR.json needs a "content" object of collections');
    return { definition: null, errors };
  }
  if (parsed.layers !== undefined && !isPlainObject(parsed.layers)) {
    errors.push('EDITOR.json needs a "layers" object of shared-grid layer declarations');
    return { definition: null, errors };
  }
  const contentKeys = isPlainObject(parsed.content) ? Object.keys(parsed.content) : [];
  const layerKeys = isPlainObject(parsed.layers) ? Object.keys(parsed.layers) : [];
  if (
    contentKeys.length > MAX_COLLECTIONS ||
    layerKeys.length > MAX_LAYERS ||
    (contentKeys.length === 0 && layerKeys.length === 0 && !hasParams)
  ) {
    errors.push(`EDITOR.json needs params, content collections, or layers`);
    return { definition: null, errors };
  }
  if (parsed.version === 1 && layerKeys.length > 0) {
    errors.push('EDITOR.json "layers" requires version 2');
    return { definition: null, errors };
  }
  if (parsed.controller !== undefined && parsed.controller !== true) {
    errors.push('EDITOR.json "controller" must be true when present');
  }
  if (parsed.controller === true && parsed.version !== 2) {
    errors.push('EDITOR.json "controller" requires version 2');
  }
  if (parsed.validate !== undefined && parsed.validate !== true) {
    errors.push('EDITOR.json "validate" must be true when present');
  }
  if (parsed.validate === true && parsed.version !== 2) {
    errors.push('EDITOR.json "validate" requires version 2');
  }
  if (parsed.validate === true && parsed.controller !== true) {
    errors.push('EDITOR.json "validate" requires controller: true');
  }

  const content: Record<string, CollectionSpec> = {};
  for (const key of contentKeys) {
    const owner = `content.${key}`;
    if (key === PARAMS_KEY) {
      errors.push(`EDITOR.json collection key "${PARAMS_KEY}" is reserved for tunables`);
      continue;
    }
    if (!KEY_PATTERN.test(key)) {
      errors.push(`EDITOR.json collection key "${key}" must be lowerCamelCase, 1-24 characters`);
      continue;
    }
    const raw = (parsed.content as Record<string, unknown>)[key];
    if (!isPlainObject(raw)) {
      errors.push(`${owner}: must be an object`);
      continue;
    }
    if (raw.widget !== 'collection') {
      errors.push(`${owner}: unknown widget "${String(raw.widget)}" (vocabulary v0: collection)`);
      continue;
    }
    if (!isLabel(raw.label) || !isLabel(raw.itemLabel)) {
      errors.push(`${owner}: needs "label" and "itemLabel" objects with non-empty "en" and "pl" (max 32 chars)`);
      continue;
    }
    if (
      !Number.isInteger(raw.min) ||
      !Number.isInteger(raw.max) ||
      (raw.min as number) < 1 ||
      (raw.max as number) > MAX_COLLECTION_ITEMS ||
      (raw.min as number) > (raw.max as number)
    ) {
      errors.push(`${owner}: needs integer "min" and "max" with 1 <= min <= max <= ${MAX_COLLECTION_ITEMS}`);
      continue;
    }
    const item = validateCollectionItemSpec(owner, raw.item, errors);
    if (!item) continue;

    if (parsed.version === 1 && !Array.isArray(raw.defaults)) {
      errors.push(`${owner}: needs a "defaults" array — the content the game ships with`);
      continue;
    }
    if (parsed.version === 2 && raw.defaults !== undefined) {
      errors.push(`${owner}: v2 schemas cannot contain "defaults"; use ${EDITOR_CONTENT_FILE}`);
      continue;
    }
    const spec: CollectionSpec = {
      widget: 'collection',
      label: { en: (raw.label as EditorLabel).en, pl: (raw.label as EditorLabel).pl },
      itemLabel: { en: (raw.itemLabel as EditorLabel).en, pl: (raw.itemLabel as EditorLabel).pl },
      min: raw.min as number,
      max: raw.max as number,
      item,
      defaults: (raw.defaults ?? []) as Array<TilemapItemContent | EntityItemContent | PathItemContent>,
    };
    // Defaults must satisfy their own schema.
    if (parsed.version === 1) {
      const defaultErrors = validateCollectionContent(spec, raw.defaults);
      errors.push(...defaultErrors.map((message) => `${owner} defaults: ${message}`));
    }
    content[key] = spec;
  }

  const layers: Record<string, EditorLayerSpec> = {};
  for (const key of layerKeys) {
    if (!KEY_PATTERN.test(key)) {
      errors.push(`EDITOR.json layer key "${key}" must be lowerCamelCase, 1-24 characters`);
      continue;
    }
    const layer = validateLayerSpec(`layers.${key}`, (parsed.layers as Record<string, unknown>)[key], errors);
    if (layer) layers[key] = layer;
  }
  checkLayerGrids('EDITOR.json', layers, errors);
  const constraints = validateLayerConstraints(parsed.constraints, layers, errors);
  if (parsed.constraints !== undefined && parsed.version !== 2) {
    errors.push('EDITOR.json cross-layer constraints require version 2');
  }
  if (parsed.version === 1 && Object.values(content).some((spec) => spec.item.widget === 'layered')) {
    errors.push('EDITOR.json layered collection items require version 2');
  }

  if (errors.length > 0) return { definition: null, errors };
  return {
    definition: {
      version: parsed.version,
      ...(hasParams ? { params } : {}),
      ...(contentKeys.length > 0 ? { content } : { content: {} }),
      ...(layerKeys.length > 0 ? { layers } : {}),
      ...(constraints.length > 0 ? { constraints } : {}),
      ...(parsed.controller === true ? { controller: true as const } : {}),
      ...(parsed.validate === true ? { validate: true as const } : {}),
    },
    errors,
  };
}

function typeName(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function propertyTsType(spec: PropertySpec): string {
  if (spec.type === 'text') return 'string';
  if (spec.type === 'int' || spec.type === 'number') return 'number';
  if (spec.type === 'bool') return 'boolean';
  return spec.values.map((value) => JSON.stringify(value)).join(' | ');
}

// Deterministic game/editor-content.ts: types plus inlined defaults.
export function generateEditorContentModule(definition: EditorDefinition, content?: EditorContentDocument): string {
  const lines: string[] = ['// Generated from EDITOR.json by npm run editor:gen.', ''];
  const contentFields: string[] = [];
  const params = definition.params ?? {};
  const paramNames =
    content?.[PARAMS_KEY] && !Array.isArray(content[PARAMS_KEY])
      ? Object.keys(content[PARAMS_KEY]).filter((name) => name in params)
      : Object.keys(params);
  if (Object.keys(params).length > 0) {
    lines.push('export interface EditorParams {');
    for (const name of paramNames) {
      lines.push(`  ${name}: ${propertyTsType(params[name])};`);
    }
    lines.push('}', '');
    contentFields.push(`  ${PARAMS_KEY}: EditorParams;`);
  }
  for (const [key, spec] of Object.entries(definition.content)) {
    const itemType = `${typeName(key)}Item`;
    lines.push(`export interface ${itemType}Properties {`);
    for (const [name, propertySpec] of Object.entries(spec.item.properties)) {
      lines.push(`  ${name}: ${propertyTsType(propertySpec)};`);
    }
    lines.push('}', '');
    if (spec.item.widget === 'layered') {
      const fields: string[] = [];
      for (const [layerKey, layerSpec] of Object.entries(spec.item.layers)) {
        const layerType = `${itemType}${typeName(layerKey)}Layer`;
        lines.push(`export interface ${layerType}${layerSpec.widget === 'entities' ? 'Item' : ''} {`);
        lines.push('  properties: {');
        for (const [name, propertySpec] of Object.entries(layerSpec.properties)) {
          lines.push(`    ${name}: ${propertyTsType(propertySpec)};`);
        }
        lines.push('  };');
        if (layerSpec.widget === 'tilemap') lines.push('  rows: string[];');
        lines.push('}', '');
        fields.push(`  ${layerKey}: ${layerType}${layerSpec.widget === 'entities' ? 'Item[]' : ''};`);
      }
      lines.push(`export interface ${itemType}Layers {`, ...fields, '}', '');
    }
    lines.push(`export interface ${itemType} {`);
    lines.push(`  properties: ${itemType}Properties;`);
    if (spec.item.widget === 'tilemap') lines.push('  rows: string[];');
    if (spec.item.widget === 'path') lines.push('  points: Array<{ x: number; y: number }>;');
    if (spec.item.widget === 'layered') lines.push(`  layers: ${itemType}Layers;`);
    lines.push('}', '');
    contentFields.push(`  ${key}: ${itemType}[];`);
  }
  if (definition.layers && Object.keys(definition.layers).length > 0) {
    const layerFields: string[] = [];
    for (const [key, spec] of Object.entries(definition.layers)) {
      const layerType = `${typeName(key)}Layer`;
      if (spec.widget === 'tilemap') {
        lines.push(`export interface ${layerType} {`);
        lines.push('  properties: {');
        for (const [name, propertySpec] of Object.entries(spec.properties)) {
          lines.push(`    ${name}: ${propertyTsType(propertySpec)};`);
        }
        lines.push('  };');
        lines.push('  rows: string[];');
        lines.push('}', '');
      } else {
        lines.push(`export interface ${layerType}ItemProperties {`);
        for (const [name, propertySpec] of Object.entries(spec.properties)) {
          lines.push(`  ${name}: ${propertyTsType(propertySpec)};`);
        }
        lines.push('}', '');
        lines.push(`export interface ${layerType}Item {`);
        lines.push(`  properties: ${layerType}ItemProperties;`);
        lines.push('}', '');
      }
      layerFields.push(`  ${key}: ${layerType}${spec.widget === 'entities' ? 'Item[]' : ''};`);
    }
    lines.push('export interface EditorLayers {');
    lines.push(...layerFields);
    lines.push('}', '');
    contentFields.push(`  ${LAYERS_KEY}: EditorLayers;`);
  }
  lines.push('export interface EditorContent {');
  lines.push(...contentFields);
  lines.push('}', '');
  const defaults: Record<string, unknown> = {};
  if (Object.keys(params).length > 0) {
    defaults[PARAMS_KEY] =
      content?.[PARAMS_KEY] && !Array.isArray(content[PARAMS_KEY])
        ? content[PARAMS_KEY]
        : Object.fromEntries(Object.entries(params).map(([name, spec]) => [name, spec.default]));
  }
  for (const [key, spec] of Object.entries(definition.content)) {
    defaults[key] = content?.[key] ?? spec.defaults;
  }
  if (definition.layers && Object.keys(definition.layers).length > 0) {
    const supplied = content?.[LAYERS_KEY];
    defaults[LAYERS_KEY] = supplied && isPlainObject(supplied) ? supplied : {};
  }
  lines.push(`export const DEFAULT_CONTENT: EditorContent = ${JSON.stringify(defaults, null, 2)};`);
  lines.push('');
  return lines.join('\n');
}
