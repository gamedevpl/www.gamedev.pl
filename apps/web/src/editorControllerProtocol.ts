import { MP_PROTOCOL_VERSION, PROPERTY_TYPES, type PropertyType } from '@gamedevpl/contract';
import type { EditorContentDoc } from './studioApi.js';

export const BRIDGE_NAMESPACE = 'gdp';
export const PROTOCOL_VERSION = MP_PROTOCOL_VERSION;

export type GdpEnvelope<T extends string> = {
  ns: typeof BRIDGE_NAMESPACE;
  v: typeof PROTOCOL_VERSION;
  t: T;
};

export type EditorSelection = { collection: string; index: number };
export type EditorControllerSelection = { layer: string; index: number | null };
export type EditorUiLabel = string | { en: string; pl: string };
export type EditorUiField = {
  name: string;
  label: EditorUiLabel;
  type: PropertyType;
  value?: string | number | boolean;
  min?: number;
  max?: number;
  options?: string[];
};
export type EditorUiNode =
  | { type: 'rail' | 'panel' | 'group'; children: EditorUiNode[]; title?: EditorUiLabel }
  | { type: 'tabs'; tabs: Array<{ id: string; label: EditorUiLabel }>; active?: string }
  | {
      type: 'board';
      layers: string[];
      active?: string;
      rows?: string[];
      tiles?: Array<{ char: string; color?: string }>;
    }
  | { type: 'toolbar'; tools: string[]; active?: string }
  | {
      type: 'palette';
      layer?: string;
      tiles?: Array<{ key: string; char: string; label: EditorUiLabel; color?: string }>;
    }
  | { type: 'propertySheet'; layer: string; index: number; fields?: EditorUiField[] }
  | {
      type: 'list';
      items: Array<{ id: string; label: EditorUiLabel; detail?: EditorUiLabel }>;
      selected?: string;
    }
  | { type: 'note'; text: EditorUiLabel }
  | { type: 'check'; ok: boolean; text: EditorUiLabel };
export type EditorUiDocument = EditorUiNode | EditorUiNode[];

export type EditorUiRequest = {
  id: string;
  spec: {
    kind: 'form' | 'confirm' | 'toast';
    title?: EditorUiLabel;
    message?: EditorUiLabel;
    text?: EditorUiLabel;
    fields?: EditorUiField[];
  };
};
export type EditorControllerChange = { id: string; patch: unknown };
export type EditorCanvasBox = {
  width: number;
  height: number;
  x: number;
  y: number;
  insetX?: number;
  insetY?: number;
  scale?: number;
};

export type EditorControllerInbound =
  | (GdpEnvelope<'editor:hello'> & { controller: boolean })
  | (GdpEnvelope<'editor:ui'> & { doc: EditorUiDocument })
  | (GdpEnvelope<'editor:change'> & EditorControllerChange)
  | (GdpEnvelope<'editor:select'> & { selection: EditorControllerSelection | null })
  | (GdpEnvelope<'editor:canvas'> & { box: EditorCanvasBox })
  | (GdpEnvelope<'editor:ui-request'> & EditorUiRequest)
  | (GdpEnvelope<'editor:check'> & { ok: boolean; problems: string[] })
  | (GdpEnvelope<'editor:ack'> & { ok: boolean; error?: string })
  | (GdpEnvelope<'editor:controller-error'> & { error?: string });

export type EditorControllerOutbound =
  | (GdpEnvelope<'editor:content'> & { content: EditorContentDoc; selection?: EditorSelection })
  | (GdpEnvelope<'editor:event'> & { event: Record<string, unknown> })
  | (GdpEnvelope<'editor:select'> & { selection: EditorControllerSelection | null })
  | (GdpEnvelope<'editor:ui-result'> & { id: string; value: unknown; cancelled: boolean })
  | (GdpEnvelope<'editor:change:ack'> & { id: string; ok: boolean; error?: string })
  | (GdpEnvelope<'editor:mode'> & { mode: 'fallback' });

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLabel(value: unknown): value is EditorUiLabel {
  return (
    typeof value === 'string' ||
    (isObject(value) && typeof value.en === 'string' && typeof value.pl === 'string')
  );
}

