// @vitest-environment jsdom

import { act, type MutableRefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const studioApi = vi.hoisted(() => ({ fetchGameEditor: vi.fn() }));
vi.mock('./studioApi', () => studioApi);
vi.mock('./visitTelemetry', () => ({ recordEditorStep: vi.fn() }));

import { useEditorDraftBridge, type EditorControllerState } from './editorBridge.js';
import type { EditorContentDoc } from './studioApi.js';
import { dispatchFromFrame } from './test-utils/frameMessage.js';

let latestController: EditorControllerState | null = null;
const pushRef: { current: ((content: EditorContentDoc) => void) | null } = { current: null };

function Harness({ frameRef }: { frameRef: MutableRefObject<HTMLIFrameElement | null> }) {
  const bridge = useEditorDraftBridge(frameRef, true, 'revision-fixture', true, 'build-1');
  latestController = bridge.controller;
  pushRef.current = bridge.push;
  return null;
}

describe('editor:check revision correlation', () => {
  let container: HTMLDivElement;
  let root: Root | null;
  let gameWindow: Window;
  let posted: Array<Record<string, unknown>>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    posted = [];
    gameWindow = {
      postMessage: vi.fn((message: Record<string, unknown>) => posted.push(message)),
    } as unknown as Window;
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

  function mount() {
    const frame = document.createElement('iframe');
    Object.defineProperty(frame, 'contentWindow', { value: gameWindow });
    root = createRoot(container);
    act(() => root!.render(<Harness frameRef={{ current: frame }} />));
  }

  function send(data: Record<string, unknown>) {
    act(() => dispatchFromFrame(gameWindow, data));
  }

  function frame(body: Record<string, unknown>) {
    return { ns: 'gdp', v: 1, ...body };
  }

  function connect() {
    send(frame({ t: 'editor:hello', controller: true }));
    send(frame({ t: 'editor:ui', doc: { type: 'note', text: 'Ready' } }));
  }

  it('ignores a check whose revision is not the document just pushed', () => {
    mount();
    connect();
    act(() => pushRef.current?.({ levels: ['first'] } as unknown as EditorContentDoc));
    send(frame({ t: 'editor:check', ok: true, problems: [], revision: 1 }));
    expect(latestController?.checksFresh).toBe(true);

    act(() => pushRef.current?.({ levels: ['second'] } as unknown as EditorContentDoc));
    expect(latestController?.checksFresh).toBe(false);
    send(frame({ t: 'editor:check', ok: false, problems: ['stale'], revision: 1 }));
    expect(latestController?.checksFresh).toBe(false);
    expect(latestController?.checks).toEqual({ ok: true, problems: [] });

    send(frame({ t: 'editor:check', ok: false, problems: ['now'], revision: 2 }));
    expect(latestController?.checksFresh).toBe(true);
    expect(latestController?.checks).toEqual({ ok: false, problems: ['now'] });
  });

  it('still accepts a check with no revision from an older game', () => {
    mount();
    connect();
    act(() => pushRef.current?.({ levels: [] } as unknown as EditorContentDoc));
    send(frame({ t: 'editor:check', ok: false, problems: ['legacy'] }));
    expect(latestController?.checksFresh).toBe(true);
    expect(latestController?.checks).toEqual({ ok: false, problems: ['legacy'] });
  });

  it('stamps a revision on every content push', () => {
    mount();
    connect();
    posted.length = 0;
    act(() => pushRef.current?.({ levels: ['a'] } as unknown as EditorContentDoc));
    expect(posted.at(-1)).toMatchObject({ t: 'editor:content', revision: 1 });
    act(() => pushRef.current?.({ levels: ['b'] } as unknown as EditorContentDoc));
    expect(posted.at(-1)).toMatchObject({ t: 'editor:content', revision: 2 });
  });

  it('stamps a revision on the hello draft so a later push cannot accept that check', async () => {
    studioApi.fetchGameEditor.mockResolvedValue({
      definition: { version: 2, controller: true, content: {} },
      draft: { content: { levels: ['hello'] }, revision: 1, updatedAt: '' },
    });
    mount();
    send(frame({ t: 'editor:hello', controller: true }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(posted.some((message) => message.t === 'editor:content' && message.revision === 1)).toBe(true);
    send(frame({ t: 'editor:ui', doc: { type: 'note', text: 'Ready' } }));
    act(() => pushRef.current?.({ levels: ['next'] } as unknown as EditorContentDoc));
    send(frame({ t: 'editor:check', ok: false, problems: ['from-hello'], revision: 1 }));
    expect(latestController?.checks).toBeNull();
    send(frame({ t: 'editor:check', ok: true, problems: [], revision: 2 }));
    expect(latestController?.checks).toEqual({ ok: true, problems: [] });
  });
});
