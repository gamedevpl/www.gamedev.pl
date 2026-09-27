// Collection item and layer validators for EDITOR.json.

import {
  MAX_CONSTRAINTS,
  MAX_GRID_COLS,
  MAX_GRID_ROWS,
  MAX_LAYER_ITEMS,
  MAX_LAYER_TOTAL_CELLS,
  MAX_LAYERS,
  MAX_PATH_POINTS,
  MAX_TILES,
  isPlainObject,
  type CollectionItemSpec,
  type EditorConstraint,
  type EditorLayerConstraint,
  type EditorLayerSpec,
  type EntitiesItemSpec,
  type LayerTileRef,
  type LayeredItemSpec,
  type PathItemSpec,
  type TileSpec,
  type TilemapItemSpec,
  type TilemapLayerSpec,
} from '@gamedevpl/contract';
import {
  KEY_PATTERN,
  TILE_KEY_PATTERN,
  HEX_COLOR_PATTERN,
  isLabel,
  validateProperties,
} from './editor-contract-fields.js';

export function validateTilemapSpec(owner: string, raw: unknown, errors: string[]): TilemapItemSpec | null {
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

export function validateEntitiesSpec(owner: string, raw: unknown, errors: string[]): EntitiesItemSpec | null {
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

export function validatePathSpec(owner: string, raw: unknown, errors: string[]): PathItemSpec | null {
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
export function validateLayeredSpec(
  owner: string,
  raw: Record<string, unknown>,
  errors: string[],
): LayeredItemSpec | null {
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

export function validateCollectionItemSpec(owner: string, raw: unknown, errors: string[]): CollectionItemSpec | null {
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
export function checkLayerGrids(owner: string, layers: Record<string, EditorLayerSpec>, errors: string[]): void {
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

export function validateLayerSpec(owner: string, raw: unknown, errors: string[]): EditorLayerSpec | null {
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

export function validateLayerConstraints(
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
