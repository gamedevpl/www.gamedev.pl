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
  validateCollectionContent,
  valueProblem,
  type CollectionItemSpec,
  type CollectionSpec,
  type EditorConstraint,
  type EditorContentDocument,
  type EditorDefinition,
  type EditorLabel,
  type EditorLayerConstraint,
  type EditorLayerSpec,
  type EntitiesItemSpec,
  type EntityItemContent,
  type LayerTileRef,
  type LayeredItemSpec,
  type ParamSpec,
  type ParamValue,
  type PathItemContent,
  type PathItemSpec,
  type PropertySpec,
  type TileSpec,
  type TilemapItemContent,
  type TilemapItemSpec,
  type TilemapLayerSpec,
} from '@gamedevpl/contract';

export { valueProblem };

const KEY_PATTERN = /^[a-z][a-zA-Z0-9]{0,23}$/;
const TILE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,15}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const PROPERTY_TYPES = ['text', 'int', 'number', 'enum', 'bool'] as const;

function isLabel(value: unknown): value is EditorLabel {
  return (
    isPlainObject(value) &&
    Object.keys(value).length === 2 &&
    typeof value.en === 'string' &&
    value.en.length > 0 &&
    value.en.length <= 32 &&
    typeof value.pl === 'string' &&
    value.pl.length > 0 &&
    value.pl.length <= 32
  );
}

function validateProperties(owner: string, raw: unknown, errors: string[]): Record<string, PropertySpec> {
  const out: Record<string, PropertySpec> = {};
  if (!isPlainObject(raw)) {
    errors.push(`${owner}: "properties" must be an object mapping property names to type declarations`);
    return out;
  }
  const names = Object.keys(raw);
  if (names.length > MAX_PROPERTIES) {
    errors.push(`${owner}: declares ${names.length} properties (limit ${MAX_PROPERTIES})`);
  }
  for (const name of names) {
    if (!KEY_PATTERN.test(name)) {
      errors.push(`${owner}: property name "${name}" must be lowerCamelCase, 1-24 characters`);
      continue;
    }
    const spec = raw[name];
    if (!isPlainObject(spec) || !PROPERTY_TYPES.includes(spec.type as (typeof PROPERTY_TYPES)[number])) {
      errors.push(`${owner}: property "${name}" needs a type, one of ${PROPERTY_TYPES.join(', ')}`);
      continue;
    }
    if (spec.type === 'text') {
      if (!Number.isInteger(spec.max) || (spec.max as number) < 1 || (spec.max as number) > MAX_TEXT_LENGTH) {
        errors.push(
          `${owner}: text property "${name}" needs an integer "max" between 1 and ${MAX_TEXT_LENGTH} — ` +
            'creator text is shown and moderated, so it must be bounded',
        );
        continue;
      }
      out[name] = { type: 'text', max: spec.max as number };
    } else if (spec.type === 'int' || spec.type === 'number') {
      const min = spec.min;
      const max = spec.max;
      if (typeof min !== 'number' || typeof max !== 'number' || !(min <= max)) {
        errors.push(`${owner}: ${spec.type} property "${name}" needs numeric "min" and "max" with min <= max`);
        continue;
      }
      out[name] = { type: spec.type, min, max };
    } else if (spec.type === 'enum') {
      const values = spec.values;
      const usable =
        Array.isArray(values) &&
        values.length > 0 &&
        values.length <= MAX_ENUM_VALUES &&
        values.every((value) => typeof value === 'string' && value.length > 0 && value.length <= 32) &&
        new Set(values).size === values.length;
      if (!usable) {
        errors.push(
          `${owner}: enum property "${name}" needs 1-${MAX_ENUM_VALUES} distinct non-empty string "values", ` +
            'each at most 32 characters',
        );
        continue;
      }
      out[name] = { type: 'enum', values: values as string[] };
    } else {
      out[name] = { type: 'bool' };
    }
  }
  return out;
}

