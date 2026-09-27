// @vitest-environment jsdom
import { documentMessage } from './test-utils/frameMessage.js';
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { usePresenceBridge } from './presence.js';

it.each([
  ['away', 'transport', false],
  ['unmount', 'json', false],
  ['away', 'json', true],
  ['unmount', 'transport', true],
])('withdraws server writes after %s, %s failure, first beat: %s', async (exit, failure, first) => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let posts = 0;
  let serverLease: string | null = null;
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const token = new Headers(init?.headers).get('x-presence-lease');
    const failed = init?.method === 'POST' && ++posts === (first ? 1 : 2);
    if (init?.method === 'POST') serverLease = token;
    if (init?.method === 'DELETE' && serverLease === token) serverLease = null;
    if (failed && failure === 'transport') throw new Error('response lost after write');
    return {
      ok: true,
      status: 200,
      json: async () => {
        if (failed) throw new Error('invalid JSON after write');
        return { visible: true, count: 1, peers: [], heartbeatMs: 12000 };
      },
    };
  });
  vi.stubGlobal('fetch', fetch);
  function Harness() {
    const ref = useRef<HTMLIFrameElement | null>(null);
    usePresenceBridge(ref, 'lease-failure');
    return <iframe ref={ref} />;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let unmounted = false;
  try {
    act(() => root.render(<Harness />));
    const frame = container.querySelector('iframe')!;
    vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
    const send = (t: string) =>
      window.dispatchEvent(
        documentMessage('message', {
          origin: 'null',
          source: frame.contentWindow,
          data: { ns: 'gdp', v: 1, t, col: 2, row: 3 },
        }),
      );
    await act(async () => {
      send('presence:hello');
      send('presence:here');
    });
    if (!first)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(12000);
      });
    expect(posts).toBe(first ? 1 : 2);
    expect(serverLease).toBeTruthy();
    await act(async () => {
      if (exit === 'away') send('presence:away');
      else {
        root.unmount();
        unmounted = true;
      }
    });
    expect(serverLease).toBeNull();
  } finally {
    if (!unmounted) act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
