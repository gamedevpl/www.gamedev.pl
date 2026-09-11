import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { fetchGameEditor, type EditorContentDoc } from './studioApi.js';
import { recordEditorStep } from './visitTelemetry.js';
import {
  BRIDGE_NAMESPACE,
  PROTOCOL_VERSION,
  parseEditorControllerEnvelope,
  type EditorCanvasBox,
  type EditorControllerChange,
  type EditorControllerOutbound,
  type EditorControllerSelection,
  type EditorSelection,
  type EditorUiDocument,
  type EditorUiRequest,
} from './editorControllerProtocol.js';

export type {
  EditorCanvasBox,
  EditorControllerChange,
  EditorControllerSelection,
  EditorSelection,
  EditorUiDocument,
  EditorUiField,
  EditorUiLabel,
  EditorUiNode,
  EditorUiRequest,
} from './editorControllerProtocol.js';

export type EditorContentPush = (content: EditorContentDoc, selection?: EditorSelection | null) => void;

export type EditorControllerState = {
  status: 'connecting' | 'ready' | 'failed';
  view: EditorUiDocument | null;
  reason: string | null;
  selected: EditorControllerSelection | null;
  pendingChange: EditorControllerChange | null;
  uiRequest: EditorUiRequest | null;
  checks: { ok: boolean; problems: string[] } | null;
  canvasBox: EditorCanvasBox | null;
  sendEvent: (event: Record<string, unknown>) => void;
  sendSelection: (selection: EditorControllerSelection | null) => void;
  sendUiResult: (id: string, value: unknown, cancelled?: boolean) => void;
  acknowledgeChange: (id: string, ok: boolean, error?: string) => void;
  useFallback: (reason: string) => void;
};

export function editorContentMessage(
  content: EditorContentDoc,
  selection?: EditorSelection | null,
): Extract<EditorControllerOutbound, { t: 'editor:content' }> {
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
  const [controllerView, setControllerView] = useState<EditorUiDocument | null>(null);
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
      const data = parseEditorControllerEnvelope(event.data);
      if (!data) {
        const raw = event.data as Record<string, unknown> | null;
        if (raw?.ns === BRIDGE_NAMESPACE && raw.v === PROTOCOL_VERSION && raw.t === 'editor:ui') {
          failController('The game editor sent an invalid view.');
        }
        return;
      }
      if (data.t === 'editor:hello' && data.controller) {
        controllerHelloRef.current = true;
        expectController();
      } else if (data.t === 'editor:ui') {
        if (controllerTimerRef.current !== null) window.clearTimeout(controllerTimerRef.current);
        controllerTimerRef.current = null;
        setControllerView(data.doc);
        setControllerStatus('ready');
        setControllerReason(null);
        recordEditorStep('controller_loaded');
      } else if (data.t === 'editor:change') {
        setPendingChange({ id: data.id, patch: data.patch });
      } else if (data.t === 'editor:select') {
        setControllerSelection(data.selection);
      } else if (data.t === 'editor:canvas') {
        setCanvasBox(data.box);
      } else if (data.t === 'editor:ui-request') {
        setUiRequest({ id: data.id, spec: data.spec });
      } else if (data.t === 'editor:check') {
        setControllerChecks({ ok: data.ok, problems: data.problems });
      } else if (data.t === 'editor:ack' && !data.ok && controllerStatusRef.current !== null) {
        failController(data.error ?? 'The game refused this content change.');
      } else if (data.t === 'editor:controller-error') {
        failController(data.error ?? 'The game editor stopped responding.');
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
    (message: EditorControllerOutbound) => {
      frameRef.current?.contentWindow?.postMessage(message, '*');
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
      sendEvent: (event) => send({ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: 'editor:event', event }),
      sendSelection: (selection) => {
        setControllerSelection(selection);
        send({ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: 'editor:select', selection });
      },
      sendUiResult: (id, value, cancelled = false) => {
        setUiRequest(null);
        send({ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: 'editor:ui-result', id, value, cancelled });
      },
      acknowledgeChange: (id, ok, error) =>
        send({
          ns: BRIDGE_NAMESPACE,
          v: PROTOCOL_VERSION,
          t: 'editor:change:ack',
          id,
          ok,
          ...(error ? { error } : {}),
        }),
      useFallback: (reason) => {
        setControllerStatus('failed');
        setControllerReason(reason);
        send({ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: 'editor:mode', mode: 'fallback' });
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