function validateParams(raw: unknown, errors: string[], requireDefaults: boolean): Record<string, ParamSpec> {
  const out: Record<string, ParamSpec> = {};
  if (!isPlainObject(raw)) {
    errors.push('"params" must be an object mapping param names to declarations');
    return out;
  }
  const names = Object.keys(raw);
  if (names.length > MAX_PARAMS) {
    errors.push(`"params" declares ${names.length} tunables (limit ${MAX_PARAMS})`);
  }
  // The property half rides the exact rules item properties follow, so a type
  // that is legal on an item is legal as a tunable and vice versa.
  const base = validateProperties('params', raw, errors);
  for (const name of names) {
    const spec = base[name];
    if (!spec) continue;
    const declared = (raw as Record<string, unknown>)[name] as Record<string, unknown>;
    if (!isLabel(declared.label)) {
      errors.push(`params: "${name}" needs a label with non-empty "en" and "pl" (max 32 chars)`);
      continue;
    }
    if (requireDefaults && declared.default === undefined) {
      errors.push(`params: "${name}" needs a "default" — the value players get`);
      continue;
    }
    if (!requireDefaults && declared.default !== undefined) {
      errors.push(`params: "${name}" v2 schemas cannot contain "default"; use ${EDITOR_CONTENT_FILE}`);
      continue;
    }
    const problem = declared.default === undefined ? null : valueProblem(spec, declared.default);
    if (problem) {
      errors.push(`params: "${name}" default ${problem}`);
      continue;
    }
    const label = declared.label as EditorLabel;
    out[name] = { ...spec, label: { en: label.en, pl: label.pl }, default: declared.default as ParamValue };
  }
  return out;
}

function validateTilemapSpec(owner: string, raw: unknown, errors: string[]): TilemapItemSpec | null {
  if (!isPlainObject(raw)) {
    errors.push(`${owner}: "item" must be an object`);
    return null;
  }
  const grid = raw.grid;
  if (
    !isPlainObject(grid) ||
    !Number.isInteger(grid.minCols) ||
    !Number.isInteger(grid.maxCols) ||
    !Number.isInteger(grid.minRows) ||
    !Number.isInteger(grid.maxRows)
  ) {
    errors.push(`${owner}: "grid" needs integer minCols/maxCols/minRows/maxRows`);
    return null;
  }
  const g = grid as { minCols: number; maxCols: number; minRows: number; maxRows: number };
  if (
    g.minCols < 1 ||
    g.maxCols > MAX_GRID_COLS ||
    g.minRows < 1 ||
    g.maxRows > MAX_GRID_ROWS ||
    g.minCols > g.maxCols ||
    g.minRows > g.maxRows
  ) {
    errors.push(`${owner}: grid bounds must satisfy 1 <= min <= max <= ${MAX_GRID_COLS}`);
    return null;
  }

  const tiles: TileSpec[] = [];
  if (!Array.isArray(raw.tiles) || raw.tiles.length < 2 || raw.tiles.length > MAX_TILES) {
    errors.push(`${owner}: "tiles" needs 2-${MAX_TILES} entries`);
  } else {
    const keys = new Set<string>();
    const chars = new Set<string>();
    for (const tile of raw.tiles) {
      if (!isPlainObject(tile) || typeof tile.key !== 'string' || !TILE_KEY_PATTERN.test(tile.key)) {
        errors.push(`${owner}: every tile needs a key matching ${TILE_KEY_PATTERN}`);
        continue;
      }
      if (typeof tile.char !== 'string' || tile.char.length !== 1 || tile.char < ' ' || tile.char > '~') {
        errors.push(`${owner}: tile "${tile.key}" needs a single printable ASCII "char"`);
        continue;
      }
      if (!isLabel(tile.label)) {
        errors.push(`${owner}: tile "${tile.key}" needs a label with non-empty "en" and "pl" (max 32 chars)`);
        continue;
      }
      if (keys.has(tile.key) || chars.has(tile.char)) {
        errors.push(`${owner}: tile keys and chars must be unique ("${tile.key}" / "${tile.char}")`);
        continue;
      }
      if (tile.color !== undefined && (typeof tile.color !== 'string' || !HEX_COLOR_PATTERN.test(tile.color))) {
        errors.push(`${owner}: tile "${tile.key}" color must be a #rrggbb string`);
        continue;
      }
      keys.add(tile.key);
      chars.add(tile.char);
      tiles.push({
        key: tile.key,
        char: tile.char,
        label: { en: tile.label.en, pl: tile.label.pl },
        ...(typeof tile.color === 'string' ? { color: tile.color.toLowerCase() } : {}),
      });
    }
  }

  const properties = validateProperties(owner, raw.properties ?? {}, errors);

  const constraints: EditorConstraint[] = [];
  if (raw.constraints !== undefined) {
    if (!Array.isArray(raw.constraints) || raw.constraints.length > MAX_CONSTRAINTS) {
      errors.push(`${owner}: "constraints" must be an array of at most ${MAX_CONSTRAINTS} rules`);
    } else {
      const tileKeys = new Set(tiles.map((tile) => tile.key));
      for (const rule of raw.constraints) {
        if (!isPlainObject(rule)) {
          errors.push(`${owner}: every constraint must be an object`);
          continue;
        }
        if (Array.isArray(rule.equalCounts)) {
          const pair = rule.equalCounts;
          if (
            pair.length !== 2 ||
            typeof pair[0] !== 'string' ||
            typeof pair[1] !== 'string' ||
            !tileKeys.has(pair[0]) ||
            !tileKeys.has(pair[1]) ||
            pair[0] === pair[1]
          ) {
            errors.push(`${owner}: "equalCounts" needs two distinct declared tile keys`);
            continue;
          }
          constraints.push({ equalCounts: [pair[0], pair[1]] });
          continue;
        }
        if (isPlainObject(rule.reachable)) {
          const spec = rule.reachable;
          const keys = (value: unknown): string[] | null =>
            Array.isArray(value) &&
            value.length > 0 &&
            value.every((key) => typeof key === 'string' && tileKeys.has(key))
              ? (value as string[])
              : null;
          const blockedBy = keys(spec.blockedBy);
          const require = keys(spec.require);
          if (typeof spec.from !== 'string' || !tileKeys.has(spec.from) || !blockedBy || !require) {
            errors.push(
              `${owner}: "reachable" needs a declared "from" tile plus non-empty "blockedBy" and "require" ` +
                'arrays of declared tile keys',
            );
            continue;
          }
          constraints.push({ reachable: { from: spec.from, blockedBy: [...blockedBy], require: [...require] } });
          continue;
        }
        if (typeof rule.tile !== 'string' || !tileKeys.has(rule.tile)) {
          errors.push(`${owner}: constraint tile "${String(rule.tile)}" is not a declared tile key`);
          continue;
        }
        const bounds: { tile: string; min?: number; max?: number; exactly?: number } = { tile: rule.tile };
        let bounded = false;
        for (const bound of ['min', 'max', 'exactly'] as const) {
          if (rule[bound] !== undefined) {
            if (!Number.isInteger(rule[bound]) || (rule[bound] as number) < 0) {
              errors.push(`${owner}: constraint "${bound}" for tile "${rule.tile}" must be a non-negative integer`);
            } else {
              bounds[bound] = rule[bound] as number;
              bounded = true;
            }
          }
        }
        if (!bounded) {
          errors.push(`${owner}: constraint for tile "${rule.tile}" needs at least one of min/max/exactly`);
          continue;
        }
        constraints.push(bounds);
      }
    }
  }

  return { widget: 'tilemap', grid: g, tiles, properties, constraints };
}

