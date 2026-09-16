// L4 content validator shared by Studio and the API.
import {
  LAYERS_KEY,
  PARAMS_KEY,
  isPlainObject,
  type CollectionItemSpec,
  type CollectionSpec,
  type EditorDefinition,
  type EditorLayerSpec,
  type EntitiesItemSpec,
  type LayeredItemSpec,
  type PathItemSpec,
  type PathPoint,
  type PropertySpec,
} from './editor-kit.js';
import { unreachable, validateLayerReachable } from './editor-validate-reach.js';

export function valueProblem(spec: PropertySpec, value: unknown): string | null {
  if (spec.type === 'text') {
    if (typeof value !== 'string' || value.length > spec.max) {
      return `must be a string of at most ${spec.max} characters`;
    }
  } else if (spec.type === 'int') {
    if (!Number.isInteger(value) || (value as number) < spec.min || (value as number) > spec.max) {
      return `must be an integer ${spec.min}-${spec.max}`;
    }
  } else if (spec.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < spec.min || value > spec.max) {
      return `must be a number ${spec.min}-${spec.max}`;
    }
  } else if (spec.type === 'enum') {
    if (typeof value !== 'string' || !spec.values.includes(value)) {
      return `must be one of ${spec.values.join(', ')}`;
    }
  } else if (typeof value !== 'boolean') {
    return 'must be a boolean';
  }
  return null;
}

function validateEntityItemContent(spec: EntitiesItemSpec, item: unknown, where: string): string[] {
  const errors: string[] = [];
  if (!isPlainObject(item)) return [`${where}: must be an object`];
  const unknown = Object.keys(item).filter((key) => key !== 'properties');
  if (unknown.length > 0) errors.push(`${where}: unknown keys ${unknown.join(', ')}`);
  const properties = item.properties;
  if (!isPlainObject(properties)) return [...errors, `${where}: "properties" must be an object`];
  for (const name of Object.keys(properties)) {
    if (!(name in spec.properties)) errors.push(`${where}: undeclared property "${name}"`);
  }
  for (const [name, propertySpec] of Object.entries(spec.properties)) {
    const value = properties[name];
    if (value === undefined) {
      errors.push(`${where}: missing property "${name}"`);
      continue;
    }
    const problem = valueProblem(propertySpec, value);
    if (problem) errors.push(`${where}: property "${name}" ${problem}`);
  }
  return errors;
}

function validatePathItemContent(spec: PathItemSpec, item: unknown, where: string): string[] {
  const errors: string[] = [];
  if (!isPlainObject(item)) return [`${where}: must be an object`];
  const unknown = Object.keys(item).filter((key) => key !== 'properties' && key !== 'points');
  if (unknown.length > 0) errors.push(`${where}: unknown keys ${unknown.join(', ')}`);
  const points = item.points;
  if (!Array.isArray(points)) {
    errors.push(`${where}: "points" must be an array`);
  } else {
    if (points.length < spec.minPoints || points.length > spec.maxPoints) {
      errors.push(`${where}: has ${points.length} points (allowed ${spec.minPoints}-${spec.maxPoints})`);
    }
    for (const [index, point] of points.entries()) {
      if (
        !isPlainObject(point) ||
        Object.keys(point).some((key) => key !== 'x' && key !== 'y') ||
        !Number.isInteger(point.x) ||
        !Number.isInteger(point.y) ||
        (point.x as number) < 0 ||
        (point.x as number) >= spec.gridCols ||
        (point.y as number) < 0 ||
        (point.y as number) >= spec.gridRows
      ) {
        errors.push(
          `${where}: point ${index + 1} must contain integer x/y inside 0-${spec.gridCols - 1} by 0-${spec.gridRows - 1}`,
        );
      }
    }
    if (spec.closed && points.length > 0) {
      const validPoints = points.filter(
        (point): point is PathPoint => isPlainObject(point) && Number.isInteger(point.x) && Number.isInteger(point.y),
      );
      const distinct = new Set(validPoints.map((point) => `${point.x},${point.y}`));
      if (distinct.size < 3) errors.push(`${where}: a closed path needs at least 3 distinct points`);
      const first = validPoints[0];
      const last = validPoints[validPoints.length - 1];
      if (first && last && first.x === last.x && first.y === last.y) {
        errors.push(`${where}: a closed path must not repeat its first point at the end; closure is implicit`);
      }
    }
  }
  const properties = item.properties;
  if (!isPlainObject(properties)) return [...errors, `${where}: "properties" must be an object`];
  for (const name of Object.keys(properties)) {
    if (!(name in spec.properties)) errors.push(`${where}: undeclared property "${name}"`);
  }
  for (const [name, propertySpec] of Object.entries(spec.properties)) {
    const value = properties[name];
    if (value === undefined) {
      errors.push(`${where}: missing property "${name}"`);
      continue;
    }
    const problem = valueProblem(propertySpec, value);
    if (problem) errors.push(`${where}: property "${name}" ${problem}`);
  }
  return errors;
}

