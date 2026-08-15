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
export const EDITOR_CONTENT_FILE = 'EDITOR.content.json';
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
export const MAX_PATH_POINTS = 256;
/** Game-wide scalar tunables ("params") — same property vocabulary, one value each. */
export const MAX_PARAMS = 16;
/** Reserved content-document key param values ride under; illegal as a collection name. */
export const PARAMS_KEY = 'params';

const KEY_PATTERN = /^[a-z][a-zA-Z0-9]{0,23}$/;
const TILE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,15}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
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
  /**
   * How this tile looks in the Studio's painter, as `#rrggbb`.
   *
   * Optional, and the reason it exists: without it the editor invents a generic
   * palette, so a creator paints in one set of colors and plays in another —
   * and two tiles the *game* draws distinctly can land on near-identical greys.
   * The game already knows its own art direction, so it declares it here and
   * the painter matches what the player will see. The platform still owns the
   * chrome; this is the one piece of look the game is authoritative about.
   */
  color?: string;
}

export type PropertySpec =
  | { type: 'text'; max: number }
  | { type: 'int'; min: number; max: number }
  | { type: 'number'; min: number; max: number }
  | { type: 'enum'; values: string[] }
  | { type: 'bool' };

export type ParamValue = string | number | boolean;

/**
 * A game-wide scalar tunable: one declared property plus the default players
 * get. The bilingual label is load-bearing, not cosmetic — it is how the
 * Studio's Tuning panel names the slider and how the assist router resolves
 * "the dog" to `dogScale`, so it must say what the value means in the game.
 */
export type ParamSpec = PropertySpec & { label: EditorLabel; default: ParamValue };

/**
 * A rule the Studio checks live and the gate checks on publish.
 *
 * `reachable` is the one that is not about counting, and it exists because
 * counting could not catch the failure that matters most: a map whose goal is
 * walled off is schema-valid, gate-green, and unplayable. The pilot shipped
 * exactly that — two seeds sealed behind hedges — and nothing in the pipeline
 * noticed, because reachability is the one structural property of a tilemap
 * that a game cannot express as a tile count.
 *
 * It stays game-agnostic: the game says which tile kind you start from, which
 * kinds block movement, and which kinds must be reachable. The platform runs a
 * four-way flood fill and knows nothing else about the game.
 */
export type EditorConstraint =
  | { tile: string; min?: number; max?: number; exactly?: number }
  | { equalCounts: [string, string] }
  | { reachable: { from: string; blockedBy: string[]; require: string[] } }
  | { uniqueBy: string };

export interface TilemapItemSpec {
  widget: 'tilemap';
  grid: { minCols: number; maxCols: number; minRows: number; maxRows: number };
  tiles: TileSpec[];
  properties: Record<string, PropertySpec>;
  constraints: EditorConstraint[];
}

export interface EntitiesItemSpec {
  widget: 'entities';
  properties: Record<string, PropertySpec>;
  constraints: EditorConstraint[];
}

export interface PathItemSpec {
  widget: 'path';
  gridCols: number;
  gridRows: number;
  minPoints: number;
  maxPoints: number;
  closed: boolean;
  properties: Record<string, PropertySpec>;
}

export type CollectionItemSpec = TilemapItemSpec | EntitiesItemSpec | PathItemSpec;

export interface CollectionSpec {
  widget: 'collection';
  label: EditorLabel;
  itemLabel: EditorLabel;
  min: number;
  max: number;
  item: CollectionItemSpec;
  defaults: Array<TilemapItemContent | EntityItemContent | PathItemContent>;
}

export interface TilemapItemContent {
  properties: Record<string, unknown>;
  rows: string[];
}

export interface EntityItemContent {
  properties: Record<string, unknown>;
}

export interface PathPoint {
  x: number;
  y: number;
}

export interface PathItemContent {
  properties: Record<string, unknown>;
  points: PathPoint[];
}

export type EditorContentDocument = Record<
  string,
  Array<TilemapItemContent | EntityItemContent | PathItemContent> | Record<string, ParamValue>
>;

export type EditorVersion = 1 | 2;

