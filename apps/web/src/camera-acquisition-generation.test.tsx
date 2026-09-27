// @vitest-environment jsdom
import { documentMessage } from './test-utils/frameMessage.js';
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { useSensingBridge, type SensingBridge } from './sensing.js';

function deferred() {
  let resolve!: (stream: MediaStream) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<MediaStream>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function stream() {
  const stop = vi.fn();
  return { value: { getTracks: () => [{ kind: 'video', stop }] } as unknown as MediaStream, stop };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(['resolved', 'rejected'] as const)(
  'keeps the newer acquisition locked when an old request is %s',
  async (settlement) => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const old = deferred();
    const current = deferred();
    const oldStream = stream();
    const currentStream = stream();
    const getUserMedia = vi.fn().mockReturnValueOnce(old.promise).mockReturnValue(current.promise);
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let bridge!: SensingBridge;
    function Harness() {
      const frameRef = useRef<HTMLIFrameElement | null>(null);
      bridge = useSensingBridge(frameRef);
      return <iframe ref={frameRef} title="game" />;
    }
    act(() => root.render(<Harness />));
    const source = container.querySelector('iframe')!.contentWindow!;
    vi.spyOn(source, 'postMessage').mockImplementation(() => {});
    act(() =>
      window.dispatchEvent(
        documentMessage('message', {
          source,
          origin: 'null',
          data: { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: 'sensing:hello', features: ['backdrop'] },
        }),
      ),
    );
    try {
      act(() => bridge.backdrop.start());
      act(() => bridge.backdrop.stop());
      act(() => bridge.backdrop.start());
      expect(getUserMedia).toHaveBeenCalledTimes(2);
      await act(async () => {
        if (settlement === 'resolved') old.resolve(oldStream.value);
        else old.reject(new Error('old permission denied'));
        await old.promise.catch(() => {});
      });
      act(() => bridge.backdrop.start());
      expect(getUserMedia).toHaveBeenCalledTimes(2);
      if (settlement === 'resolved') expect(oldStream.stop).toHaveBeenCalledOnce();
      await act(async () => {
        current.resolve(currentStream.value);
        await current.promise;
      });
      expect(bridge.backdrop.stream).toBe(currentStream.value);
      act(() => bridge.backdrop.stop());
      expect(currentStream.stop).toHaveBeenCalledOnce();
      expect(bridge.backdrop.stream).toBeNull();
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  },
);