export function propertyValueErrors(specs: Record<string, PropertySpec>, properties: unknown, where: string): string[] {
  if (!isPlainObject(properties)) return [`${where}: "properties" must be an object`];
  const errors: string[] = [];
  for (const name of Object.keys(properties)) {
    if (!(name in specs)) errors.push(`${where}: undeclared property "${name}"`);
  }
  for (const [name, spec] of Object.entries(specs)) {
    const value = properties[name];
    if (value === undefined) {
      errors.push(`${where}: missing property "${name}"`);
      continue;
    }
    const problem = valueProblem(spec, value);
    if (problem) errors.push(`${where}: property "${name}" ${problem}`);
  }
  return errors;
}

function validateLayeredItemContent(spec: LayeredItemSpec, item: unknown, where: string): string[] {
  if (!isPlainObject(item)) return [`${where}: must be an object`];
  const errors: string[] = [];
  const unknown = Object.keys(item).filter((key) => key !== 'properties' && key !== LAYERS_KEY);
  if (unknown.length > 0) errors.push(`${where}: unknown keys ${unknown.join(', ')}`);
  errors.push(...propertyValueErrors(spec.properties, item.properties, where));

  const layers = item[LAYERS_KEY];
  if (!isPlainObject(layers)) return [...errors, `${where}: "layers" must be an object of layer values`];
  for (const key of Object.keys(layers)) {
    if (!(key in spec.layers)) errors.push(`${where}: undeclared layer "${key}"`);
  }
  for (const [key, layerSpec] of Object.entries(spec.layers)) {
    if (layers[key] === undefined) {
      errors.push(`${where}: missing layer "${key}"`);
      continue;
    }
    errors.push(...validateLayerContent(layerSpec, layers[key], `${where}.${key}`));
  }
  for (const [index, rule] of spec.constraints.entries()) {
    errors.push(...validateLayerReachable(rule.reachable, spec.layers, layers, `${where} constraints[${index}]`));
  }
  return errors;
}

export function validateItemContent(spec: CollectionItemSpec, item: unknown, where: string): string[] {
  if (spec.widget === 'entities') return validateEntityItemContent(spec, item, where);
  if (spec.widget === 'path') return validatePathItemContent(spec, item, where);
  if (spec.widget === 'layered') return validateLayeredItemContent(spec, item, where);
  const errors: string[] = [];
  if (!isPlainObject(item)) return [`${where}: must be an object`];
  const unknown = Object.keys(item).filter((key) => key !== 'properties' && key !== 'rows');
  if (unknown.length > 0) errors.push(`${where}: unknown keys ${unknown.join(', ')}`);

  const rows = item.rows;
  if (!Array.isArray(rows) || rows.some((row) => typeof row !== 'string')) {
    errors.push(`${where}: "rows" must be an array of strings`);
  } else {
    if (rows.length < spec.grid.minRows || rows.length > spec.grid.maxRows) {
      errors.push(`${where}: has ${rows.length} rows (allowed ${spec.grid.minRows}-${spec.grid.maxRows})`);
    }
    const width = rows.length > 0 ? (rows[0] as string).length : 0;
    if (width < spec.grid.minCols || width > spec.grid.maxCols) {
      errors.push(`${where}: rows are ${width} wide (allowed ${spec.grid.minCols}-${spec.grid.maxCols})`);
    }
    const chars = new Set(spec.tiles.map((tile) => tile.char));
    const counts = new Map<string, number>(spec.tiles.map((tile) => [tile.key, 0]));
    const charToKey = new Map(spec.tiles.map((tile) => [tile.char, tile.key]));
    for (const [index, row] of (rows as string[]).entries()) {
      if (row.length !== width) {
        errors.push(`${where}: row ${index + 1} is ${row.length} wide, expected ${width}`);
        continue;
      }
      for (const char of row) {
        if (!chars.has(char)) {
          errors.push(`${where}: row ${index + 1} uses undeclared tile character "${char}"`);
          break;
        }
        const key = charToKey.get(char) as string;
        counts.set(key, (counts.get(key) as number) + 1);
      }
    }
    for (const rule of spec.constraints) {
      if ('equalCounts' in rule) {
        const [a, b] = rule.equalCounts;
        if (counts.get(a) !== counts.get(b)) {
          errors.push(`${where}: needs the same number of "${a}" and "${b}" (${counts.get(a)} vs ${counts.get(b)})`);
        }
        continue;
      }
      if ('reachable' in rule) {
        errors.push(...unreachable(rule.reachable, rows as string[], charToKey, where));
        continue;
      }
      if ('uniqueBy' in rule) continue;
      const count = counts.get(rule.tile) ?? 0;
      if (rule.exactly !== undefined && count !== rule.exactly) {
        errors.push(`${where}: needs exactly ${rule.exactly} "${rule.tile}" (has ${count})`);
      }
      if (rule.min !== undefined && count < rule.min) {
        errors.push(`${where}: needs at least ${rule.min} "${rule.tile}" (has ${count})`);
      }
      if (rule.max !== undefined && count > rule.max) {
        errors.push(`${where}: allows at most ${rule.max} "${rule.tile}" (has ${count})`);
      }
    }
  }

  const properties = item.properties;
  if (!isPlainObject(properties)) {
    errors.push(`${where}: "properties" must be an object`);
    return errors;
  }
  const declared = spec.properties;
  for (const name of Object.keys(properties)) {
    if (!(name in declared)) errors.push(`${where}: undeclared property "${name}"`);
  }
  for (const [name, propertySpec] of Object.entries(declared)) {
    const value = properties[name];
    if (value === undefined) {
      errors.push(`${where}: missing property "${name}"`);
      continue;
    }
    const problem = valueProblem(propertySpec, value);
    if (problem) errors.push(`${where}: property "${name}" ${problem}`);
  }
  return errors;
}

