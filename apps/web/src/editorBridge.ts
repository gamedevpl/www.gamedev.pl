import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { PROPERTY_TYPES, type PropertyType } from '@gamedevpl/contract';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { fetchGameEditor, type EditorContentDoc } from './studioApi.js';
import { recordEditorStep } from './visitTelemetry.js';

// Collection item the painter is showing.
export type EditorSelection = {
  collection: string;
  index: number;
};

export type EditorContentPush = (content: EditorContentDoc, selection?: EditorSelection | null) => void;

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
export type EditorControllerState = {
  status: 'connecting' | 'ready' | 'failed';
  view: EditorUiNode | EditorUiNode[] | null;
  reason: string | null;
  selected: EditorControllerSelection | null;
  pendingChange: EditorControllerChange | null;
  uiRequest: EditorUiRequest | null;
  checks: { ok: boolean; problems: string[] } | null;
  canvasBox: {
    width: number;
    height: number;
    x: number;
    y: number;
    insetX?: number;
    insetY?: number;
    scale?: number;
  } | null;
  sendEvent: (event: Record<string, unknown>) => void;
  sendSelection: (selection: EditorControllerSelection | null) => void;
  sendUiResult: (id: string, value: unknown, cancelled?: boolean) => void;
  acknowledgeChange: (id: string, ok: boolean, error?: string) => void;
  useFallback: (reason: string) => void;
};

function isLabel(value: unknown): value is EditorUiLabel {
  return (
    typeof value === 'string' ||
    (typeof value === 'object' &&
      value !== null &&
      typeof (value as { en?: unknown }).en === 'string' &&
      typeof (value as { pl?: unknown }).pl === 'string')
  );
}

function parseUiField(value: unknown): EditorUiField | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.name !== 'string' || !isLabel(raw.label)) return null;
  if (!(PROPERTY_TYPES as readonly string[]).includes(String(raw.type))) return null;
  if (raw.value !== undefined && !['string', 'number', 'boolean'].includes(typeof raw.value)) return null;
  const field: EditorUiField = { name: raw.name, label: raw.label, type: raw.type as EditorUiField['type'] };
  if (typeof raw.value === 'string' || typeof raw.value === 'number' || typeof raw.value === 'boolean')
    field.value = raw.value;
  if (typeof raw.min === 'number' && Number.isFinite(raw.min)) field.min = raw.min;
  if (typeof raw.max === 'number' && Number.isFinite(raw.max)) field.max = raw.max;
  if (Array.isArray(raw.options) && raw.options.every((entry) => typeof entry === 'string'))
    field.options = raw.options.slice(0, 32) as string[];
  return field;
}

function parseUiPaletteTile(
  value: unknown,
): { key: string; char: string; label: EditorUiLabel; color?: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.key !== 'string' ||
    raw.key.length === 0 ||
    raw.key.length > 64 ||
    typeof raw.char !== 'string' ||
    raw.char.length === 0 ||
    raw.char.length > 4 ||
    !isLabel(raw.label)
  )
    return null;
  if (raw.color !== undefined && typeof raw.color !== 'string') return null;
  return {
    key: raw.key,
    char: raw.char,
    label: raw.label,
    ...(typeof raw.color === 'string' ? { color: raw.color } : {}),
  };
}

