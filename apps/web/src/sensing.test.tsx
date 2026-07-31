// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { parseSensingMessage, useSensingBridge, type SensingBridge } from './sensing.js';

/**
 * The sensing bridge is the shell half of games-repo camera-ar-platform Phase 0: the
 * sandboxed game cannot reach the device's sensors (and the iframe must never gain an
 * `allow=` for them), so this side reads `deviceorientation` and relays a clamped,
 * throttled stick. Most of what is worth testing is what does NOT happen: no relay
 * before a game asks, no reaction to a foreign window's hello, no raw readings
 * anywhere — only the derived `{ x, y }` ever crosses into the frame, and nothing at
 * all leaves the browser.
 */

function frame(payload: Record<string, unknown>) {
  return { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload };
}

/** jsdom has no orientation event constructor worth using — stage a plain Event. */
function orientation(beta: number, gamma: number): Event {
  const event = new Event('deviceorientation');
  Object.assign(event, { beta, gamma });
  return event;
}

describe('parseSensingMessage', () => {
  it('accepts a hello and keeps only string features', () => {
    expect(parseSensingMessage(frame({ t: 'sensing:hello', features: ['tilt', 7, null] }))).toEqual({
      t: 'sensing:hello',
      features: ['tilt'],
    });
  });

  it('reads a hello with no feature list as asking for nothing', () => {
    expect(parseSensingMessage(frame({ t: 'sensing:hello' }))).toEqual({ t: 'sensing:hello', features: [] });
  });

  it('drops anything outside the namespace, version, or type', () => {
    expect(parseSensingMessage({ t: 'sensing:hello', features: ['tilt'] })).toBeNull();
    expect(parseSensingMessage(frame({ t: 'sensing:tilt', x: 1, y: 1 }))).toBeNull();
    expect(parseSensingMessage({ ns: 'other', v: PROTOCOL_VERSION, t: 'sensing:hello' })).toBeNull();
    expect(parseSensingMessage({ ns: BRIDGE_NAMESPACE, v: 99, t: 'sensing:hello' })).toBeNull();
    expect(parseSensingMessage(null)).toBeNull();
  });
});

function Harness({ seen }: { seen: SensingBridge[] }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  seen.push(useSensingBridge(frameRef));
  return <iframe ref={frameRef} title="game" />;
}

describe('useSensingBridge', () => {
  let toGame: Array<Record<string, unknown>>;
  let container: HTMLDivElement;
  let root: Root | null;
  let seen: SensingBridge[];

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    toGame = [];
    seen = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = null;
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function mount() {
    root = createRoot(container);
    act(() => root!.render(<Harness seen={seen} />));
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const gameWindow = iframe.contentWindow as Window;
    vi.spyOn(gameWindow, 'postMessage').mockImplementation(((message: Record<string, unknown>) => {
      toGame.push(message);
    }) as typeof gameWindow.postMessage);

    const fromGame = (payload: Record<string, unknown>) => {
      act(() => {
        window.dispatchEvent(new MessageEvent('message', { data: frame(payload), source: gameWindow }));
      });
    };
    return { fromGame, gameWindow };
  }

  function latest(): SensingBridge {
    return seen[seen.length - 1]!;
  }

  function tiltFrames() {
    return toGame.filter((message) => message.t === 'sensing:tilt');
  }

  it('does nothing until a game says hello, and answers the hello with current state', () => {
    // Android shape: events would flow, but no game has asked, so no listener yet.
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
    const { fromGame } = mount();
    expect(latest().engaged).toBe(false);
    expect(toGame).toHaveLength(0);

    fromGame({ t: 'sensing:hello', features: ['tilt'] });
    expect(latest().engaged).toBe(true);
    // The opening answer says where things stand, so a game does not sit out its
    // handshake timeout: nothing is flowing yet, and that is a normal state.
    expect(toGame[0]).toMatchObject({ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: 'sensing:state', active: false });
  });

  it('ignores a hello that does not ask for tilt', () => {
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
    const { fromGame } = mount();
    fromGame({ t: 'sensing:hello', features: ['face'] });
    expect(latest().engaged).toBe(false);
    expect(toGame).toHaveLength(0);
  });

  it('ignores gdp traffic from any window that is not the served frame', () => {
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
    mount();
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: frame({ t: 'sensing:hello', features: ['tilt'] }), source: window }),
      );
    });
    expect(latest().engaged).toBe(false);
    expect(toGame).toHaveLength(0);
  });

  it('relays a clamped stick relative to the first reading, and only after it', () => {
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
    const { fromGame } = mount();
    fromGame({ t: 'sensing:hello', features: ['tilt'] });
    toGame.length = 0;

    // First reading is the baseline — how the player happens to hold the phone — and
    // must not steer.
    act(() => window.dispatchEvent(orientation(40, 0)));
    expect(tiltFrames()).toHaveLength(0);

    // 14° right of baseline is half deflection; 40° forward clamps to 1.
    act(() => window.dispatchEvent(orientation(80, 14)));
    expect(latest().active).toBe(true);
    expect(toGame.some((m) => m.t === 'sensing:state' && m.active === true)).toBe(true);
    expect(tiltFrames()).toHaveLength(1);
    expect(tiltFrames()[0]).toMatchObject({ x: 0.5, y: 1 });
  });

  it('reads a wobble inside the deadzone as level', () => {
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
    const { fromGame } = mount();
    fromGame({ t: 'sensing:hello', features: ['tilt'] });
    toGame.length = 0;

    act(() => window.dispatchEvent(orientation(40, 0)));
    // 1° of gamma is ~0.036 deflection — hand tremor, not intent.
    act(() => window.dispatchEvent(orientation(40.5, 1)));
    expect(tiltFrames()).toHaveLength(0);
  });

  it('stops listening on unmount', () => {
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { fromGame } = mount();
    fromGame({ t: 'sensing:hello', features: ['tilt'] });
    act(() => root!.unmount());
    root = null;
    expect(removeSpy.mock.calls.some(([type]) => type === 'deviceorientation')).toBe(true);
  });

  it('needs a gesture-granted permission on the iOS shape before any listener attaches', async () => {
    const requestPermission = vi.fn(() => Promise.resolve('granted'));
    const ctor = function DeviceOrientationEvent() {} as unknown as Record<string, unknown>;
    ctor.requestPermission = requestPermission;
    vi.stubGlobal('DeviceOrientationEvent', ctor);

    const { fromGame } = mount();
    fromGame({ t: 'sensing:hello', features: ['tilt'] });
    expect(latest().needsPermission).toBe(true);

    // Before the grant: readings must be ignored entirely.
    act(() => window.dispatchEvent(orientation(40, 0)));
    act(() => window.dispatchEvent(orientation(80, 14)));
    expect(tiltFrames()).toHaveLength(0);

    await act(async () => {
      latest().request();
      await Promise.resolve();
    });
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(latest().needsPermission).toBe(false);

    act(() => window.dispatchEvent(orientation(40, 0)));
    act(() => window.dispatchEvent(orientation(80, 14)));
    expect(tiltFrames()).toHaveLength(1);
  });
});