function validateEntitiesSpec(owner: string, raw: unknown, errors: string[]): EntitiesItemSpec | null {
  if (!isPlainObject(raw)) {
    errors.push(`${owner}: "item" must be an object`);
    return null;
  }
  const properties = validateProperties(owner, raw.properties ?? {}, errors);
  const constraints: EditorConstraint[] = [];
  if (raw.constraints !== undefined) {
    if (!Array.isArray(raw.constraints) || raw.constraints.length > MAX_CONSTRAINTS) {
      errors.push(`${owner}: "constraints" must be an array of at most ${MAX_CONSTRAINTS} rules`);
    } else {
      for (const rule of raw.constraints) {
        if (
          !isPlainObject(rule) ||
          Object.keys(rule).length !== 1 ||
          typeof rule.uniqueBy !== 'string' ||
          !KEY_PATTERN.test(rule.uniqueBy)
        ) {
          errors.push(`${owner}: entities constraints only support "uniqueBy" with a property key`);
          continue;
        }
        if (!(rule.uniqueBy in properties)) {
          errors.push(`${owner}: "uniqueBy" property "${rule.uniqueBy}" is not declared`);
          continue;
        }
        constraints.push({ uniqueBy: rule.uniqueBy });
      }
    }
  }
  return { widget: 'entities', properties, constraints };
}

