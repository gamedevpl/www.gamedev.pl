import {
  LAYERS_KEY,
  PARAMS_KEY,
  type CollectionItemSpec,
  type EditorDefinition,
  type EditorLayerSpec,
  type PropertySpec,
} from './editor-contract.js';

// Shape and bounds block a draft; its rules wait for Publish.
export function draftShapeProblems(definition: EditorDefinition, content: unknown): string[] {
  if (!isPlainObject(content)) return ['content must be an object'];
  const problems: string[] = [];
  const declared = Object.keys(definition.content);

  for (const key of Object.keys(content)) {
    if (key === PARAMS_KEY || key === LAYERS_KEY) continue;
    if (!declared.includes(key)) problems.push(`undeclared collection "${key}"`);
  }

  if (definition.params) {
    const values = content[PARAMS_KEY];
    if (values !== undefined && !isPlainObject(values)) problems.push(`"${PARAMS_KEY}" must be an object`);
    else if (isPlainObject(values)) {
      for (const [name, spec] of Object.entries(definition.params)) {
        problems.push(...propertyProblems(`${PARAMS_KEY}.${name}`, spec, values[name]));
      }
    }
  }

  for (const [key, spec] of Object.entries(definition.content)) {
    const items = content[key];
    if (items === undefined) continue;
    if (!Array.isArray(items)) {
      problems.push(`"${key}" must be an array`);
      continue;
    }
    if (items.length > spec.max) problems.push(`"${key}" has ${items.length} items; at most ${spec.max}`);
    items.forEach((item, index) => problems.push(...itemShapeProblems(`${key}[${index}]`, spec.item, item)));
  }

  const layerValues = content[LAYERS_KEY];
  if (layerValues !== undefined) {
    if (!isPlainObject(layerValues)) problems.push(`"${LAYERS_KEY}" must be an object`);
    else
      for (const [key, spec] of Object.entries(definition.layers ?? {})) {
        problems.push(...layerShapeProblems(`${LAYERS_KEY}.${key}`, spec, layerValues[key]));
      }
  }

  return problems;
}

function itemShapeProblems(owner: string, spec: CollectionItemSpec, item: unknown): string[] {
  if (!isPlainObject(item)) return [`${owner} must be an object`];
  const problems = propertiesShapeProblems(owner, spec.properties, item.properties);
  // The shell knows an item by its container; absent is not empty.
  if (spec.widget === 'tilemap') {
    if (item.rows === undefined) problems.push(`${owner}.rows is missing`);
    else problems.push(...rowsShapeProblems(owner, spec.grid.maxRows, spec.grid.maxCols, item.rows));
  }
  if (spec.widget === 'path') {
    if (item.points === undefined) problems.push(`${owner}.points is missing`);
    else problems.push(...pointsShapeProblems(owner, spec.maxPoints, item.points));
  }
  if (spec.widget === 'layered') {
    if (!isPlainObject(item.layers)) problems.push(`${owner}.layers must be an object`);
    else
      for (const [key, layer] of Object.entries(spec.layers)) {
        problems.push(...layerShapeProblems(`${owner}.layers.${key}`, layer, item.layers[key]));
      }
  }
  return problems;
}

function layerShapeProblems(owner: string, spec: EditorLayerSpec, value: unknown): string[] {
  if (value === undefined) return [];
  if (spec.widget === 'tilemap') {
    if (!isPlainObject(value)) return [`${owner} must be an object`];
    if (value.rows === undefined) return [`${owner}.rows is missing`];
    return [
      ...propertiesShapeProblems(owner, spec.properties, value.properties),
      ...rowsShapeProblems(owner, spec.grid.maxRows, spec.grid.maxCols, value.rows),
    ];
  }
  if (!Array.isArray(value)) return [`${owner} must be an array`];
  const problems: string[] = [];
  if (value.length > spec.max) problems.push(`${owner} has ${value.length} items; at most ${spec.max}`);
  value.forEach((entry, index) => {
    if (!isPlainObject(entry)) problems.push(`${owner}[${index}] must be an object`);
    else problems.push(...propertiesShapeProblems(`${owner}[${index}]`, spec.properties, entry.properties));
  });
  return problems;
}

// Consumers read `properties` without asking, so it is required.
function propertiesShapeProblems(
  owner: string,
  specs: Record<string, PropertySpec> | undefined,
  values: unknown,
): string[] {
  if (!isPlainObject(values)) return [`${owner}.properties must be an object`];
  const problems: string[] = [];
  for (const [name, spec] of Object.entries(specs ?? {})) {
    problems.push(...propertyProblems(`${owner}.properties.${name}`, spec, values[name]));
  }
  return problems;
}

// Declared type and bound; the range is Publish's to judge.
function propertyProblems(owner: string, spec: PropertySpec, value: unknown): string[] {
  if (value === undefined) return [];
  if (spec.type === 'bool') return typeof value === 'boolean' ? [] : [`${owner} must be a boolean`];
  if (spec.type === 'enum') return typeof value === 'string' ? [] : [`${owner} must be a string`];
  if (spec.type === 'int' || spec.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return [`${owner} must be a finite number`];
    return spec.type === 'int' && !Number.isInteger(value) ? [`${owner} must be a whole number`] : [];
  }
  if (typeof value !== 'string') return [`${owner} must be a string`];
  return value.length > spec.max ? [`${owner} is ${value.length} characters; at most ${spec.max}`] : [];
}

function rowsShapeProblems(owner: string, maxRows: number, maxCols: number, rows: unknown): string[] {
  if (rows === undefined) return [];
  if (!Array.isArray(rows)) return [`${owner}.rows must be an array`];
  const problems: string[] = [];
  if (rows.length > maxRows) problems.push(`${owner}.rows has ${rows.length} rows; at most ${maxRows}`);
  rows.forEach((row, index) => {
    if (typeof row !== 'string') problems.push(`${owner}.rows[${index}] must be a string`);
    else if (row.length > maxCols) problems.push(`${owner}.rows[${index}] is ${row.length} wide; at most ${maxCols}`);
  });
  return problems;
}

function pointsShapeProblems(owner: string, maxPoints: number, points: unknown): string[] {
  if (points === undefined) return [];
  if (!Array.isArray(points)) return [`${owner}.points must be an array`];
  const problems: string[] = [];
  if (points.length > maxPoints) problems.push(`${owner}.points has ${points.length}; at most ${maxPoints}`);
  points.forEach((point, index) => {
    if (!isPlainObject(point)) problems.push(`${owner}.points[${index}] must be an object`);
  });
  return problems;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
