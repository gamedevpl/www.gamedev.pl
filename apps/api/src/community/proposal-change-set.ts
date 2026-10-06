import {
  EDITOR_CONTENT_FILE,
  EDITOR_FILE,
  GENERATED_CONTENT_PATH,
  PARAMS_KEY,
  parseEditorDefinition,
  type EditorDefinition,
} from '../creation/editor-contract.js';
import type { SourceFile } from '../delivery/games-store.js';
import { diffFile } from './proposal-diff.js';

// A compact, agent-facing description of what a proposal changes.

export interface ProposalFileChange {
  path: string;
  added: number;
  removed: number;
  // Too large or binary to diff; counts are whole-file.
  approximate?: true;
}

export interface ProposalParamChange {
  key: string;
  from: unknown;
  to: unknown;
}

export interface ProposalContentChange {
  collection: string;
  summary: string;
}

export type EditorParams = Record<string, string | number | boolean>;

// Creation's EditorKit bake, injected so community stays inside its bucket.
export type EditorBake = (
  files: SourceFile[],
  definition: EditorDefinition | null,
  params?: EditorParams,
  content?: Record<string, unknown>,
) => SourceFile[];

export interface ProposalChangeSet {
  files: ProposalFileChange[];
  params: ProposalParamChange[];
  content: ProposalContentChange[];
  // Only EditorKit data moved, inside an unchanged declaration.
  dataOnly: boolean;
  // Target values of changed params/collections, for a data-only apply.
  data: { params: EditorParams; content: Record<string, unknown> };
}

// Files above this many lines are counted, not diffed.
export const MAX_DIFFABLE_LINES = 5000;
export const MAX_DIFFABLE_BYTES = 512 * 1024;

const DATA_PATHS = new Set([EDITOR_FILE, EDITOR_CONTENT_FILE, GENERATED_CONTENT_PATH]);

export function isDiffableText(content: string | null): boolean {
  if (content === null) return true;
  if (content.includes('\u0000')) return false;
  return Buffer.byteLength(content, 'utf8') <= MAX_DIFFABLE_BYTES && content.split('\n').length <= MAX_DIFFABLE_LINES;
}

function lineCount(content: string | null): number {
  if (!content) return 0;
  const lines = content.split('\n');
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}

// Key-order-independent JSON, so equal data compares equal.
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

interface EditorData {
  definition: EditorDefinition;
  // EDITOR.json with its default values removed (v1) or as-is (v2).
  shape: string;
  params: Record<string, unknown>;
  collections: Record<string, unknown>;
}

function parseJsonObject(content: string | undefined): Record<string, unknown> | null {
  if (content === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readEditorData(byPath: Map<string, string>): EditorData | null {
  const source = byPath.get(EDITOR_FILE);
  if (source === undefined) return null;
  const { definition } = parseEditorDefinition(source);
  const raw = parseJsonObject(source);
  if (!definition || !raw) return null;

  if (definition.version === 2) {
    const document = parseJsonObject(byPath.get(EDITOR_CONTENT_FILE));
    if (!document) return null;
    const { [PARAMS_KEY]: params, ...collections } = document;
    const paramValues = params && typeof params === 'object' ? (params as Record<string, unknown>) : {};
    return { definition, shape: stableJson(raw), params: paramValues, collections };
  }

  const params: Record<string, unknown> = {};
  const collections: Record<string, unknown> = {};
  const rawParams = (raw.params ?? {}) as Record<string, Record<string, unknown>>;
  const rawContent = (raw.content ?? {}) as Record<string, Record<string, unknown>>;
  const shapeParams: Record<string, unknown> = {};
  const shapeContent: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(rawParams)) {
    const { default: value, ...rest } = spec;
    params[key] = value;
    shapeParams[key] = rest;
  }
  for (const [key, spec] of Object.entries(rawContent)) {
    const { defaults, ...rest } = spec;
    collections[key] = defaults;
    shapeContent[key] = rest;
  }
  return { definition, shape: stableJson({ ...raw, params: shapeParams, content: shapeContent }), params, collections };
}

function describeCollection(from: unknown, to: unknown): string {
  if (Array.isArray(from) && Array.isArray(to)) {
    return from.length === to.length ? `${to.length} items, edited` : `${from.length} → ${to.length} items`;
  }
  if (from === undefined) return 'added';
  if (to === undefined) return 'removed';
  return 'edited';
}

// Every key whose value differs between two maps.
function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => stableJson(before[key]) !== stableJson(after[key]))
    .sort();
}

export function summarizeProposalChange(base: SourceFile[], proposed: SourceFile[]): ProposalChangeSet {
  const before = new Map(base.map((file) => [file.path, file.content]));
  const after = new Map(proposed.map((file) => [file.path, file.content]));
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();

  const files: ProposalFileChange[] = [];
  for (const path of paths) {
    const a = before.get(path) ?? null;
    const b = after.get(path) ?? null;
    if (a === b) continue;
    if (!isDiffableText(a) || !isDiffableText(b)) {
      files.push({ path, added: lineCount(b), removed: lineCount(a), approximate: true });
      continue;
    }
    const diff = diffFile(path, a, b, Number.POSITIVE_INFINITY);
    if (diff) files.push({ path, added: diff.additions, removed: diff.deletions });
  }

  const params: ProposalParamChange[] = [];
  const content: ProposalContentChange[] = [];
  const data: ProposalChangeSet['data'] = { params: {}, content: {} };
  const from = readEditorData(before);
  const to = readEditorData(after);
  if (from && to) {
    for (const key of changedKeys(from.params, to.params)) {
      params.push({ key, from: from.params[key], to: to.params[key] });
      const value = to.params[key];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        data.params[key] = value;
      }
    }
    for (const key of changedKeys(from.collections, to.collections)) {
      content.push({ collection: key, summary: describeCollection(from.collections[key], to.collections[key]) });
      data.content[key] = to.collections[key];
    }
  }

  const onlyDataFiles = files.length > 0 && files.every((file) => DATA_PATHS.has(file.path));
  const dataOnly =
    onlyDataFiles &&
    from !== null &&
    to !== null &&
    from.shape === to.shape &&
    params.length + content.length > 0 &&
    Object.keys(data.params).length === params.length;
  return { files, params, content, dataOnly, data };
}

// Bakes a data-only change onto live files; null if it diverges.
export function applyProposalData(
  live: SourceFile[],
  proposed: SourceFile[],
  change: ProposalChangeSet,
  bake: EditorBake,
): SourceFile[] | null {
  if (!change.dataOnly) return null;
  const byPath = new Map(live.map((file) => [file.path, file.content]));
  const current = readEditorData(byPath);
  if (!current) return null;
  const copy = live.map((file) => ({ ...file }));
  const baked = bake(copy, current.definition, change.data.params, change.data.content);
  const check = summarizeProposalChange(baked, proposed);
  return check.params.length === 0 && check.content.length === 0 ? baked : null;
}