function validatePathSpec(owner: string, raw: unknown, errors: string[]): PathItemSpec | null {
  if (!isPlainObject(raw)) {
    errors.push(`${owner}: "item" must be an object`);
    return null;
  }
  if (
    !Number.isInteger(raw.gridCols) ||
    !Number.isInteger(raw.gridRows) ||
    (raw.gridCols as number) < 1 ||
    (raw.gridCols as number) > MAX_GRID_COLS ||
    (raw.gridRows as number) < 1 ||
    (raw.gridRows as number) > MAX_GRID_ROWS
  ) {
    errors.push(`${owner}: path gridCols/gridRows must be integers between 1 and ${MAX_GRID_COLS}`);
    return null;
  }
  const closed = raw.closed ?? false;
  if (typeof closed !== 'boolean') {
    errors.push(`${owner}: path "closed" must be a boolean when present`);
    return null;
  }
  if (closed && (raw.gridCols as number) * (raw.gridRows as number) < 3) {
    errors.push(`${owner}: a closed path grid needs room for at least 3 distinct points`);
    return null;
  }
  const minimum = closed ? 3 : 1;
  if (
    !Number.isInteger(raw.minPoints) ||
    !Number.isInteger(raw.maxPoints) ||
    (raw.minPoints as number) < minimum ||
    (raw.maxPoints as number) > MAX_PATH_POINTS ||
    (raw.minPoints as number) > (raw.maxPoints as number)
  ) {
    errors.push(`${owner}: path point bounds must satisfy ${minimum} <= minPoints <= maxPoints <= ${MAX_PATH_POINTS}`);
    return null;
  }
  return {
    widget: 'path',
    gridCols: raw.gridCols as number,
    gridRows: raw.gridRows as number,
    minPoints: raw.minPoints as number,
    maxPoints: raw.maxPoints as number,
    closed,
    properties: validateProperties(owner, raw.properties ?? {}, errors),
  };
}

// Per-level stack; top-level `layers` is one board per game.
function validateLayeredSpec(owner: string, raw: Record<string, unknown>, errors: string[]): LayeredItemSpec | null {
  if (!isPlainObject(raw.layers)) {
    errors.push(`${owner}: "layers" must be an object of layer declarations`);
    return null;
  }
  const keys = Object.keys(raw.layers);
  if (keys.length === 0 || keys.length > MAX_LAYERS) {
    errors.push(`${owner}: needs 1-${MAX_LAYERS} layers`);
    return null;
  }
  const layers: Record<string, EditorLayerSpec> = {};
  for (const key of keys) {
    if (!KEY_PATTERN.test(key)) {
      errors.push(`${owner} layer key "${key}" must be lowerCamelCase, 1-24 characters`);
      continue;
    }
    const layer = validateLayerSpec(`${owner}.${key}`, (raw.layers as Record<string, unknown>)[key], errors);
    if (layer) layers[key] = layer;
  }
  checkLayerGrids(owner, layers, errors);
  return {
    widget: 'layered',
    layers,
    constraints: validateLayerConstraints(raw.constraints, layers, errors, owner),
    properties: validateProperties(owner, raw.properties ?? {}, errors),
  };
}

function validateCollectionItemSpec(owner: string, raw: unknown, errors: string[]): CollectionItemSpec | null {
  if (isPlainObject(raw) && raw.widget === 'entities') return validateEntitiesSpec(owner, raw, errors);
  if (isPlainObject(raw) && raw.widget === 'tilemap') return validateTilemapSpec(owner, raw, errors);
  if (isPlainObject(raw) && raw.widget === 'path') return validatePathSpec(owner, raw, errors);
  if (isPlainObject(raw) && raw.widget === 'layered') return validateLayeredSpec(owner, raw, errors);
  errors.push(
    `${owner}: unknown item widget "${String(isPlainObject(raw) ? raw.widget : undefined)}" (vocabulary: tilemap, entities, path, layered)`,
  );
  return null;
}

// Stacked tilemaps share one grid, so bounds and budget must agree.
function checkLayerGrids(owner: string, layers: Record<string, EditorLayerSpec>, errors: string[]): void {
  const tilemaps = Object.values(layers).filter((layer): layer is TilemapLayerSpec => layer.widget === 'tilemap');
  const grids = tilemaps.map((layer) => JSON.stringify(layer.grid));
  if (grids.some((grid) => grid !== grids[0])) {
    errors.push(`${owner} tilemap layers must share the same grid bounds`);
  }
  const cells = tilemaps.reduce((total, layer) => total + layer.grid.maxCols * layer.grid.maxRows, 0);
  if (cells > MAX_LAYER_TOTAL_CELLS) {
    errors.push(`${owner} tilemap layers exceed the shared ${MAX_LAYER_TOTAL_CELLS}-cell budget`);
  }
}

