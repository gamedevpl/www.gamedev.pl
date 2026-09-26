// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { usePresenceBridge } from './presence.js';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';

function Harness() {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  usePresenceBridge(frameRef, 'wanderers-green');
  return <iframe ref={frameRef} />;
}

it('keeps hello/here traffic below each 30-per-minute route budget', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      count: 1,
      peers: [],
      visible: true,
      ttlMs: 40000,
      heartbeatMs: 12000,
    }),
  }));
  vi.stubGlobal('fetch', fetch);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    act(() => root.render(<Harness />));
    const frame = container.querySelector('iframe')!;
    vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
    const send = (t: string) =>
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'null',
          source: frame.contentWindow,
          data: { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t, col: 2, row: 3 },
        }),
      );
    await act(async () => {
      send('presence:hello');
    });
    await act(async () => {
      send('presence:here');
    });
    const calls = (method: string) =>
      fetch.mock.calls.filter((call) => ((call as unknown as [string, RequestInit])[1]?.method ?? 'GET') === method);
    expect(calls('POST')).toHaveLength(1);
    for (let second = 1; second < 60; second++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
        send('presence:hello');
        send('presence:here');
      });
    }
    expect(calls('GET').length).toBeLessThanOrEqual(30);
    expect(calls('POST').length).toBeLessThanOrEqual(30);
    expect(calls('GET').length).toBeGreaterThan(1);
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
