/**
 * MIRROR of the games repo's `tools/lib/editor-contract.ts` — EditorKit L0/L4.
 *
 * The games repo is the authority (its Check 31 validates every delivery); this
 * copy validates Studio drafts on write and regenerates the L1 content module
 * on publish, so the two files must stay byte-equivalent below the header.
 * `editor-contract.test.ts` pins the generator's output against a fixture so a
 * drift here fails CI rather than turning every editor publish into a gate
 * failure. Update both files in one paired change, like assemble-contract.
 */

export const EDITOR_FILE = 'EDITOR.json';
/** Where the generated L1 module lands inside a game dir. */
export const GENERATED_CONTENT_PATH = 'game/editor-content.ts';
/** SPEC.md frontmatter key that declares an editable game (rides the catalog). */
export const EDITOR_SPEC_KEY = 'editor';
export const EDITOR_SPEC_VALUE = 'content';

/** Hard ceiling on the declaration file, defaults included. */
export const MAX_EDITOR_JSON_BYTES = 64 * 1024;
export const MAX_COLLECTIONS = 4;
export const MAX_COLLECTION_ITEMS = 32;
export const MAX_TILES = 16;
export const MAX_CONSTRAINTS = 8;
/** Property limits — same numbers as world.fields (Check 22 / website world-schema). */
export const MAX_PROPERTIES = 12;
export const MAX_TEXT_LENGTH = 240;
export const MAX_ENUM_VALUES = 16;
export const MAX_GRID_COLS = 64;
export const MAX_GRID_ROWS = 64;

const KEY_PATTERN = /^[a-z][a-zA-Z0-9]{0,23}$/;
const TILE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,15}$/;
const PROPERTY_TYPES = ['text', 'int', 'number', 'enum', 'bool'] as const;

export interface EditorLabel {
  en: string;
  pl: string;
}

export interface TileSpec {
  key: string;
  /** Single printable ASCII character used in a map's `rows` strings. */
  char: string;
  label: EditorLabel;
}

export type PropertySpec =
  | { type: 'text'; max: number }
  | { type: 'int'; min: number; max: number }
  | { type: 'number'; min: number; max: number }
  | { type: 'enum'; values: string[] }
  | { type: 'bool' };

/** A tile-count rule the Studio checks live and the gate checks on publish. */
export type EditorConstraint =
  | { tile: string; min?: number; max?: number; exactly?: number }
  | { equalCounts: [string, string] };

export interface TilemapItemSpec {
  widget: 'tilemap';
  grid: { minCols: number; maxCols: number; minRows: number; maxRows: number };
  tiles: TileSpec[];
  properties: Record<string, PropertySpec>;
  constraints: EditorConstraint[];
}

export interface CollectionSpec {
  widget: 'collection';
  label: EditorLabel;
  itemLabel: EditorLabel;
  min: number;
  max: number;
  item: TilemapItemSpec;
  defaults: TilemapItemContent[];
}

export interface TilemapItemContent {
  properties: Record<string, unknown>;
  rows: string[];
}