function validateLayerSpec(owner: string, raw: unknown, errors: string[]): EditorLayerSpec | null {
  if (!isPlainObject(raw)) {
    errors.push(`${owner}: must be an object`);
    return null;
  }
  const key = owner.slice(owner.lastIndexOf('.') + 1);
  const label = raw.label === undefined ? { en: key, pl: key } : raw.label;
  if (!isLabel(label)) {
    errors.push(`${owner}: "label" needs non-empty "en" and "pl" values (max 32 chars)`);
    return null;
  }
  if (raw.widget === 'tilemap') {
    const item = validateTilemapSpec(owner, raw, errors);
    return item ? { ...item, label: { en: label.en, pl: label.pl } } : null;
  }
  if (raw.widget === 'entities') {
    const item = validateEntitiesSpec(owner, raw, errors);
    if (!item) return null;
    const min: unknown = raw.min ?? 0;
    const max: unknown = raw.max ?? MAX_LAYER_ITEMS;
    if (
      typeof min !== 'number' ||
      typeof max !== 'number' ||
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      min < 0 ||
      max > MAX_LAYER_ITEMS ||
      min > max
    ) {
      errors.push(`${owner}: entity bounds must satisfy 0 <= min <= max <= ${MAX_LAYER_ITEMS}`);
      return null;
    }
    return { ...item, label: { en: label.en, pl: label.pl }, min, max };
  }
  errors.push(`${owner}: unknown widget "${String(raw.widget)}" (layers support tilemap or entities)`);
  return null;
}

function validateLayerConstraints(
  raw: unknown,
  layers: Record<string, EditorLayerSpec>,
  errors: string[],
  scope = 'layers',
): EditorLayerConstraint[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_CONSTRAINTS) {
    errors.push(`${scope} constraints must be an array of at most ${MAX_CONSTRAINTS} rules`);
    return [];
  }
  const refs = (value: unknown, owner: string): LayerTileRef[] | null => {
    if (!Array.isArray(value) || value.length === 0) {
      errors.push(`${owner} must be a non-empty array of layer tile references`);
      return null;
    }
    const result: LayerTileRef[] = [];
    for (const ref of value) {
      if (!isPlainObject(ref) || typeof ref.layer !== 'string' || typeof ref.tile !== 'string') {
        errors.push(`${owner} entries need string "layer" and "tile" keys`);
        continue;
      }
      const layer = layers[ref.layer];
      if (!layer || layer.widget !== 'tilemap') {
        errors.push(`${owner} references unknown tilemap layer "${ref.layer}"`);
        continue;
      }
      if (!layer.tiles.some((tile) => tile.key === ref.tile)) {
        errors.push(`${owner} references unknown tile "${ref.tile}" in layer "${ref.layer}"`);
        continue;
      }
      result.push({ layer: ref.layer, tile: ref.tile });
    }
    return result.length === value.length ? result : null;
  };
  const result: EditorLayerConstraint[] = [];
  for (const [index, rule] of raw.entries()) {
    const owner = `${scope} constraints[${index}]`;
    if (!isPlainObject(rule) || !isPlainObject(rule.reachable)) {
      errors.push(`${owner}: only "reachable" cross-layer rules are supported`);
      continue;
    }
    const reachable = rule.reachable;
    const from = refs([reachable.from], `${owner}.reachable.from`);
    const blockedBy = refs(reachable.blockedBy, `${owner}.reachable.blockedBy`);
    const require = refs(reachable.require, `${owner}.reachable.require`);
    if (!from || from.length !== 1 || !blockedBy || !require) continue;
    result.push({ reachable: { from: from[0], blockedBy, require } });
  }
  return result;
}

/**
 * Parse and validate an EDITOR.json source. Returns the typed definition and a
 * list of human-readable problems; a non-empty `errors` means the definition
 * must not be used (the returned value may be partial).
 */
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
  // A tunables-only game (an arcade retrofit with no editable maps) may declare
  // an empty or absent "content" — but a definition with neither params nor
  // collections declares nothing and is refused as before.
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
    // Defaults must satisfy the schema they ship with — the round-trip that
    // proves the pipeline works before a creator ever touches it.
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

/**
 * L1 of EditorKit: emit the generated `game/editor-content.ts` — per-game types
 * plus the build-inlined default content. Deterministic on the definition
 * alone: Check 31 regenerates and byte-compares, and the website's publish
 * path regenerates it with new defaults. A `.d.ts` would not do — declarations
 * are erased at compile time and the assembler only inlines `.ts`.
 */
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