function parseUiNode(value: unknown, depth = 0): EditorUiNode | null {
  if (depth > 5 || !value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const type = raw.type;
  if (type === 'rail' || type === 'panel' || type === 'group') {
    if (!Array.isArray(raw.children) || raw.children.length > 32) return null;
    const children = raw.children.map((child) => parseUiNode(child, depth + 1));
    if (children.some((child) => child === null)) return null;
    if (raw.title !== undefined && !isLabel(raw.title)) return null;
    return { type, children: children as EditorUiNode[], ...(raw.title === undefined ? {} : { title: raw.title }) };
  }
  if (type === 'tabs') {
    if (!Array.isArray(raw.tabs) || raw.tabs.length > 32) return null;
    const tabs = raw.tabs.map((tab) => {
      if (!tab || typeof tab !== 'object') return null;
      const entry = tab as Record<string, unknown>;
      return typeof entry.id === 'string' && isLabel(entry.label) ? { id: entry.id, label: entry.label } : null;
    });
    if (tabs.some((tab) => tab === null)) return null;
    return {
      type,
      tabs: tabs as Array<{ id: string; label: EditorUiLabel }>,
      ...(typeof raw.active === 'string' ? { active: raw.active } : {}),
    };
  }
  if (type === 'board') {
    if (!Array.isArray(raw.layers) || raw.layers.length > 32 || !raw.layers.every((layer) => typeof layer === 'string'))
      return null;
    const node: EditorUiNode = { type, layers: raw.layers as string[] };
    if (typeof raw.active === 'string') (node as { active?: string }).active = raw.active;
    if (Array.isArray(raw.rows) && raw.rows.length <= 128 && raw.rows.every((row) => typeof row === 'string'))
      (node as { rows?: string[] }).rows = raw.rows as string[];
    return node;
  }
  if (type === 'toolbar') {
    return Array.isArray(raw.tools) && raw.tools.length <= 32 && raw.tools.every((tool) => typeof tool === 'string')
      ? { type, tools: raw.tools as string[], ...(typeof raw.active === 'string' ? { active: raw.active } : {}) }
      : null;
  }
  if (type === 'palette') {
    if (raw.layer !== undefined && typeof raw.layer !== 'string') return null;
    if (raw.tiles !== undefined && (!Array.isArray(raw.tiles) || raw.tiles.length > 32)) return null;
    const tiles = raw.tiles === undefined ? undefined : raw.tiles.map(parseUiPaletteTile);
    if (tiles?.some((tile) => tile === null)) return null;
    return {
      type,
      ...(typeof raw.layer === 'string' ? { layer: raw.layer } : {}),
      ...(tiles === undefined
        ? {}
        : { tiles: tiles as Array<{ key: string; char: string; label: EditorUiLabel; color?: string }> }),
    };
  }
  if (type === 'propertySheet') {
    if (typeof raw.layer !== 'string' || typeof raw.index !== 'number' || !Number.isInteger(raw.index) || raw.index < 0)
      return null;
    if (raw.fields !== undefined && (!Array.isArray(raw.fields) || raw.fields.length > 32)) return null;
    const fields = raw.fields === undefined ? undefined : raw.fields.map(parseUiField);
    if (fields?.some((field) => field === null)) return null;
    return { type, layer: raw.layer, index: raw.index, ...(fields ? { fields: fields as EditorUiField[] } : {}) };
  }
  if (type === 'list') {
    if (!Array.isArray(raw.items) || raw.items.length > 128) return null;
    const items = raw.items.map((item) => {
      if (!item || typeof item !== 'object') return null;
      const entry = item as Record<string, unknown>;
      return typeof entry.id === 'string' && isLabel(entry.label)
        ? {
            id: entry.id,
            label: entry.label,
            ...(entry.detail === undefined ? {} : { detail: isLabel(entry.detail) ? entry.detail : null }),
          }
        : null;
    });
    if (items.some((item) => item === null || ('detail' in item && item.detail === null))) return null;
    return {
      type,
      items: items as Array<{ id: string; label: EditorUiLabel; detail?: EditorUiLabel }>,
      ...(typeof raw.selected === 'string' ? { selected: raw.selected } : {}),
    };
  }
  if (type === 'note') return isLabel(raw.text) ? { type, text: raw.text } : null;
  if (type === 'check')
    return typeof raw.ok === 'boolean' && isLabel(raw.text) ? { type, ok: raw.ok, text: raw.text } : null;
  return null;
}

function parseUiDocument(value: unknown): EditorUiNode | EditorUiNode[] | null {
  if (Array.isArray(value)) {
    if (value.length > 32) return null;
    const nodes = value.map((node) => parseUiNode(node));
    return nodes.some((node) => node === null) ? null : (nodes as EditorUiNode[]);
  }
  return parseUiNode(value);
}

function parseUiRequest(value: unknown): EditorUiRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || raw.id.length === 0 || raw.id.length > 128) return null;
  if (!raw.spec || typeof raw.spec !== 'object' || Array.isArray(raw.spec)) return null;
  const spec = raw.spec as Record<string, unknown>;
  if (!['form', 'confirm', 'toast'].includes(String(spec.kind))) return null;
  const parsedSpec: EditorUiRequest['spec'] = { kind: spec.kind as EditorUiRequest['spec']['kind'] };
  for (const key of ['title', 'message', 'text'] as const) {
    if (spec[key] !== undefined) {
      if (!isLabel(spec[key])) return null;
      parsedSpec[key] = spec[key];
    }
  }
  if (spec.fields !== undefined) {
    if (!Array.isArray(spec.fields) || spec.fields.length > 32) return null;
    const fields = spec.fields.map(parseUiField);
    if (fields.some((field) => field === null)) return null;
    parsedSpec.fields = fields as EditorUiField[];
  }
  return { id: raw.id, spec: parsedSpec };
}

