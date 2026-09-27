// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useVoiceMeterBridge } from './voiceMeter.js';
import { markGameFrameLoadedByHost, markGameFrameNavigatedAway } from './frameMessage.js';

it.each(['resolve', 'reject'])('ignores stale microphone %s after replacement capture', async (outcome) => {
  let resolve!: (stream: MediaStream) => void;
  let reject!: (error: Error) => void;
  const old = new Promise<MediaStream>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const oldStop = vi.fn();
  const newStop = vi.fn();
  const stream = (stop: () => void) => ({ getTracks: () => [{ stop }] }) as unknown as MediaStream;
  let resolveNew!: (stream: MediaStream) => void;
  const next = new Promise<MediaStream>((yes) => {
    resolveNew = yes;
  });
  const getUserMedia = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(next);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  class AudioContext {
    state = 'running';
    close() {
      return Promise.resolve();
    }
    createMediaStreamSource() {
      return { connect() {} };
    }
    createAnalyser() {
      return { fftSize: 1024, getByteTimeDomainData() {} };
    }
  }
  vi.stubGlobal('AudioContext', AudioContext);
  let bridge!: ReturnType<typeof useVoiceMeterBridge>;
  function Harness() {
    const ref = useRef<HTMLIFrameElement | null>(null);
    bridge = useVoiceMeterBridge(ref);
    return <iframe ref={ref} />;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    act(() => root.render(<Harness />));
    const frame = container.querySelector('iframe')!;
    vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
    const hello = () =>
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'null',
          source: frame.contentWindow,
          data: { ns: 'gdp', v: 1, t: 'voice:hello' },
        }),
      );
    act(hello);
    act(() => bridge.toggle());
    expect(bridge.status).toBe('pending');
    await act(async () => markGameFrameNavigatedAway(frame));
    await act(async () => markGameFrameLoadedByHost(frame));
    act(hello);
    await act(async () => bridge.toggle());
    expect(bridge.status).toBe('pending');
    await act(async () => {
      if (outcome === 'reject') reject(new Error('old permission rejected'));
      else resolve(stream(oldStop));
    });
    expect(bridge.status).toBe('pending');
    expect(newStop).not.toHaveBeenCalled();
    if (outcome === 'resolve') expect(oldStop).toHaveBeenCalledOnce();
    await act(async () => resolveNew(stream(newStop)));
    expect(bridge.status).toBe('live');
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
