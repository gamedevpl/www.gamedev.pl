// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { markGameFrameNavigatedAway, markGameFrameLoadedByHost } from './frameMessage.js';
import { useVoiceMeterBridge } from './voiceMeter.js';
import { useSensingBridge } from './sensing.js';
import { usePresenceBridge } from './presence.js';
import { useZoneBridge } from './zone.js';
import { ZONE_PROTOCOL_VERSION } from './zone/protocol.js';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';

it.each([false, true])('retires resources across navigation, pending=%s', async (pending) => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const stop = vi.fn();
  const close = vi.fn(async () => {});
  const media = { getTracks: () => [{ stop, kind: 'video' }] } as unknown as MediaStream;
  const resolvers: (() => void)[] = [];
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: {
      getUserMedia: vi.fn(() =>
        pending ? new Promise<MediaStream>((resolve) => resolvers.push(() => resolve(media))) : Promise.resolve(media),
      ),
    },
  });
  class AudioContext {
    state = 'running';
    close = close;
    resume = async () => {};
    createMediaStreamSource() {
      return { connect() {} };
    }
    createAnalyser() {
      return { fftSize: 1024, getByteTimeDomainData() {} };
    }
  }
  const sockets: { closed: boolean }[] = [];
  class Socket {
    readyState = 1;
    closed = false;
    constructor() {
      sockets.push(this);
    }
    close() {
      this.closed = true;
    }
    send() {}
  }
  vi.stubGlobal('AudioContext', AudioContext);
  vi.stubGlobal('WebSocket', Socket);
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (pending && init?.method === 'POST' && url.endsWith('/presence'))
      await new Promise<void>((resolve) => resolvers.push(resolve));
    return {
      ok: true,
      status: 200,
      json: async () =>
        url.endsWith('/presence')
          ? { count: 1, peers: [], visible: true, heartbeatMs: 12000 }
          : { zone: 'test', hostUrl: 'https://world.test', ticket: 'ticket', tickHz: 10, maxPlayers: 4, inputs: [] },
    };
  });
  vi.stubGlobal('fetch', fetch);
  let voice!: ReturnType<typeof useVoiceMeterBridge>;
  let camera!: ReturnType<typeof useSensingBridge>;
  function Harness() {
    const ref = useRef<HTMLIFrameElement | null>(null);
    voice = useVoiceMeterBridge(ref);
    camera = useSensingBridge(ref);
    usePresenceBridge(ref, 'test');
    useZoneBridge(ref, 'test');
    return <iframe ref={ref} />;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    act(() => root.render(<Harness />));
    const frame = container.querySelector('iframe')!;
    vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
    const send = (t: string, fields = {}) =>
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'null',
          source: frame.contentWindow,
          data: { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t, ...fields },
        }),
      );
    await act(async () => {
      send('voice:hello');
      send('sensing:hello', { features: ['backdrop'] });
      send('presence:hello');
      send('zone:hello', { v: ZONE_PROTOCOL_VERSION });
    });
    await act(async () => {
      voice.toggle();
      camera.backdrop.start();
      send('presence:here', { col: 1, row: 2 });
    });
    expect(sockets).toHaveLength(1);
    await act(async () => markGameFrameLoadedByHost(frame));
    if (!pending) {
      expect(voice.live).toBe(true);
      expect(camera.backdrop.live).toBe(true);
    }
    await act(async () => {
      markGameFrameNavigatedAway(frame);
      for (const resolve of resolvers) resolve();
    });
    expect(stop).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledOnce();
    expect(sockets[0]?.closed).toBe(true);
    expect(voice.available).toBe(false);
    expect(voice.live).toBe(false);
    expect(camera.backdrop.engaged).toBe(false);
    expect(camera.backdrop.live).toBe(false);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1);
    await act(async () => markGameFrameLoadedByHost(frame));
    await act(async () => send('voice:hello'));
    expect(voice.available).toBe(true);
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