export interface EditorDefinition {
  version: EditorVersion;
  params?: Record<string, ParamSpec>;
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

/**
 * One value against one declared property/param type. Returns the problem's
 * tail ("must be …") or null; callers prefix who the value belongs to. Shared
 * between item properties, param defaults, and param values so all three
 * refuse a value with the same words.
 */
function valueProblem(spec: PropertySpec, value: unknown): string | null {
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

function validateCollectionItemSpec(owner: string, raw: unknown, errors: string[]): CollectionItemSpec | null {
  if (isPlainObject(raw) && raw.widget === 'entities') return validateEntitiesSpec(owner, raw, errors);
  if (isPlainObject(raw) && raw.widget === 'tilemap') return validateTilemapSpec(owner, raw, errors);
  if (isPlainObject(raw) && raw.widget === 'path') return validatePathSpec(owner, raw, errors);
  errors.push(
    `${owner}: unknown item widget "${String(isPlainObject(raw) ? raw.widget : undefined)}" (vocabulary: tilemap, entities, path)`,
  );
  return null;
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
  const unknownKeys = Object.keys(parsed).filter((key) => key !== 'version' && key !== 'content' && key !== PARAMS_KEY);
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
  const contentKeys = isPlainObject(parsed.content) ? Object.keys(parsed.content) : [];
  if (contentKeys.length > MAX_COLLECTIONS || (contentKeys.length === 0 && !hasParams)) {
    errors.push(`EDITOR.json "content" needs 1-${MAX_COLLECTIONS} collections`);
    return { definition: null, errors };
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

  if (errors.length > 0) return { definition: null, errors };
  return { definition: { version: parsed.version, ...(hasParams ? { params } : {}), content }, errors };
}

/**
 * Four-way flood fill from every `from` tile, refusing to cross `blockedBy`
 * tiles, reporting any `require` tile it never reaches.
 *
 * Walking onto a required tile is what collecting it means in every game this
 * serves, so required tiles are themselves walkable unless the game also
 * declared them blocking — the rule reads "can the player get to it", not "can
 * the player walk past it".
 */
function unreachable(
  rule: { from: string; blockedBy: string[]; require: string[] },
  rows: string[],
  charToKey: Map<string, string>,
  where: string,
): string[] {
  const height = rows.length;
  const width = height > 0 ? rows[0].length : 0;
  const keyAt = (row: number, col: number) => charToKey.get(rows[row][col]);
  const blocked = new Set(rule.blockedBy);
  const required = new Set(rule.require);

  const seen = new Set<number>();
  const queue: number[] = [];
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (keyAt(row, col) !== rule.from) continue;
      const index = row * width + col;
      seen.add(index);
      queue.push(index);
    }
  }
  // No origin at all is a separate failure the count rules already describe
  // (`exactly 1 start`), so this rule stays quiet rather than piling on.
  if (queue.length === 0) return [];

  while (queue.length > 0) {
    const index = queue.shift() as number;
    const row = Math.floor(index / width);
    const col = index % width;
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (nextRow < 0 || nextCol < 0 || nextRow >= height || nextCol >= width) continue;
      if (rows[nextRow].length !== width) continue;
      const key = keyAt(nextRow, nextCol);
      if (key === undefined || blocked.has(key)) continue;
      const nextIndex = nextRow * width + nextCol;
      if (seen.has(nextIndex)) continue;
      seen.add(nextIndex);
      queue.push(nextIndex);
    }
  }

  const missed: string[] = [];
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const key = keyAt(row, col);
      if (key === undefined || !required.has(key)) continue;
      if (!seen.has(row * width + col)) missed.push(`${key} at row ${row + 1}, column ${col + 1}`);
    }
  }
  if (missed.length === 0) return [];
  return [
    `${where}: walled off from "${rule.from}" — ${missed.join('; ')}. ` +
      'Every required tile must be reachable, or the game cannot be finished.',
  ];
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

function validateItemContent(spec: CollectionItemSpec, item: unknown, where: string): string[] {
  if (spec.widget === 'entities') return validateEntityItemContent(spec, item, where);
  if (spec.widget === 'path') return validatePathItemContent(spec, item, where);
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

function validateCollectionContent(spec: CollectionSpec, items: unknown): string[] {
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

/**
 * Validate a full content document (what a Studio draft or a publish carries)
 * against a definition. Shape: `{ <collectionKey>: EditorItemContent[] }`.
 */
export function validateEditorContent(definition: EditorDefinition, content: unknown): string[] {
  if (!isPlainObject(content)) return ['content must be an object'];
  const errors: string[] = [];
  const declared = Object.keys(definition.content);
  for (const key of Object.keys(content)) {
    if (key === PARAMS_KEY) {
      if (!definition.params) errors.push(`undeclared collection "${key}"`);
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
    lines.push(`export interface ${itemType} {`);
    lines.push(`  properties: ${itemType}Properties;`);
    if (spec.item.widget === 'tilemap') lines.push('  rows: string[];');
    if (spec.item.widget === 'path') lines.push('  points: Array<{ x: number; y: number }>;');
    lines.push('}', '');
    contentFields.push(`  ${key}: ${itemType}[];`);
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
  lines.push(`export const DEFAULT_CONTENT: EditorContent = ${JSON.stringify(defaults, null, 2)};`);
  lines.push('');
  return lines.join('\n');
}
