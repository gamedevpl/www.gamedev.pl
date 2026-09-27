// @vitest-environment jsdom
import { documentMessage, replaceTestFrameDocument } from './test-utils/frameMessage.js';
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { usePresenceBridge } from './presence.js';
import { markGameFrameLoadedByHost, markGameFrameNavigatedAway } from './frameMessage.js';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';

it.each([false, true])('withdraws before replacement joins, pending beat: %s', async (pending) => {
  let releaseBeat!: () => void;
  let releaseLeave!: () => void;
  const beat = new Promise<void>((resolve) => {
    releaseBeat = resolve;
  });
  const leave = new Promise<void>((resolve) => {
    releaseLeave = resolve;
  });
  let visible = false;
  let posts = 0;
  const methods: string[] = [];
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    methods.push(method);
    if (method === 'POST') {
      if (++posts === 1 && pending) await beat;
      visible = true;
    }
    if (method === 'DELETE') {
      await leave;
      visible = false;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ count: visible ? 1 : 0, peers: [], visible, heartbeatMs: 12000 }),
    };
  });
  vi.stubGlobal('fetch', fetch);
  function Harness() {
    const ref = useRef<HTMLIFrameElement | null>(null);
    usePresenceBridge(ref, 'replacement-test');
    return <iframe ref={ref} />;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    act(() => root.render(<Harness />));
    const frame = container.querySelector('iframe')!;
    vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
    const send = (t: string) =>
      window.dispatchEvent(
        documentMessage('message', {
          origin: 'null',
          source: frame.contentWindow,
          data: { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t, col: 1, row: 2 },
        }),
      );
    await act(async () => {
      send('presence:hello');
      send('presence:here');
    });
    await act(async () => markGameFrameNavigatedAway(frame));
    await act(async () => {
      markGameFrameLoadedByHost(frame);
      replaceTestFrameDocument(frame.contentWindow!);
    });
    await act(async () => {
      send('presence:hello');
      send('presence:here');
    });
    expect(posts).toBe(1);
    await act(async () => releaseBeat());
    expect(methods).toContain('DELETE');
    expect(posts).toBe(1);
    await act(async () => releaseLeave());
    expect(methods.filter((method) => method !== 'GET')).toEqual(['POST', 'DELETE', 'POST']);
    expect(visible).toBe(true);
  } finally {
    releaseBeat();
    releaseLeave();
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
