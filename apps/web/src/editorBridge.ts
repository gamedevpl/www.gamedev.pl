import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { fetchGameEditor, type EditorContentDoc, type GameEditorState } from './studioApi.js';
import { recordEditorStep } from './visitTelemetry.js';
import {
  BRIDGE_NAMESPACE,
  PROTOCOL_VERSION,
  editorContentMessage,
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
export { editorContentMessage } from './editorControllerProtocol.js';

export type EditorContentPush = (content: EditorContentDoc, selection?: EditorSelection | null) => void;

// validate() runs on apply, so an answer is due in seconds.
const CHECK_ANSWER_MS = 3000;

export type EditorControllerState = {
  status: 'connecting' | 'ready' | 'failed';
  view: EditorUiDocument | null;
  reason: string | null;
  selected: EditorControllerSelection | null;
  pendingChange: EditorControllerChange | null;
  uiRequest: EditorUiRequest | null;
  checks: { ok: boolean; problems: string[] } | null;
  // False while pushed content still awaits the game's verdict.
  checksFresh: boolean;
  canvasBox: EditorCanvasBox | null;
  sendEvent: (event: Record<string, unknown>) => void;
  sendSelection: (selection: EditorControllerSelection | null) => void;
  sendUiResult: (id: string, value: unknown, cancelled?: boolean) => void;
  acknowledgeChange: (id: string, ok: boolean, error?: string) => void;
  useFallback: (reason: string) => void;
};

export function useEditorDraftBridge(
  frameRef: MutableRefObject<HTMLIFrameElement | null>,
  active: boolean,
  slug: string | undefined,
  editable: boolean,
  // Changes on a new build; a frame load resets too.
  documentKey?: string | null,
): { push: EditorContentPush; controller: EditorControllerState | null } {
  /** What the next `editor:hello` gets answered with. */
  const lastContentRef = useRef<EditorContentDoc | null>(null);
  const lastSelectionRef = useRef<EditorSelection | null>(null);
  const lastRevisionRef = useRef<number | undefined>(undefined);
  const controllerHelloRef = useRef(false);
  const controllerTimerRef = useRef<number | null>(null);
  const [controllerStatus, setControllerStatus] = useState<EditorControllerState['status'] | null>(null);
  const [controllerView, setControllerView] = useState<EditorUiDocument | null>(null);
  const [controllerReason, setControllerReason] = useState<string | null>(null);
  const [controllerSelection, setControllerSelection] = useState<EditorControllerSelection | null>(null);
  const [pendingChange, setPendingChange] = useState<EditorControllerChange | null>(null);
  const [uiRequest, setUiRequest] = useState<EditorUiRequest | null>(null);
  const [controllerChecks, setControllerChecks] = useState<{ ok: boolean; problems: string[] } | null>(null);
  const [checksFresh, setChecksFresh] = useState(true);
  const [canvasBox, setCanvasBox] = useState<EditorControllerState['canvasBox']>(null);
  const controllerStatusRef = useRef(controllerStatus);
  controllerStatusRef.current = controllerStatus;
  const controllerViewRef = useRef(controllerView);
  controllerViewRef.current = controllerView;
  // A controller that stood down does not take the surface back.
  const controllerStoodDownRef = useRef(false);
  const checkTimerRef = useRef<number | null>(null);
  const checksSeenRef = useRef(false);

  const standDownRef = useRef<(reason: string) => void>(() => {});

  const armCheckWatchdog = useCallback(() => {
    if (controllerStoodDownRef.current || checkTimerRef.current !== null) return;
    if (!checksSeenRef.current) return;
    checkTimerRef.current = window.setTimeout(() => {
      checkTimerRef.current = null;
      standDownRef.current('The game editor stopped answering its own checks.');
    }, CHECK_ANSWER_MS);
  }, []);

  const standDown = useCallback(
    (reason: string) => {
      if (checkTimerRef.current !== null) window.clearTimeout(checkTimerRef.current);
      checkTimerRef.current = null;
      controllerStoodDownRef.current = true;
      setControllerStatus('failed');
      setControllerReason(reason);
      frameRef.current?.contentWindow?.postMessage(
        { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: 'editor:mode', mode: 'fallback' },
        '*',
      );
      recordEditorStep('controller_failed');
    },
    [frameRef],
  );
  standDownRef.current = standDown;

  const [documentGeneration, setDocumentGeneration] = useState(0);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof frame.addEventListener !== 'function') return undefined;
    const onLoad = () => setDocumentGeneration((generation) => generation + 1);
    frame.addEventListener('load', onLoad);
    return () => frame.removeEventListener('load', onLoad);
    // documentKey: the frame does not exist until the first build arrives.
  }, [frameRef, documentKey]);

  // The draft outlives a rebuild; only another game replaces it.
  useEffect(() => {
    lastContentRef.current = null;
    lastSelectionRef.current = null;
    lastRevisionRef.current = undefined;
  }, [slug]);

  useEffect(() => {
    controllerHelloRef.current = false;
    controllerStoodDownRef.current = false;
    checksSeenRef.current = false;
    if (checkTimerRef.current !== null) window.clearTimeout(checkTimerRef.current);
    checkTimerRef.current = null;
    if (controllerTimerRef.current !== null) window.clearTimeout(controllerTimerRef.current);
    controllerTimerRef.current = null;
    setControllerStatus(null);
    setControllerView(null);
    setControllerReason(null);
    setControllerSelection(null);
    setPendingChange(null);
    setUiRequest(null);
    setControllerChecks(null);
    setChecksFresh(true);
    setCanvasBox(null);
  }, [slug, documentKey, documentGeneration]);

  useEffect(() => {
    if (!active || !slug || !editable) return;

    let disposed = false;
    let controllerExpected = false;
    /** One fetch per playtest session; a hello after the first reuses it. */
    let statePromise: Promise<GameEditorState | null> | null = null;

    function loadState(): Promise<GameEditorState | null> {
      statePromise ??= fetchGameEditor(slug as string)
        .then((state) => {
          controllerExpected = state.definition.controller === true;
          if (controllerExpected && !controllerHelloRef.current) expectController();
          return state;
        })
        .catch(() => null);
      return statePromise;
    }

    function post(content: EditorContentDoc, selection: EditorSelection | null) {
      frameRef.current?.contentWindow?.postMessage(
        editorContentMessage(content, selection, lastRevisionRef.current),
        '*',
      );
    }

    function failController(reason: string) {
      if (disposed) return;
      if (controllerTimerRef.current !== null) window.clearTimeout(controllerTimerRef.current);
      controllerTimerRef.current = null;
      standDown(reason);
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
        const invalidView = raw?.ns === BRIDGE_NAMESPACE && raw.v === PROTOCOL_VERSION && raw.t === 'editor:ui';
        if (invalidView && !controllerStoodDownRef.current) failController('The game editor sent an invalid view.');
        return;
      }
      // A stood-down controller gets no commands; the draft push stays.
      if (controllerStoodDownRef.current && data.t !== 'editor:hello') return;
      if (data.t === 'editor:hello' && data.controller) {
        controllerHelloRef.current = true;
        expectController();
      } else if (data.t === 'editor:ui') {
        if ((Array.isArray(data.doc) ? data.doc : [data.doc]).length === 0) {
          failController('The game editor sent a view with nothing in it.');
          return;
        }
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
        const expected = lastRevisionRef.current;
        if (typeof data.revision === 'number' && expected !== undefined && data.revision !== expected) return;
        if (checkTimerRef.current !== null) window.clearTimeout(checkTimerRef.current);
        checkTimerRef.current = null;
        checksSeenRef.current = true;
        setControllerChecks({ ok: data.ok, problems: data.problems });
        setChecksFresh(true);
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

      // The definition is needed either way; the draft is skippable.
      const pending = loadState();
      // A push already sent fresher content than the fetch would — that wins.
      if (lastContentRef.current !== null) {
        post(lastContentRef.current, lastSelectionRef.current);
        return;
      }
      void pending.then((state) => {
        const content = state?.draft?.content ?? null;
        if (disposed || content === null) return;
        lastContentRef.current = content;
        post(content, lastSelectionRef.current);
      });
    }

    window.addEventListener('message', onMessage);
    return () => {
      disposed = true;
      if (controllerTimerRef.current !== null) window.clearTimeout(controllerTimerRef.current);
      // No listener left to hear the answer, so no timeout.
      if (checkTimerRef.current !== null) window.clearTimeout(checkTimerRef.current);
      checkTimerRef.current = null;
      window.removeEventListener('message', onMessage);
    };
  }, [armCheckWatchdog, frameRef, active, slug, editable, standDown]);

  const push = useCallback<EditorContentPush>(
    (content, selection) => {
      lastContentRef.current = content;
      if (selection !== undefined) lastSelectionRef.current = selection;
      lastRevisionRef.current = (lastRevisionRef.current ?? 0) + 1;
      setChecksFresh(false);
      armCheckWatchdog();
      frameRef.current?.contentWindow?.postMessage(
        editorContentMessage(content, lastSelectionRef.current, lastRevisionRef.current),
        '*',
      );
    },
    [armCheckWatchdog, frameRef],
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
      checksFresh,
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
        controllerStoodDownRef.current = true;
        setControllerStatus('failed');
        setControllerReason(reason);
        send({ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: 'editor:mode', mode: 'fallback' });
      },
    };
  }, [
    canvasBox,
    checksFresh,
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
