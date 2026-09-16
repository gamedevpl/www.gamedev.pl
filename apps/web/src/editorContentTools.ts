import {
  validateCollectionContent,
  validateEditorContent,
  validateItemContent,
  validateLayerContent,
  validateLayerReachable,
  valueProblem,
  type CollectionItemSpec,
  type CollectionSpec,
  type EditorDefinition,
  type EditorLayerSpec as ContractLayerSpec,
} from '@gamedevpl/contract';
import type {
  EditorCollectionSpec,
  EditorContentDoc,
  EditorEntityItemContent,
  EditorEntitiesLayerSpec,
  EditorLayerConstraint,
  EditorLayerSpec,
  EditorLayersDoc,
  EditorItemContent,
  EditorLabel,
  EditorPathItemContent,
  EditorTilemapItemContent,
} from './studioApi.js';
import { blankPathPoints, blankRows, declaredDefaults } from './editorContentDefaults.js';

export { valueProblem };

export type EditorPatchOperation = { path: Array<string | number>; value: unknown };

export function applyEditorPatch(
  document: EditorContentDoc,
  patch: unknown,
): { content: EditorContentDoc; error?: string } {
  if (patch && typeof patch === 'object' && !Array.isArray(patch) && 'content' in patch) {
    const replacement = (patch as { content?: unknown }).content;
    if (!replacement || typeof replacement !== 'object' || Array.isArray(replacement))
      return { content: document, error: 'replacement content must be an object' };
    return { content: replacement as EditorContentDoc };
  }
  const operations = Array.isArray(patch)
    ? patch
    : patch && typeof patch === 'object' && Array.isArray((patch as { ops?: unknown }).ops)
      ? (patch as { ops: unknown[] }).ops
      : [patch];
  if (operations.length > 64) return { content: document, error: 'too many patch operations' };
  let next: EditorContentDoc;
  try {
    next = JSON.parse(JSON.stringify(document)) as EditorContentDoc;
  } catch {
    return { content: document, error: 'content could not be copied' };
  }
  for (const operation of operations) {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation))
      return { content: document, error: 'invalid patch operation' };
    const raw = operation as Partial<EditorPatchOperation>;
    if (!Array.isArray(raw.path) || raw.path.length === 0 || raw.path.length > 24 || !('value' in raw))
      return { content: document, error: 'invalid patch path' };
    let target: unknown = next;
    for (let index = 0; index < raw.path.length - 1; index += 1) {
      const key = raw.path[index];
      if (
        (typeof key !== 'string' && typeof key !== 'number') ||
        key === '__proto__' ||
        key === 'constructor' ||
        key === 'prototype'
      )
        return { content: document, error: 'invalid patch key' };
      if (!target || typeof target !== 'object') return { content: document, error: 'patch path does not exist' };
      target = (target as Record<string | number, unknown>)[key];
    }
    const last = raw.path[raw.path.length - 1];
    if (
      (typeof last !== 'string' && typeof last !== 'number') ||
      last === '__proto__' ||
      last === 'constructor' ||
      last === 'prototype'
    )
      return { content: document, error: 'invalid patch key' };
    if (!target || typeof target !== 'object') return { content: document, error: 'patch target does not exist' };
    (target as Record<string | number, unknown>)[last] = raw.value;
  }
  return { content: next };
}

export function defaultCollectionKey(collections: Record<string, unknown>): string | null {
  return Object.keys(collections).find((key) => key.length > 0) ?? null;
}

export function defaultLayerKey(layers: Record<string, unknown>): string | null {
  return Object.keys(layers).find((key) => key.length > 0) ?? null;
}

export function defaultLayerTileKey(layers: Record<string, EditorLayerSpec>, key: string | null): string | null {
  const spec = key ? layers[key] : undefined;
  return spec?.widget === 'tilemap' ? (spec.tiles[0]?.key ?? null) : null;
}

export function isTilemapItem(item: unknown): item is EditorTilemapItemContent {
  if (!hasProperties(item)) return false;
  const rows = (item as { rows?: unknown }).rows;
  return Array.isArray(rows) && rows.every((row) => typeof row === 'string');
}

export function isPathItem(item: unknown): item is EditorPathItemContent {
  if (!hasProperties(item)) return false;
  const points = (item as { points?: unknown }).points;
  return Array.isArray(points) && points.every((point) => isPlainRecord(point) && isCoordinate(point));
}