export function editorContentMessage(content: EditorContentDoc, selection?: EditorSelection | null) {
  return {
    ns: BRIDGE_NAMESPACE,
    v: PROTOCOL_VERSION,
    t: 'editor:content' as const,
    content,
    ...(selection ? { selection } : {}),
  };
}

/**
 * The shell half of EditorKit's draft hot-apply (the game half is the games
 * repo's `shared/modules/editor.ts`).
 *
 * When the creator playtests their own editable game, the game's editor module
 * announces itself with `editor:hello`; this hook answers with the creator's
 * saved draft (`editor:content`), and the game re-enters play on the new
 * content — the edit-to-playing loop, seconds, no build.
 *
 * Deliberately pull-based and owner-only: nothing is pushed until the game
 * *inside this creator's own playtest frame* asks, the draft comes from the
 * owner-scoped editor API (anyone else gets 404), and a game without the editor
 * module never says hello, so every other playtest carries zero editor traffic.
 * Everything arriving from the frame is hostile input: only the `editor:hello`
 * type is read, and nothing from the game is echoed back beyond the draft.
 *
 * `push` is the one exception to pull-based (§E tier 1, Code-surface param
 * edits): posts straight to the frame regardless of the `active` gate, since
 * the stage stays mounted under every posture. Also updates what the next
 * `editor:hello` gets answered with, so a later restart cannot regress it.
 */
