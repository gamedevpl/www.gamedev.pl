// @vitest-environment jsdom
import { documentMessage } from './test-utils/frameMessage.js';
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { markGameFrameNavigatedAway } from './frameMessage.js';
import { useWorldBridge } from './world.js';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';

function Harness() {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  useWorldBridge(frameRef, 'shared-garden');
  return <iframe ref={frameRef} />;
}

function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<Harness />));
  const frame = container.querySelector('iframe')!;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
  const send = (payload: Record<string, unknown>) =>
    window.dispatchEvent(
      documentMessage('message', {
        origin: 'null',
        source: frame.contentWindow,
        data: { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload },
      }),
    );
  return {
    frame,
    post,
    send,
    close: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('bridge navigation boundaries', () => {
  it('ignores requests after the iframe navigates', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const host = mount();
    try {
      markGameFrameNavigatedAway(host.frame);
      host.send({ t: 'commons:hello' });
      host.send({ t: 'commons:put', key: 'plot.7', fields: { plant: 'fern' } });
      await act(async () => {});
      expect(fetch).not.toHaveBeenCalled();
      expect(host.post).not.toHaveBeenCalled();
    } finally {
      host.close();
    }
  });

  it('drops an asynchronous reply after navigation', async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const host = mount();
    try {
      host.send({ t: 'commons:hello' });
      expect(fetch).toHaveBeenCalledOnce();
      markGameFrameNavigatedAway(host.frame);
      await act(async () => {
        resolve({ ok: true, json: async () => ({ entries: [], maxPerPlayer: 3, writable: true }) } as Response);
      });
      expect(host.post).not.toHaveBeenCalled();
    } finally {
      host.close();
    }
  });
});