function isCoordinate(point: Record<string, unknown>): boolean {
  return (
    typeof point.x === 'number' && typeof point.y === 'number' && Number.isFinite(point.x) && Number.isFinite(point.y)
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasProperties(value: unknown): value is { properties: Record<string, unknown> } {
  return isPlainRecord(value) && isPlainRecord(value.properties);
}

export type PathProblemMessages = {
  pointCount: (count: number, min: number, max: number) => string;
  outOfBounds: (index: number) => string;
  distinct: () => string;
  repeatedEnd: () => string;
};

function asLayerSpec(spec: EditorLayerSpec): ContractLayerSpec {
  return {
    ...spec,
    properties: spec.properties ?? {},
    constraints: spec.constraints ?? [],
    ...(spec.widget === 'entities' ? { min: spec.min ?? 0, max: spec.max ?? 64 } : {}),
  } as ContractLayerSpec;
}

function asItemSpec(spec: EditorCollectionSpec['item']): CollectionItemSpec {
  if (spec.widget === 'layered') {
    return {
      ...spec,
      properties: spec.properties ?? {},
      constraints: spec.constraints ?? [],
      layers: Object.fromEntries(Object.entries(spec.layers ?? {}).map(([key, layer]) => [key, asLayerSpec(layer)])),
    } as CollectionItemSpec;
  }
  if (spec.widget === 'path') return { ...spec, properties: spec.properties ?? {} } as CollectionItemSpec;
  return { ...spec, properties: spec.properties ?? {}, constraints: spec.constraints ?? [] } as CollectionItemSpec;
}

function asCollectionSpec(spec: EditorCollectionSpec): CollectionSpec {
  return {
    ...spec,
    min: spec.min ?? 0,
    max: spec.max ?? 32,
    item: asItemSpec(spec.item),
    defaults: spec.defaults ?? [],
  } as CollectionSpec;
}

function stripWhere(message: string, where: string): string {
  const prefix = `${where}: `;
  return message.startsWith(prefix) ? message.slice(prefix.length) : message;
}

export function itemProblems(
  spec: EditorCollectionSpec['item'],
  item: EditorItemContent,
  _name: (label: EditorLabel) => string,
  _pathMessages?: PathProblemMessages,
): string[] {
  return validateItemContent(asItemSpec(spec), item, 'item').map((message) => stripWhere(message, 'item'));
}

export function collectionProblems(spec: EditorCollectionSpec, items: EditorItemContent[]): string[] {
  return validateCollectionContent(asCollectionSpec(spec), items).filter(
    (message) => !/^item \d+: /.test(message) || message.includes(' duplicates '),
  );
}

export function layerProblems(
  spec: EditorLayerSpec,
  value: unknown,
  _name: (label: EditorLabel) => string,
  _pathMessages?: PathProblemMessages,
): string[] {
  return validateLayerContent(asLayerSpec(spec), value, 'layer').map((message) => stripWhere(message, 'layer'));
}

export function layeredProblems(
  layers: Record<string, EditorLayerSpec>,
  constraints: EditorLayerConstraint[] | undefined,
  content: EditorLayersDoc,
): string[] {
  const normalized = Object.fromEntries(Object.entries(layers).map(([key, spec]) => [key, asLayerSpec(spec)]));
  return (constraints ?? []).flatMap((rule) =>
    validateLayerReachable(rule.reachable, normalized, content as Record<string, unknown>, 'layers'),
  );
}

export function documentProblems(definition: EditorDefinition, content: EditorContentDoc): string[] {
  return validateEditorContent(definition, content);
}

export function specFieldClass(problem: string | null, extra = ''): string {
  return ['editor-prop', extra, problem ? 'is-invalid' : ''].filter(Boolean).join(' ');
}

export function setCell(
  item: EditorTilemapItemContent,
  row: number,
  col: number,
  char: string,
): EditorTilemapItemContent {
  const rows = item.rows.slice();
  rows[row] = rows[row].slice(0, col) + char + rows[row].slice(col + 1);
  return { ...item, rows };
}

export function blankItem(spec: EditorCollectionSpec['item']): EditorItemContent {
  const properties = declaredDefaults(spec.properties);
  if (spec.widget === 'path') return { properties, points: blankPathPoints(spec) };
  if (spec.widget !== 'tilemap') return { properties };
  return { properties, rows: blankRows(spec) };
}

export function blankLayerEntity(spec: EditorEntitiesLayerSpec): EditorEntityItemContent {
  return { properties: declaredDefaults(spec.properties) };
}