export function useEditorDraftBridge(
  frameRef: MutableRefObject<HTMLIFrameElement | null>,
  active: boolean,
  slug: string | undefined,
  editable: boolean,
): { push: EditorContentPush; controller: EditorControllerState | null } {
  /** What the next `editor:hello` gets answered with. */
  const lastContentRef = useRef<EditorContentDoc | null>(null);
  const lastSelectionRef = useRef<EditorSelection | null>(null);
  const controllerHelloRef = useRef(false);
  const controllerTimerRef = useRef<number | null>(null);
  const [controllerStatus, setControllerStatus] = useState<EditorControllerState['status'] | null>(null);
  const [controllerView, setControllerView] = useState<EditorUiNode | EditorUiNode[] | null>(null);
  const [controllerReason, setControllerReason] = useState<string | null>(null);
  const [controllerSelection, setControllerSelection] = useState<EditorControllerSelection | null>(null);
  const [pendingChange, setPendingChange] = useState<EditorControllerChange | null>(null);
  const [uiRequest, setUiRequest] = useState<EditorUiRequest | null>(null);
  const [controllerChecks, setControllerChecks] = useState<{ ok: boolean; problems: string[] } | null>(null);
  const [canvasBox, setCanvasBox] = useState<EditorControllerState['canvasBox']>(null);
  const controllerStatusRef = useRef(controllerStatus);
  controllerStatusRef.current = controllerStatus;
  const controllerViewRef = useRef(controllerView);
  controllerViewRef.current = controllerView;

  useEffect(() => {
    lastContentRef.current = null;
    lastSelectionRef.current = null;
    controllerHelloRef.current = false;
    setControllerStatus(null);
    setControllerView(null);
    setControllerReason(null);
    setControllerSelection(null);
    setPendingChange(null);
    setUiRequest(null);
    setControllerChecks(null);
    setCanvasBox(null);
  }, [slug]);

  useEffect(() => {
    if (!active || !slug || !editable) return;

    let disposed = false;
    let controllerExpected = false;
    /** One fetch per playtest session; a hello after the first reuses it. */
    let draftPromise: Promise<EditorContentDoc | null> | null = null;

    function loadDraft(): Promise<EditorContentDoc | null> {
      draftPromise ??= fetchGameEditor(slug as string)
        .then((state) => {
          controllerExpected = state.definition.controller === true;
          if (controllerExpected && !controllerHelloRef.current) expectController();
          return state.draft?.content ?? null;
        })
        .catch(() => null);
      return draftPromise;
    }

    function post(content: EditorContentDoc, selection: EditorSelection | null) {
      frameRef.current?.contentWindow?.postMessage(editorContentMessage(content, selection), '*');
    }

    function failController(reason: string) {
      if (disposed) return;
      if (controllerTimerRef.current !== null) window.clearTimeout(controllerTimerRef.current);
      controllerTimerRef.current = null;
      setControllerStatus('failed');
      setControllerReason(reason);
      frameRef.current?.contentWindow?.postMessage(
        { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: 'editor:mode', mode: 'fallback' },
        '*',
      );
      recordEditorStep('controller_failed');
    }

    function expectController() {
      if (disposed || controllerStatusRef.current === 'ready' || controllerStatusRef.current === 'failed') return;
      setControllerStatus('connecting');
      setControllerReason(null);
      if (controllerTimerRef.current !== null) window.clearTimeout(controllerTimerRef.current);
      controllerTimerRef.current = window.setTimeout(() => {
        if (controllerViewRef.current === null) failController('The game editor did not provide a view in time.');
      }, 1500);
    }

    function onMessage(event: MessageEvent) {
      // Opaque-origin frame: origin is "null" and the source must be our iframe.
      if (event.origin !== 'null') return;
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.ns !== BRIDGE_NAMESPACE || data.v !== PROTOCOL_VERSION) return;
      if (data.t === 'editor:hello' && data.controller === true) {
        controllerHelloRef.current = true;
        expectController();
      } else if (data.t === 'editor:ui') {
        const parsed = parseUiDocument(data.doc);
        if (!parsed) {
          failController('The game editor sent an invalid view.');
          return;
        }
        if (controllerTimerRef.current !== null) window.clearTimeout(controllerTimerRef.current);
        controllerTimerRef.current = null;
        setControllerView(parsed);
        setControllerStatus('ready');
        setControllerReason(null);
        recordEditorStep('controller_loaded');
      } else if (data.t === 'editor:change') {
        if (typeof data.id !== 'string') return;
        setPendingChange({ id: data.id, patch: data.patch });
      } else if (data.t === 'editor:select') {
        const rawSelection = data.selection;
        if (rawSelection !== null && (!rawSelection || typeof rawSelection !== 'object')) return;
        const layer =
          rawSelection && typeof rawSelection === 'object' ? (rawSelection as { layer?: unknown }).layer : null;
        const index =
          rawSelection && typeof rawSelection === 'object' ? (rawSelection as { index?: unknown }).index : null;
        if (
          rawSelection !== null &&
          (typeof layer !== 'string' || (index !== null && (!Number.isInteger(index) || (index as number) < 0)))
        )
          return;
        setControllerSelection(
          rawSelection === null ? null : { layer: layer as string, index: index as number | null },
        );
      } else if (data.t === 'editor:canvas') {
        const box = data.box;
        if (!box || typeof box !== 'object') return;
        const raw = box as Record<string, unknown>;
        if ([raw.width, raw.height, raw.x, raw.y].some((value) => typeof value !== 'number' || !Number.isFinite(value)))
          return;
        setCanvasBox({
          width: raw.width as number,
          height: raw.height as number,
          x: raw.x as number,
          y: raw.y as number,
          ...(typeof raw.insetX === 'number' ? { insetX: raw.insetX } : {}),
          ...(typeof raw.insetY === 'number' ? { insetY: raw.insetY } : {}),
          ...(typeof raw.scale === 'number' ? { scale: raw.scale } : {}),
        });
      } else if (data.t === 'editor:ui-request') {
        const request = parseUiRequest({ id: data.id, spec: data.spec });
        if (!request) return;
        setUiRequest(request);
      } else if (data.t === 'editor:check') {
        if (typeof data.ok !== 'boolean' || !Array.isArray(data.problems)) return;
        setControllerChecks({
          ok: data.ok,
          problems: data.problems.filter((problem): problem is string => typeof problem === 'string').slice(0, 12),
        });
      } else if (data.t === 'editor:ack' && data.ok === false && controllerStatusRef.current !== null) {
        failController(typeof data.error === 'string' ? data.error : 'The game refused this content change.');
      } else if (data.t === 'editor:controller-error') {
        failController(typeof data.error === 'string' ? data.error : 'The game editor stopped responding.');
      } else if (data.t === 'editor:hello') {
        // A non-controller editor still receives the declaration-driven content push.
      } else {
        return;
      }

      if (data.t !== 'editor:hello') return;

      // A push already sent fresher content than the fetch would — that wins.
      if (lastContentRef.current !== null) {
        post(lastContentRef.current, lastSelectionRef.current);
        return;
      }
      void loadDraft().then((content) => {
        if (disposed || content === null) return;
        lastContentRef.current = content;
        post(content, lastSelectionRef.current);
      });
    }

    window.addEventListener('message', onMessage);
    return () => {
      disposed = true;
      if (controllerTimerRef.current !== null) window.clearTimeout(controllerTimerRef.current);
      window.removeEventListener('message', onMessage);
    };
  }, [frameRef, active, slug, editable]);

  const push = useCallback<EditorContentPush>(
    (content, selection) => {
      lastContentRef.current = content;
      if (selection !== undefined) lastSelectionRef.current = selection;
      frameRef.current?.contentWindow?.postMessage(editorContentMessage(content, lastSelectionRef.current), '*');
    },
    [frameRef],
  );

  const send = useCallback(
    (payload: Record<string, unknown>) => {
      frameRef.current?.contentWindow?.postMessage({ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload }, '*');
    },
    [frameRef],
  );
  const controller = useMemo<EditorControllerState | null>(() => {
    if (controllerStatus === null) return null;
    return {
      status: controllerStatus,
      view: controllerView,
      reason: controllerReason,
      selected: controllerSelection,
      pendingChange,
      uiRequest,
      checks: controllerChecks,
      canvasBox,
      sendEvent: (event) => send({ t: 'editor:event', event }),
      sendSelection: (selection) => {
        setControllerSelection(selection);
        send({ t: 'editor:select', selection });
      },
      sendUiResult: (id, value, cancelled = false) => {
        setUiRequest(null);
        send({ t: 'editor:ui-result', id, value, cancelled });
      },
      acknowledgeChange: (id, ok, error) => send({ t: 'editor:change:ack', id, ok, ...(error ? { error } : {}) }),
      useFallback: (reason) => {
        setControllerStatus('failed');
        setControllerReason(reason);
        send({ t: 'editor:mode', mode: 'fallback' });
      },
    };
  }, [
    canvasBox,
    controllerChecks,
    controllerReason,
    controllerSelection,
    controllerStatus,
    controllerView,
    pendingChange,
    send,
    uiRequest,
  ]);

  return { push, controller };
}