function parseUiField(value: unknown): EditorUiField | null {
  if (!isObject(value) || typeof value.name !== 'string' || !isLabel(value.label)) return null;
  if (!(PROPERTY_TYPES as readonly string[]).includes(String(value.type))) return null;
  if (value.value !== undefined && !['string', 'number', 'boolean'].includes(typeof value.value)) return null;
  if (typeof value.value === 'number' && !Number.isFinite(value.value)) return null;
  if (value.min !== undefined && !finite(value.min)) return null;
  if (value.max !== undefined && !finite(value.max)) return null;
  if (value.options !== undefined) {
    if (!Array.isArray(value.options) || value.options.length > 32) return null;
    if (!value.options.every((entry) => typeof entry === 'string')) return null;
  }
  const field: EditorUiField = {
    name: value.name,
    label: value.label,
    type: value.type as PropertyType,
  };
  if (typeof value.value === 'string' || typeof value.value === 'boolean') field.value = value.value;
  if (typeof value.value === 'number' && Number.isFinite(value.value)) field.value = value.value;
  if (typeof value.min === 'number' && Number.isFinite(value.min)) field.min = value.min;
  if (typeof value.max === 'number' && Number.isFinite(value.max)) field.max = value.max;
  if (Array.isArray(value.options)) field.options = value.options;
  return field;
}

function parsePaletteTile(value: unknown) {
  if (!isObject(value)) return null;
  if (
    typeof value.key !== 'string' ||
    value.key.length === 0 ||
    value.key.length > 64 ||
    typeof value.char !== 'string' ||
    value.char.length === 0 ||
    value.char.length > 4 ||
    !isLabel(value.label) ||
    (value.color !== undefined && typeof value.color !== 'string')
  )
    return null;
  return {
    key: value.key,
    char: value.char,
    label: value.label,
    ...(typeof value.color === 'string' ? { color: value.color } : {}),
  };
}

function parseBoardTile(value: unknown) {
  if (!isObject(value) || typeof value.char !== 'string' || value.char.length === 0 || value.char.length > 4) return null;
  if (value.color !== undefined && typeof value.color !== 'string') return null;
  return { char: value.char, ...(typeof value.color === 'string' ? { color: value.color } : {}) };
}

type UiBudget = { nodes: number };

