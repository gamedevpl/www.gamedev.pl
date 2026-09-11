// @vitest-environment jsdom

import { act, type MutableRefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const studioApi = vi.hoisted(() => ({ fetchGameEditor: vi.fn() }));
vi.mock('./studioApi', () => studioApi);
vi.mock('./visitTelemetry', () => ({ recordEditorStep: vi.fn() }));

import { useEditorDraftBridge, type EditorControllerState } from './editorBridge.js';

let latestController: EditorControllerState | null = null;

function Harness({ frameRef }: { frameRef: MutableRefObject<HTMLIFrameElement | null> }) {
  latestController = useEditorDraftBridge(frameRef, true, 'controller-fixture', true).controller;
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
    gameWindow = { postMessage: vi.fn((message: Record<string, unknown>) => posted.push(message)) } as unknown as Window;
    otherWindow = { postMessage: vi.fn() } as unknown as Window;
    studioApi.fetchGameEditor.mockResolvedValue({ definition: { version: 2, controller: true, content: {} }, draft: null });
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

  function mount() {
    const frameRef = { current: { contentWindow: gameWindow } } as unknown as MutableRefObject<HTMLIFrameElement | null>;
    root = createRoot(container);
    act(() => root!.render(<Harness frameRef={frameRef} />));
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
});
