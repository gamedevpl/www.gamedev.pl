// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { usePresenceBridge } from './presence.js';

it.each([
  ['away', 429],
  ['unmount', 500],
])('withdraws the confirmed lease after %s and status %i', async (exit, status) => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let posts = 0;
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const failed = init?.method === 'POST' && ++posts === 2;
    return {
      ok: !failed,
      status: failed ? status : 200,
      json: async () => ({ visible: true, count: 1, peers: [], heartbeatMs: 12000 }),
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
        new MessageEvent('message', {
          origin: 'null',
          source: frame.contentWindow,
          data: { ns: 'gdp', v: 1, t, col: 2, row: 3 },
        }),
      );
    await act(async () => {
      send('presence:hello');
      send('presence:here');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    expect(posts).toBe(2);
    await act(async () => {
      if (exit === 'away') send('presence:away');
      else {
        root.unmount();
        unmounted = true;
      }
    });
    const header = (init?: RequestInit) => new Headers(init?.headers).get('x-presence-lease');
    const beats = fetch.mock.calls.filter(([, init]) => init?.method === 'POST');
    const leaves = fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE');
    expect(header(beats[0]![1])).toBeTruthy();
    expect(leaves.some(([, init]) => header(init) === header(beats[0]![1]))).toBe(true);
  } finally {
    if (!unmounted) act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
