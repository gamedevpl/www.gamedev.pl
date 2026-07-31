// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { parseVoiceMeterMessage, useVoiceMeterBridge } from './voiceMeter.js';

function frame(payload: Record<string, unknown>) {
  return { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload };
}

describe('parseVoiceMeterMessage', () => {
  it('accepts hello / start / stop from the game', () => {
    expect(parseVoiceMeterMessage(frame({ t: 'voice:hello' }))).toEqual({ t: 'voice:hello' });
    expect(parseVoiceMeterMessage(frame({ t: 'voice:start' }))).toEqual({ t: 'voice:start' });
    expect(parseVoiceMeterMessage(frame({ t: 'voice:stop' }))).toEqual({ t: 'voice:stop' });
  });

  it('drops foreign namespaces, versions, and unknown types', () => {
    expect(parseVoiceMeterMessage({ t: 'voice:hello' })).toBeNull();
    expect(parseVoiceMeterMessage({ ns: 'other', v: PROTOCOL_VERSION, t: 'voice:hello' })).toBeNull();
    expect(parseVoiceMeterMessage({ ns: BRIDGE_NAMESPACE, v: 99, t: 'voice:hello' })).toBeNull();
    expect(parseVoiceMeterMessage(frame({ t: 'voice:level', value: 0.5 }))).toBeNull();
    expect(parseVoiceMeterMessage(null)).toBeNull();
  });
});

function Harness({ onBridge }: { onBridge?: (bridge: ReturnType<typeof useVoiceMeterBridge>) => void }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const bridge = useVoiceMeterBridge(frameRef);
  onBridge?.(bridge);
  return <iframe ref={frameRef} title="game" />;
}

describe('useVoiceMeterBridge', () => {
  let toGame: Array<Record<string, unknown>>;
  let container: HTMLDivElement;
  let root: Root | null;
  let latest: ReturnType<typeof useVoiceMeterBridge> | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    toGame = [];
    latest = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = null;

    class FakeAnalyser {
      fftSize = 1024;
      smoothingTimeConstant = 0;
      connect() {}
      disconnect() {}
      getByteTimeDomainData(target: Uint8Array) {
        for (let i = 0; i < target.length; i++) target[i] = 128 + (i % 2 === 0 ? 40 : -40);
      }
    }
    class FakeAudioContext {
      state = 'running';
      createMediaStreamSource() {
        return { connect() {} };
      }
      createAnalyser() {
        return new FakeAnalyser();
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: vi.fn() }],
        })),
      },
    });
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function mount() {
    root = createRoot(container);
    act(() => {
      root!.render(
        <Harness
          onBridge={(bridge) => {
            latest = bridge;
          }}
        />,
      );
    });
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const gameWindow = iframe.contentWindow as Window;
    vi.spyOn(gameWindow, 'postMessage').mockImplementation(((message: Record<string, unknown>) => {
      toGame.push(message);
    }) as typeof gameWindow.postMessage);

    const fromGame = (payload: Record<string, unknown>) => {
      window.dispatchEvent(new MessageEvent('message', { data: frame(payload), source: gameWindow }));
    };
    return { fromGame };
  }

  it('stays quiet until the game says voice:hello, then announces idle', () => {
    const { fromGame } = mount();
    expect(latest?.available).toBe(false);
    expect(toGame).toEqual([]);

    act(() => fromGame({ t: 'voice:hello' }));
    expect(latest?.available).toBe(true);
    expect(toGame).toContainEqual({
      ns: BRIDGE_NAMESPACE,
      v: PROTOCOL_VERSION,
      t: 'voice:state',
      status: 'idle',
    });
  });

  it('toggle starts the mic after hello and relays live state', async () => {
    const { fromGame } = mount();
    act(() => fromGame({ t: 'voice:hello' }));
    toGame.length = 0;

    await act(async () => {
      latest!.toggle();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latest?.status).toBe('live');
    expect(toGame.some((m) => m.t === 'voice:state' && m.status === 'live')).toBe(true);
  });

  it('stops a pending or live mic when the document is hidden', async () => {
    const { fromGame } = mount();
    act(() => fromGame({ t: 'voice:hello' }));

    await act(async () => {
      latest!.toggle();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest?.status).toBe('live');

    await act(async () => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(latest?.status).toBe('idle');
  });
});