export interface EditorDefinition {
  version: 1;
  content: Record<string, CollectionSpec>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

function validateProperties(
  owner: string,
  raw: unknown,
  errors: string[],
): Record<string, PropertySpec> {
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

function validateTilemapSpec(owner: string, raw: unknown, errors: string[]): TilemapItemSpec | null {
  if (!isPlainObject(raw)) {
    errors.push(`${owner}: "item" must be an object`);
    return null;
  }
  // The closed vocabulary: an unknown widget fails validation rather than
  // rendering as nothing. Editor ambition is bounded by what the Studio has
  // been taught, one widget at a time.
  if (raw.widget !== 'tilemap') {
    errors.push(`${owner}: unknown item widget "${String(raw.widget)}" (vocabulary v0: tilemap)`);
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
      keys.add(tile.key);
      chars.add(tile.char);
      tiles.push({ key: tile.key, char: tile.char, label: { en: tile.label.en, pl: tile.label.pl } });
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
  if (parsed.version !== 1) {
    errors.push('EDITOR.json "version" must be 1');
    return { definition: null, errors };
  }
  const unknownKeys = Object.keys(parsed).filter((key) => key !== 'version' && key !== 'content');
  if (unknownKeys.length > 0) {
    errors.push(`EDITOR.json has unknown top-level keys: ${unknownKeys.join(', ')}`);
  }
  if (!isPlainObject(parsed.content)) {
    errors.push('EDITOR.json needs a "content" object of collections');
    return { definition: null, errors };
  }
  const contentKeys = Object.keys(parsed.content);
  if (contentKeys.length === 0 || contentKeys.length > MAX_COLLECTIONS) {
    errors.push(`EDITOR.json "content" needs 1-${MAX_COLLECTIONS} collections`);
    return { definition: null, errors };
  }

  const content: Record<string, CollectionSpec> = {};
  for (const key of contentKeys) {
    const owner = `content.${key}`;
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
    const item = validateTilemapSpec(owner, raw.item, errors);
    if (!item) continue;

    if (!Array.isArray(raw.defaults)) {
      errors.push(`${owner}: needs a "defaults" array — the content the game ships with`);
      continue;
    }
    const spec: CollectionSpec = {
      widget: 'collection',
      label: { en: (raw.label as EditorLabel).en, pl: (raw.label as EditorLabel).pl },
      itemLabel: { en: (raw.itemLabel as EditorLabel).en, pl: (raw.itemLabel as EditorLabel).pl },
      min: raw.min as number,
      max: raw.max as number,
      item,
      defaults: raw.defaults as TilemapItemContent[],
    };
    // Defaults must satisfy the schema they ship with — the round-trip that
    // proves the pipeline works before a creator ever touches it.
    const defaultErrors = validateCollectionContent(spec, raw.defaults);
    errors.push(...defaultErrors.map((message) => `${owner} defaults: ${message}`));
    content[key] = spec;
  }

  if (errors.length > 0) return { definition: null, errors };
  return { definition: { version: 1, content }, errors };
}

function validateItemContent(spec: TilemapItemSpec, item: unknown, where: string): string[] {
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
    if (propertySpec.type === 'text') {
      if (typeof value !== 'string' || value.length > propertySpec.max) {
        errors.push(`${where}: property "${name}" must be a string of at most ${propertySpec.max} characters`);
      }
    } else if (propertySpec.type === 'int') {
      if (!Number.isInteger(value) || (value as number) < propertySpec.min || (value as number) > propertySpec.max) {
        errors.push(`${where}: property "${name}" must be an integer ${propertySpec.min}-${propertySpec.max}`);
      }
    } else if (propertySpec.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < propertySpec.min || value > propertySpec.max) {
        errors.push(`${where}: property "${name}" must be a number ${propertySpec.min}-${propertySpec.max}`);
      }
    } else if (propertySpec.type === 'enum') {
      if (typeof value !== 'string' || !propertySpec.values.includes(value)) {
        errors.push(`${where}: property "${name}" must be one of ${propertySpec.values.join(', ')}`);
      }
    } else if (typeof value !== 'boolean') {
      errors.push(`${where}: property "${name}" must be a boolean`);
    }
  }
  return errors;
}

function validateCollectionContent(spec: CollectionSpec, items: unknown): string[] {
  if (!Array.isArray(items)) return ['must be an array of items'];
  const errors: string[] = [];
  if (items.length < spec.min || items.length > spec.max) {
    errors.push(`has ${items.length} items (allowed ${spec.min}-${spec.max})`);
  }
  for (const [index, item] of items.entries()) {
    errors.push(...validateItemContent(spec.item, item, `item ${index + 1}`));
  }
  return errors;
}

/**
 * Validate a full content document (what a Studio draft or a publish carries)
 * against a definition. Shape: `{ <collectionKey>: TilemapItemContent[] }`.
 */
export function validateEditorContent(definition: EditorDefinition, content: unknown): string[] {
  if (!isPlainObject(content)) return ['content must be an object'];
  const errors: string[] = [];
  const declared = Object.keys(definition.content);
  for (const key of Object.keys(content)) {
    if (!declared.includes(key)) errors.push(`undeclared collection "${key}"`);
  }
  for (const key of declared) {
    const items = content[key];
    if (items === undefined) {
      errors.push(`missing collection "${key}"`);
      continue;
    }
    errors.push(...validateCollectionContent(definition.content[key], items).map((message) => `${key}: ${message}`));
  }
  return errors;
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
export function generateEditorContentModule(definition: EditorDefinition): string {
  const lines: string[] = [
    '// GENERATED by `npm run editor:gen` from EDITOR.json — do not edit by hand.',
    '// Edit EDITOR.json (or publish new content from the Creator Studio) and',
    '// regenerate. Check 31 fails when this file and EDITOR.json disagree.',
    '',
  ];
  const contentFields: string[] = [];
  for (const [key, spec] of Object.entries(definition.content)) {
    const itemType = `${typeName(key)}Item`;
    lines.push(`export interface ${itemType}Properties {`);
    for (const [name, propertySpec] of Object.entries(spec.item.properties)) {
      lines.push(`  ${name}: ${propertyTsType(propertySpec)};`);
    }
    lines.push('}', '');
    lines.push(`export interface ${itemType} {`);
    lines.push(`  properties: ${itemType}Properties;`);
    lines.push('  rows: string[];');
    lines.push('}', '');
    contentFields.push(`  ${key}: ${itemType}[];`);
  }
  lines.push('export interface EditorContent {');
  lines.push(...contentFields);
  lines.push('}', '');
  const defaults: Record<string, TilemapItemContent[]> = {};
  for (const [key, spec] of Object.entries(definition.content)) {
    defaults[key] = spec.defaults;
  }
  lines.push(`export const DEFAULT_CONTENT: EditorContent = ${JSON.stringify(defaults, null, 2)};`);
  lines.push('');
  return lines.join('\n');
}
