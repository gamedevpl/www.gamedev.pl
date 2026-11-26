// @vitest-environment jsdom
import { documentMessage } from './test-utils/frameMessage.js';

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameSaveBridge } from './gameSave.js';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';

function Harness() {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  useGameSaveBridge(frameRef, 'crypt-delver');
  return <iframe ref={frameRef} title="game" />;
}

describe('useGameSaveBridge for a signed-out player', () => {
  let root: Root | null = null;
  let container: HTMLDivElement;
  let toGame: Array<Record<string, unknown>>;
  const fetchMock = vi.fn();

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    toGame = [];
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container.remove();
    vi.restoreAllMocks();
  });

  function mount() {
    if (root) act(() => root!.unmount());
    toGame = [];
    root = createRoot(container);
    act(() => root!.render(<Harness />));
    const gameWindow = (container.querySelector('iframe') as HTMLIFrameElement).contentWindow as Window;
    vi.spyOn(gameWindow, 'postMessage').mockImplementation(((message: Record<string, unknown>) => {
      toGame.push(message);
    }) as typeof gameWindow.postMessage);
    return (payload: Record<string, unknown>) =>
      window.dispatchEvent(
        documentMessage('message', {
          data: { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload },
          source: gameWindow,
          origin: 'null',
        }),
      );
  }

  async function settle() {
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 2));
  }

  it('keeps the save in this browser across a reload, and never writes to the API', async () => {
    let fromGame = mount();
    fromGame({ t: 'save:hello', version: 2 });
    await settle();
    fromGame({ t: 'save:put', data: '{"stamps":["japan"]}', version: 2 });
    await settle();
    expect(toGame.at(-1)).toMatchObject({ t: 'save:ack', ok: true });

    fromGame = mount();
    fromGame({ t: 'save:hello', version: 2 });
    await settle();
    expect(toGame[0]).toMatchObject({ t: 'save:state', available: true, data: '{"stamps":["japan"]}', version: 2 });
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });

  it('clears the device slot on save:clear', async () => {
    window.localStorage.setItem('gdp.save.crypt-delver', JSON.stringify({ data: '{"a":1}', version: 1 }));
    const fromGame = mount();
    fromGame({ t: 'save:hello', version: 1 });
    await settle();
    expect(toGame[0]).toMatchObject({ data: '{"a":1}' });
    fromGame({ t: 'save:clear' });
    await settle();
    expect(window.localStorage.getItem('gdp.save.crypt-delver')).toBeNull();
  });

  it('hands a device save to an empty account slot after sign-in', async () => {
    window.localStorage.setItem('gdp.save.crypt-delver', JSON.stringify({ data: '{"guest":1}', version: 3 }));
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: null, version: 0 }) } as Response);
    const fromGame = mount();
    fromGame({ t: 'save:hello', version: 3 });
    await settle();
    expect(toGame[0]).toMatchObject({ t: 'save:state', available: true, data: '{"guest":1}', version: 3 });
  });

  it('keeps an account save over a device save', async () => {
    window.localStorage.setItem('gdp.save.crypt-delver', JSON.stringify({ data: '{"guest":1}', version: 3 }));
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: '{"acct":1}', version: 3 }),
    } as Response);
    const fromGame = mount();
    fromGame({ t: 'save:hello', version: 3 });
    await settle();
    expect(toGame[0]).toMatchObject({ data: '{"acct":1}' });
  });

  it('retires the device save once the account accepts a write', async () => {
    window.localStorage.setItem('gdp.save.crypt-delver', JSON.stringify({ data: '{"guest":1}', version: 3 }));
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method
        ? ({ ok: true, status: 204, json: async () => ({}) } as Response)
        : ({ ok: true, status: 200, json: async () => ({ data: null, version: 0 }) } as Response),
    );
    const fromGame = mount();
    fromGame({ t: 'save:hello', version: 3 });
    await settle();
    fromGame({ t: 'save:clear' });
    await settle();
    expect(toGame.at(-1)).toMatchObject({ t: 'save:ack', ok: true });
    expect(window.localStorage.getItem('gdp.save.crypt-delver')).toBeNull();
  });
});