function parseUiNode(value: unknown, depth: number, budget: UiBudget): EditorUiNode | null {
  budget.nodes += 1;
  if (depth > 5 || budget.nodes > 256 || !isObject(value)) return null;
  const type = value.type;
  if (type === 'rail' || type === 'panel' || type === 'group') {
    if (!Array.isArray(value.children) || value.children.length > 32) return null;
    const children = value.children.map((child) => parseUiNode(child, depth + 1, budget));
    if (children.some((child) => child === null)) return null;
    if (value.title !== undefined && !isLabel(value.title)) return null;
    return { type, children: children as EditorUiNode[], ...(value.title === undefined ? {} : { title: value.title }) };
  }
  if (type === 'tabs') {
    if (!Array.isArray(value.tabs) || value.tabs.length > 32) return null;
    const tabs = value.tabs.map((tab) =>
      isObject(tab) && typeof tab.id === 'string' && isLabel(tab.label) ? { id: tab.id, label: tab.label } : null,
    );
    if (tabs.some((tab) => tab === null)) return null;
    if (value.active !== undefined && typeof value.active !== 'string') return null;
    return {
      type,
      tabs: tabs as Array<{ id: string; label: EditorUiLabel }>,
      ...(typeof value.active === 'string' ? { active: value.active } : {}),
    };
  }
  if (type === 'board') {
    if (!Array.isArray(value.layers) || value.layers.length > 32 || !value.layers.every((layer) => typeof layer === 'string'))
      return null;
    if (value.active !== undefined && typeof value.active !== 'string') return null;
    if (value.rows !== undefined) {
      if (!Array.isArray(value.rows) || value.rows.length > 128 || !value.rows.every((row) => typeof row === 'string'))
        return null;
    }
    if (value.tiles !== undefined && (!Array.isArray(value.tiles) || value.tiles.length > 32)) return null;
    const tiles = value.tiles === undefined ? undefined : value.tiles.map(parseBoardTile);
    if (tiles?.some((tile) => tile === null)) return null;
    return {
      type,
      layers: value.layers as string[],
      ...(typeof value.active === 'string' ? { active: value.active } : {}),
      ...(value.rows === undefined ? {} : { rows: value.rows as string[] }),
      ...(tiles === undefined ? {} : { tiles: tiles as Array<{ char: string; color?: string }> }),
    };
  }
  if (type === 'toolbar') {
    if (value.active !== undefined && typeof value.active !== 'string') return null;
    return Array.isArray(value.tools) && value.tools.length <= 32 && value.tools.every((tool) => typeof tool === 'string')
      ? { type, tools: value.tools as string[], ...(typeof value.active === 'string' ? { active: value.active } : {}) }
      : null;
  }
  if (type === 'palette') {
    if (value.layer !== undefined && typeof value.layer !== 'string') return null;
    if (value.tiles !== undefined && (!Array.isArray(value.tiles) || value.tiles.length > 32)) return null;
    const tiles = value.tiles === undefined ? undefined : value.tiles.map(parsePaletteTile);
    if (tiles?.some((tile) => tile === null)) return null;
    return {
      type,
      ...(typeof value.layer === 'string' ? { layer: value.layer } : {}),
      ...(tiles === undefined ? {} : { tiles: tiles as NonNullable<Extract<EditorUiNode, { type: 'palette' }>['tiles']> }),
    };
  }
  if (type === 'propertySheet') {
    if (typeof value.layer !== 'string' || !Number.isInteger(value.index) || (value.index as number) < 0) return null;
    if (value.fields !== undefined && (!Array.isArray(value.fields) || value.fields.length > 32)) return null;
    const fields = value.fields === undefined ? undefined : value.fields.map(parseUiField);
    if (fields?.some((field) => field === null)) return null;
    return {
      type,
      layer: value.layer,
      index: value.index as number,
      ...(fields === undefined ? {} : { fields: fields as EditorUiField[] }),
    };
  }
  if (type === 'list') {
    if (!Array.isArray(value.items) || value.items.length > 128) return null;
    const items = value.items.map((item) => {
      if (!isObject(item) || typeof item.id !== 'string' || !isLabel(item.label)) return null;
      if (item.detail !== undefined && !isLabel(item.detail)) return null;
      return { id: item.id, label: item.label, ...(item.detail === undefined ? {} : { detail: item.detail }) };
    });
    if (items.some((item) => item === null)) return null;
    if (value.selected !== undefined && typeof value.selected !== 'string') return null;
    return {
      type,
      items: items as Array<{ id: string; label: EditorUiLabel; detail?: EditorUiLabel }>,
      ...(typeof value.selected === 'string' ? { selected: value.selected } : {}),
    };
  }
  if (type === 'note') return isLabel(value.text) ? { type, text: value.text } : null;
  if (type === 'check') return typeof value.ok === 'boolean' && isLabel(value.text) ? { type, ok: value.ok, text: value.text } : null;
  return null;
}

function parseUiDocument(value: unknown): EditorUiDocument | null {
  const budget = { nodes: 0 };
  if (!Array.isArray(value)) return parseUiNode(value, 0, budget);
  if (value.length > 32) return null;
  const nodes = value.map((node) => parseUiNode(node, 0, budget));
  return nodes.some((node) => node === null) ? null : (nodes as EditorUiNode[]);
}