export function validateCollectionContent(spec: CollectionSpec, items: unknown): string[] {
  if (!Array.isArray(items)) return ['must be an array of items'];
  const errors: string[] = [];
  if (items.length < spec.min || items.length > spec.max) {
    errors.push(`has ${items.length} items (allowed ${spec.min}-${spec.max})`);
  }
  for (const [index, item] of items.entries()) {
    errors.push(...validateItemContent(spec.item, item, `item ${index + 1}`));
  }
  if (spec.item.widget === 'entities') {
    for (const rule of spec.item.constraints) {
      if (!('uniqueBy' in rule)) continue;
      const firstByValue = new Map<string, number>();
      for (const [index, rawItem] of items.entries()) {
        if (!isPlainObject(rawItem) || !isPlainObject(rawItem.properties)) continue;
        const value = rawItem.properties[rule.uniqueBy];
        const encoded = JSON.stringify(value);
        if (encoded === undefined) continue;
        const firstIndex = firstByValue.get(encoded);
        if (firstIndex !== undefined) {
          errors.push(`item ${index + 1}: property "${rule.uniqueBy}" duplicates item ${firstIndex + 1}`);
        } else {
          firstByValue.set(encoded, index);
        }
      }
    }
  }
  return errors;
}

export function validateLayerContent(spec: EditorLayerSpec, value: unknown, where: string): string[] {
  if (spec.widget === 'tilemap') return validateItemContent(spec, value, where);
  return validateCollectionContent(
    {
      widget: 'collection',
      label: spec.label,
      itemLabel: spec.label,
      min: spec.min,
      max: spec.max,
      item: spec,
      defaults: [],
    },
    value,
  ).map((message) => `${where}: ${message}`);
}

export function validateEditorContent(definition: EditorDefinition, content: unknown): string[] {
  if (!isPlainObject(content)) return ['content must be an object'];
  const errors: string[] = [];
  const declared = Object.keys(definition.content);
  const declaredLayers = Object.keys(definition.layers ?? {});
  for (const key of Object.keys(content)) {
    if (key === PARAMS_KEY) {
      if (!definition.params) errors.push(`undeclared collection "${key}"`);
      continue;
    }
    if (key === LAYERS_KEY) {
      if (!definition.layers) errors.push(`undeclared content "${key}"`);
      continue;
    }
    if (!declared.includes(key)) errors.push(`undeclared collection "${key}"`);
  }
  if (definition.params) {
    const values = content[PARAMS_KEY];
    if (values === undefined) {
      errors.push('missing "params" values');
    } else if (!isPlainObject(values)) {
      errors.push('params: must be an object of values');
    } else {
      for (const name of Object.keys(values)) {
        if (!(name in definition.params)) errors.push(`params: undeclared param "${name}"`);
      }
      for (const [name, spec] of Object.entries(definition.params)) {
        const value = values[name];
        if (value === undefined) {
          errors.push(`params: missing "${name}"`);
          continue;
        }
        const problem = valueProblem(spec, value);
        if (problem) errors.push(`params: "${name}" ${problem}`);
      }
    }
  }
  for (const key of declared) {
    const items = content[key];
    if (items === undefined) {
      errors.push(`missing collection "${key}"`);
      continue;
    }
    errors.push(...validateCollectionContent(definition.content[key], items).map((message) => `${key}: ${message}`));
  }
  if (definition.layers) {
    const layers = content[LAYERS_KEY];
    if (layers === undefined) {
      errors.push('missing "layers" values');
    } else if (!isPlainObject(layers)) {
      errors.push('layers: must be an object of layer values');
    } else {
      for (const key of Object.keys(layers)) {
        if (!declaredLayers.includes(key)) errors.push(`layers: undeclared layer "${key}"`);
      }
      for (const [key, spec] of Object.entries(definition.layers)) {
        const value = layers[key];
        if (value === undefined) {
          errors.push(`layers: missing "${key}"`);
          continue;
        }
        errors.push(...validateLayerContent(spec, value, `layers.${key}`));
      }
      for (const rule of definition.constraints ?? []) {
        errors.push(...validateLayerReachable(rule.reachable, definition.layers, layers, 'layers'));
      }
    }
  }
  return errors;
}
