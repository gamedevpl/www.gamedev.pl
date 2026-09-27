// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { useGameSaveBridge } from './gameSave.js';
import { useWorldBridge } from './world.js';
import { prepareGameFrameDocument, markGameFrameLoadedByHost } from './frameMessage.js';
import { documentMessage, replaceTestFrameDocument } from './test-utils/frameMessage.js';

function setup(kind: 'save' | 'commons') {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const resolvers: ((response: Response) => void)[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>((resolve) => resolvers.push(resolve)));
  vi.stubGlobal('fetch', fetch);
  function Harness() {
    const ref = useRef<HTMLIFrameElement | null>(null);
    useGameSaveBridge(ref, kind === 'save' ? 'test' : undefined);
    useWorldBridge(ref, kind === 'commons' ? 'test' : undefined);
    return <iframe ref={ref} />;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<Harness />));
  const frame = container.querySelector('iframe')!;
  const win = frame.contentWindow!;
  const replies: unknown[] = [];
  vi.spyOn(win, 'postMessage').mockImplementation((payload) => {
    replies.push(payload);
  });
  const send = (payload: Record<string, unknown>) =>
    window.dispatchEvent(
      documentMessage('message', {
        source: win,
        origin: 'null',
        data: { ns: 'gdp', v: 1, ...payload },
      }),
    );
  return {
    fetch,
    replies,
    frame,
    send,
    replace() {
      act(() => {
        prepareGameFrameDocument(frame, 'replacement');
        replaceTestFrameDocument(win);
      });
    },
    async finish(body: unknown) {
      await act(async () => resolvers.shift()!({ ok: true, status: 200, json: async () => body } as Response));
    },
    cleanup() {
      act(() => root.unmount());
      container.remove();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
}

describe.each(['save', 'commons'] as const)('%s persistence across documents', (kind) => {
  it('serializes writes across a replacement and acknowledges only their document', async () => {
    const host = setup(kind);
    const put = (value: string) =>
      kind === 'save'
        ? { t: 'save:put', data: value, version: 1 }
        : { t: 'commons:put', key: 'plot.1', fields: { note: value } };
    try {
      host.send(put('old'));
      expect(host.fetch).toHaveBeenCalledTimes(1);
      host.replace();
      host.send(put('new'));
      expect(host.fetch).toHaveBeenCalledTimes(1);
      await host.finish({ ok: true });
      expect(host.fetch).toHaveBeenCalledTimes(2);
      expect(host.replies).toHaveLength(0);
      const body = JSON.parse(host.fetch.mock.calls[1]![1]!.body as string);
      expect(body).toEqual(kind === 'save' ? { data: 'new', version: 1 } : { fields: { note: 'new' } });
      await host.finish({ ok: true });
      expect(host.replies).toEqual([expect.objectContaining({ t: `${kind}:ack`, ok: true })]);
    } finally {
      host.cleanup();
    }
  });

  it('answers a hello even when the replacement host load arrives during its read', async () => {
    const host = setup(kind);
    try {
      host.replace();
      host.send({ t: `${kind}:hello`, version: 1 });
      act(() => markGameFrameLoadedByHost(host.frame));
      await host.finish(
        kind === 'save' ? { data: 'saved', version: 1 } : { entries: [], writable: true, maxPerPlayer: 3 },
      );
      expect(host.replies).toEqual([expect.objectContaining({ t: `${kind}:state`, available: true })]);
    } finally {
      host.cleanup();
    }
  });
});

it('queues a replacement clear behind an older in-flight save put', async () => {
  const host = setup('save');
  try {
    host.send({ t: 'save:put', data: 'old', version: 1 });
    host.replace();
    host.send({ t: 'save:clear' });
    expect(host.fetch).toHaveBeenCalledTimes(1);
    await host.finish({ ok: true });
    expect(host.fetch.mock.calls.map(([, init]) => init?.method)).toEqual(['PUT', 'DELETE']);
    await host.finish({ ok: true });
    expect(host.replies).toEqual([expect.objectContaining({ t: 'save:ack', ok: true })]);
  } finally {
    host.cleanup();
  }
});