function parseUiRequest(id: unknown, value: unknown): EditorUiRequest | null {
  if (typeof id !== 'string' || id.length === 0 || id.length > 128 || !isObject(value)) return null;
  if (!['form', 'confirm', 'toast'].includes(String(value.kind))) return null;
  const spec: EditorUiRequest['spec'] = { kind: value.kind as EditorUiRequest['spec']['kind'] };
  for (const key of ['title', 'message', 'text'] as const) {
    if (value[key] === undefined) continue;
    if (!isLabel(value[key])) return null;
    spec[key] = value[key];
  }
  if (value.fields !== undefined) {
    if (!Array.isArray(value.fields) || value.fields.length > 32) return null;
    const fields = value.fields.map(parseUiField);
    if (fields.some((field) => field === null)) return null;
    spec.fields = fields as EditorUiField[];
  }
  return { id, spec };
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseCanvasBox(value: unknown): EditorCanvasBox | null {
  if (!isObject(value) || !finite(value.width) || value.width <= 0 || !finite(value.height) || value.height <= 0)
    return null;
  if (!finite(value.x) || !finite(value.y)) return null;
  if (value.insetX !== undefined && (!finite(value.insetX) || value.insetX < 0)) return null;
  if (value.insetY !== undefined && (!finite(value.insetY) || value.insetY < 0)) return null;
  if (value.scale !== undefined && (!finite(value.scale) || value.scale <= 0)) return null;
  return {
    width: value.width,
    height: value.height,
    x: value.x,
    y: value.y,
    ...(value.insetX === undefined ? {} : { insetX: value.insetX }),
    ...(value.insetY === undefined ? {} : { insetY: value.insetY }),
    ...(value.scale === undefined ? {} : { scale: value.scale }),
  };
}

export function parseEditorControllerEnvelope(raw: unknown): EditorControllerInbound | null {
  if (!isObject(raw) || raw.ns !== BRIDGE_NAMESPACE || raw.v !== PROTOCOL_VERSION) return null;
  if (raw.t === 'editor:hello') {
    if (raw.controller !== undefined && typeof raw.controller !== 'boolean') return null;
    return { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: raw.t, controller: raw.controller === true };
  }
  if (raw.t === 'editor:ui') {
    const doc = parseUiDocument(raw.doc);
    return doc ? { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: raw.t, doc } : null;
  }
  if (raw.t === 'editor:change') {
    return typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 128
      ? { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: raw.t, id: raw.id, patch: raw.patch }
      : null;
  }
  if (raw.t === 'editor:select') {
    if (raw.selection === null) return { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: raw.t, selection: null };
    if (!isObject(raw.selection) || typeof raw.selection.layer !== 'string') return null;
    if (raw.selection.index !== null && (!Number.isInteger(raw.selection.index) || (raw.selection.index as number) < 0))
      return null;
    return {
      ns: BRIDGE_NAMESPACE,
      v: PROTOCOL_VERSION,
      t: raw.t,
      selection: { layer: raw.selection.layer, index: raw.selection.index as number | null },
    };
  }
  if (raw.t === 'editor:canvas') {
    const box = parseCanvasBox(raw.box);
    return box ? { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: raw.t, box } : null;
  }
  if (raw.t === 'editor:ui-request') {
    const request = parseUiRequest(raw.id, raw.spec);
    return request ? { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: raw.t, ...request } : null;
  }
  if (raw.t === 'editor:check') {
    if (
      typeof raw.ok !== 'boolean' ||
      !Array.isArray(raw.problems) ||
      raw.problems.length > 12 ||
      !raw.problems.every((entry) => typeof entry === 'string')
    )
      return null;
    return { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: raw.t, ok: raw.ok, problems: raw.problems };
  }
  if (raw.t === 'editor:ack') {
    if (typeof raw.ok !== 'boolean' || (raw.error !== undefined && typeof raw.error !== 'string')) return null;
    return { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: raw.t, ok: raw.ok, ...(raw.error === undefined ? {} : { error: raw.error }) };
  }
  if (raw.t === 'editor:controller-error') {
    if (raw.error !== undefined && typeof raw.error !== 'string') return null;
    return { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: raw.t, ...(raw.error === undefined ? {} : { error: raw.error }) };
  }
  return null;
}
