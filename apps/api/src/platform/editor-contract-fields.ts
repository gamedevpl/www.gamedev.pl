// Label, property and param validators for EDITOR.json.

import {
  EDITOR_CONTENT_FILE,
  MAX_ENUM_VALUES,
  MAX_PARAMS,
  MAX_PROPERTIES,
  MAX_TEXT_LENGTH,
  isPlainObject,
  valueProblem,
  type EditorLabel,
  type ParamSpec,
  type ParamValue,
  type PropertySpec,
} from '@gamedevpl/contract';

export const KEY_PATTERN = /^[a-z][a-zA-Z0-9]{0,23}$/;
export const TILE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,15}$/;
export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
export const PROPERTY_TYPES = ['text', 'int', 'number', 'enum', 'bool'] as const;

export function isLabel(value: unknown): value is EditorLabel {
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

export function validateProperties(owner: string, raw: unknown, errors: string[]): Record<string, PropertySpec> {
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

export function validateParams(raw: unknown, errors: string[], requireDefaults: boolean): Record<string, ParamSpec> {
  const out: Record<string, ParamSpec> = {};
  if (!isPlainObject(raw)) {
    errors.push('"params" must be an object mapping param names to declarations');
    return out;
  }
  const names = Object.keys(raw);
  if (names.length > MAX_PARAMS) {
    errors.push(`"params" declares ${names.length} tunables (limit ${MAX_PARAMS})`);
  }
  // Tunables follow item property rules exactly.
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
