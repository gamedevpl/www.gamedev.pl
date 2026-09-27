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

it.each([200])('keeps away/hello/here churn within route budgets after status %i', async (status) => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => ({
    status: init?.method === 'POST' ? status : 200,
    ok: !init?.method || status === 200,
    json: async () => ({
      count: 1,
      peers: [],
      visible: status === 200,
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
        send('presence:away');
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

it('withdraws a deferred beat that resolves after away', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let resolveBeat!: (value: unknown) => void;
  const snapshot = { visible: true, count: 1, peers: [], heartbeatMs: 12000 };
  const response = { ok: true, status: 200, json: async () => snapshot };
  let posts = 0;
  const fetch = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'POST' && ++posts === 2)
      return new Promise((resolve) => {
        resolveBeat = resolve;
      });
    return Promise.resolve(response);
  });
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
      send('presence:here');
    });
    await act(async () => {
      send('presence:away');
      send('presence:hello');
      send('presence:here');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(posts).toBe(2);
    await act(async () => {
      send('presence:away');
    });
    const deletesBefore = fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE').length;
    await act(async () => {
      resolveBeat(response);
    });
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE').length).toBe(deletesBefore + 1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(posts).toBe(2);
    const postsSent = fetch.mock.calls.filter(([, init]) => init?.method === 'POST');
    const leaves = fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE');
    const header = (init?: RequestInit) => new Headers(init?.headers).get('x-presence-lease');
    expect(header(postsSent[1]![1])).toBeTruthy();
    expect(header(leaves.at(-1)![1])).toBe(header(postsSent[1]![1]));
    expect(header(postsSent[0]![1])).not.toBe(header(postsSent[1]![1]));
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
