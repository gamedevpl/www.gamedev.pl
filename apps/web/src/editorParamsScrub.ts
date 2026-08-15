// Produces new EDITOR.json text for a scrub.

import type { EditorParamSpec, EditorParamValue } from './studioApi.js';

export type ParsedEditorJson = { params: Record<string, EditorParamSpec>; rest: Record<string, unknown> } | null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A param failing this shape just gets no control, not an error.
function isParamSpec(value: unknown): value is EditorParamSpec {
  if (!isPlainObject(value) || !('type' in value) || !('default' in value)) return false;
  const type = value.type;
  return type === 'text' || type === 'int' || type === 'number' || type === 'enum' || type === 'bool';
}

// Parses EDITOR.json text into its declared params, or null if unparseable.
export function parseEditorParams(text: string): ParsedEditorJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  const { params, ...rest } = parsed;
  if (params === undefined) return { params: {}, rest };
  if (!isPlainObject(params)) return null;
  const out: Record<string, EditorParamSpec> = {};
  for (const [key, spec] of Object.entries(params)) {
    if (isParamSpec(spec)) out[key] = spec;
  }
  return { params: out, rest };
}

// Rewrites `key`'s default — the whole diff a scrub produces.
export function withParamDefault(text: string, key: string, value: EditorParamValue): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed) || !isPlainObject(parsed.params) || !isParamSpec(parsed.params[key])) return null;
  const next = { ...parsed, params: { ...parsed.params, [key]: { ...parsed.params[key], default: value } } };
  return `${JSON.stringify(next, null, 2)}\n`;
}

type NumericRange = { type: 'int' | 'number'; min: number; max: number };

// Reasonable step for the range: 1 for int, else 1%.
export function scrubStep(spec: NumericRange): number {
  if (spec.type === 'int') return 1;
  const span = spec.max - spec.min;
  return span > 0 ? span / 100 : 0.01;
}

// Clamps to range and, for int, rounds.
export function clampParamValue(spec: NumericRange, value: number): number {
  const clamped = Math.min(spec.max, Math.max(spec.min, value));
  return spec.type === 'int' ? Math.round(clamped) : clamped;
}
