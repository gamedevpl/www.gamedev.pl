// @vitest-environment jsdom

import { act, type MutableRefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const studioApi = vi.hoisted(() => ({ fetchGameEditor: vi.fn() }));
vi.mock('./studioApi', () => studioApi);
vi.mock('./visitTelemetry', () => ({ recordEditorStep: vi.fn() }));

import { useEditorDraftBridge, type EditorControllerState } from './editorBridge.js';
import type { EditorContentDoc } from './studioApi.js';

let latestController: EditorControllerState | null = null;

type HarnessProps = {
  frameRef: MutableRefObject<HTMLIFrameElement | null>;
  active?: boolean;
  documentKey?: string;
};

const pushRef: { current: ((content: EditorContentDoc) => void) | null } = { current: null };

function Harness({ frameRef, active = true, documentKey = 'build-1' }: HarnessProps) {
  const bridge = useEditorDraftBridge(frameRef, active, 'controller-fixture', true, documentKey);
  latestController = bridge.controller;
  pushRef.current = bridge.push;
  return null;
}

describe('controller bridge boundary', () => {
  let container: HTMLDivElement;
  let root: Root | null;
  let gameWindow: Window;
  let otherWindow: Window;
  let posted: Array<Record<string, unknown>>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    posted = [];
    gameWindow = {
      postMessage: vi.fn((message: Record<string, unknown>) => posted.push(message)),
    } as unknown as Window;
    otherWindow = { postMessage: vi.fn() } as unknown as Window;
    studioApi.fetchGameEditor.mockResolvedValue({
      definition: { version: 2, controller: true, content: {} },
      draft: null,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = null;
    latestController = null;
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  let mountedFrameRef: MutableRefObject<HTMLIFrameElement | null>;

  function mount() {
    // Real, so a load is dispatchable; detached, so none fires alone.
    const frame = document.createElement('iframe');
    Object.defineProperty(frame, 'contentWindow', { value: gameWindow });
    mountedFrameRef = { current: frame };
    root = createRoot(container);
    act(() => root!.render(<Harness frameRef={mountedFrameRef} />));
  }

  function setActive(active: boolean) {
    act(() => root!.render(<Harness frameRef={mountedFrameRef} active={active} />));
  }

  function loadDocument(documentKey: string) {
    act(() => root!.render(<Harness frameRef={mountedFrameRef} documentKey={documentKey} />));
  }

  function send(data: Record<string, unknown>, source = gameWindow, origin = 'null') {
    const event = new MessageEvent('message', { data, origin });
    Object.defineProperty(event, 'source', { value: source });
    act(() => window.dispatchEvent(event));
  }

  function frame(body: Record<string, unknown>) {
    return { ns: 'gdp', v: 1, ...body };
  }

  function connect() {
    send(frame({ t: 'editor:hello', controller: true }));
    send(frame({ t: 'editor:ui', doc: { type: 'note', text: 'Ready' } }));
    expect(latestController?.status).toBe('ready');
  }

  it('ignores wrong origins and iframe sources before parsing', () => {
    mount();
    send(frame({ t: 'editor:hello', controller: true }), gameWindow, 'https://attacker.example');
    send(frame({ t: 'editor:hello', controller: true }), otherWindow);
    send({ ns: 'wrong', v: 1, t: 'editor:hello', controller: true });
    send({ ns: 'gdp', v: 2, t: 'editor:hello', controller: true });
    expect(latestController).toBeNull();
    expect(studioApi.fetchGameEditor).not.toHaveBeenCalled();
    expect(posted).toEqual([]);
  });

  it('sends event, selection, and fallback mode in the additive v1 envelope', () => {
    mount();
    connect();
    posted.length = 0;
    act(() => {
      latestController!.sendEvent({ tool: 'paint' });
      latestController!.sendSelection({ layer: 'actors', index: 2 });
      latestController!.useFallback('controller stopped');
    });
    expect(posted).toEqual([
      { ns: 'gdp', v: 1, t: 'editor:event', event: { tool: 'paint' } },
      { ns: 'gdp', v: 1, t: 'editor:select', selection: { layer: 'actors', index: 2 } },
      { ns: 'gdp', v: 1, t: 'editor:mode', mode: 'fallback' },
    ]);
  });

  it('accepts valid change, selection, and canvas messages from the game frame', () => {
    mount();
    connect();
    send(frame({ t: 'editor:change', id: 'change-1', patch: { op: 'replace' } }));
    send(frame({ t: 'editor:select', selection: { layer: 'actors', index: 1 } }));
    send(frame({ t: 'editor:canvas', box: { width: 640, height: 360, x: -2, y: 4, insetX: 0, scale: 2 } }));
    expect(latestController).toMatchObject({
      pendingChange: { id: 'change-1', patch: { op: 'replace' } },
      selected: { layer: 'actors', index: 1 },
      canvasBox: { width: 640, height: 360, x: -2, y: 4, insetX: 0, scale: 2 },
    });
  });

  it('drops invalid canvas messages without replacing the last valid box', () => {
    mount();
    connect();
    send(frame({ t: 'editor:canvas', box: { width: 640, height: 360, x: 0, y: 0 } }));
    send(frame({ t: 'editor:canvas', box: { width: 0, height: 360, x: 0, y: 0 } }));
    expect(latestController?.canvasBox).toEqual({ width: 640, height: 360, x: 0, y: 0 });
  });

  it('refuses a view with nothing in it rather than handing over an empty surface', () => {
    mount();
    send(frame({ t: 'editor:hello', controller: true }));
    send(frame({ t: 'editor:ui', doc: [] }));
    expect(latestController?.status).toBe('failed');
    expect(latestController?.view).toBeNull();
    expect(latestController?.reason).toContain('nothing in it');
    expect(posted).toContainEqual({ ns: 'gdp', v: 1, t: 'editor:mode', mode: 'fallback' });
  });

  it('keeps the fallback once a controller has stood down, however many views follow', () => {
    mount();
    connect();
    act(() => latestController!.useFallback('the game refused this content change'));
    expect(latestController?.status).toBe('failed');

    send(frame({ t: 'editor:ui', doc: { type: 'note', text: 'Back again' } }));
    expect(latestController?.status).toBe('failed');
    expect(latestController?.reason).toBe('the game refused this content change');
  });

  it('takes no further command from a controller that stood down, not just no view', () => {
    mount();
    connect();
    send(frame({ t: 'editor:canvas', box: { width: 640, height: 360, x: 0, y: 0 } }));
    act(() => latestController!.useFallback('the game refused this content change'));

    send(frame({ t: 'editor:change', id: 'change-2', patch: { op: 'replace' } }));
    send(frame({ t: 'editor:select', selection: { layer: 'actors', index: 3 } }));
    send(frame({ t: 'editor:ui-request', id: 'ask-1', spec: { kind: 'toast', text: 'hello' } }));
    send(frame({ t: 'editor:check', ok: false, problems: ['stale'] }));
    send(frame({ t: 'editor:canvas', box: { width: 1, height: 1, x: 9, y: 9 } }));

    // A patch applied here would edit and autosave the creator's draft.
    expect(latestController?.pendingChange).toBeNull();
    expect(latestController?.selected).toBeNull();
    expect(latestController?.uiRequest).toBeNull();
    expect(latestController?.checks).toBeNull();
    expect(latestController?.canvasBox).toEqual({ width: 640, height: 360, x: 0, y: 0 });
  });

  it('still answers a hello with the draft, so play keeps working after fallback', async () => {
    studioApi.fetchGameEditor.mockResolvedValue({
      definition: { version: 2, controller: true, content: {} },
      draft: { content: { levels: [] } },
    });
    mount();
    connect();
    await act(async () => void (await Promise.resolve()));
    act(() => latestController!.useFallback('the game refused this content change'));
    posted.length = 0;

    send(frame({ t: 'editor:hello', controller: false }));
    expect(posted.some((message) => message.t === 'editor:content')).toBe(true);
  });

  it('stays stood down when Edit is reopened, because the same frame is still live', () => {
    mount();
    connect();
    act(() => latestController!.useFallback('the game refused this content change'));

    // The iframe is not replaced, so this is no fresh handshake.
    setActive(false);
    setActive(true);
    send(frame({ t: 'editor:hello', controller: true }));
    send(frame({ t: 'editor:ui', doc: { type: 'note', text: 'Second chance' } }));
    send(frame({ t: 'editor:change', id: 'change-3', patch: { path: ['a'], value: 1 } }));
    expect(latestController?.status).toBe('failed');
    expect(latestController?.pendingChange).toBeNull();
  });

  it('gives a replacement build its own chance, because the frame loaded a new document', () => {
    mount();
    connect();
    act(() => latestController!.useFallback('the game refused this content change'));

    loadDocument('build-2');
    send(frame({ t: 'editor:hello', controller: true }));
    send(frame({ t: 'editor:ui', doc: { type: 'note', text: 'New build' } }));
    expect(latestController?.status).toBe('ready');
  });

  it("answers a replacement build's hello with the newest draft, not the saved one", async () => {
    studioApi.fetchGameEditor.mockResolvedValue({
      definition: { version: 2, controller: true, content: {} },
      draft: { content: { levels: ['saved'] } },
    });
    mount();
    connect();
    await act(async () => void (await Promise.resolve()));

    act(() => pushRef.current?.({ levels: ['unsaved edit'] } as unknown as EditorContentDoc));
    loadDocument('build-2');
    posted.length = 0;

    send(frame({ t: 'editor:hello', controller: true }));
    const content = posted.find((message) => message.t === 'editor:content');
    expect(content?.content).toEqual({ levels: ['unsaved edit'] });
  });

  it('stands a controller down when it stops answering for the content it was sent', () => {
    vi.useFakeTimers();
    try {
      mount();
      connect();
      send(frame({ t: 'editor:check', ok: true, problems: [] }));

      act(() => pushRef.current?.({ levels: [] }));
      expect(latestController?.status).toBe('ready');

      act(() => void vi.advanceTimersByTime(3000));
      // Silence would otherwise hold Publish shut forever.
      expect(latestController?.status).toBe('failed');
      expect(latestController?.reason).toContain('stopped answering');
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives a reloaded frame a fresh controller, even when the build did not change', () => {
    mount();
    connect();
    act(() => latestController!.useFallback('the game refused this content change'));

    // A locale switch rewrites srcDoc without changing the build's html.
    act(() => void mountedFrameRef.current!.dispatchEvent(new Event('load')));
    send(frame({ t: 'editor:hello', controller: true }));
    send(frame({ t: 'editor:ui', doc: { type: 'note', text: 'Same build, new document' } }));
    expect(latestController?.status).toBe('ready');
  });

  it("does not let the old document's view watchdog fail the next one", () => {
    vi.useFakeTimers();
    try {
      mount();
      // Connecting, with the view watchdog running and no view yet.
      send(frame({ t: 'editor:hello', controller: true }));
      expect(latestController?.status).toBe('connecting');

      act(() => void mountedFrameRef.current!.dispatchEvent(new Event('load')));
      act(() => void vi.advanceTimersByTime(3000));

      expect(latestController?.status).not.toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops the check watchdog when the creator leaves, so silence cannot fail it later', () => {
    vi.useFakeTimers();
    try {
      mount();
      connect();
      send(frame({ t: 'editor:check', ok: true, problems: [] }));
      act(() => pushRef.current?.({ levels: [] } as unknown as EditorContentDoc));

      setActive(false);
      act(() => void vi.advanceTimersByTime(5000));

      // Nothing is listening, so a timeout here would fail a healthy controller.
      expect(latestController?.status).not.toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks the last verdict stale as soon as content the game has not seen is pushed', () => {
    mount();
    connect();
    send(frame({ t: 'editor:check', ok: true, problems: [] }));
    expect(latestController?.checksFresh).toBe(true);

    act(() => latestController && pushRef.current?.({ levels: [] }));
    expect(latestController?.checksFresh).toBe(false);

    send(frame({ t: 'editor:check', ok: true, problems: [] }));
    expect(latestController?.checksFresh).toBe(true);
  });
});
