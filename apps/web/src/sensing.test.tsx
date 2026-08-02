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
      facing: null,
    });
  });

  it('reads a hello with no feature list as asking for nothing', () => {
    expect(parseSensingMessage(frame({ t: 'sensing:hello' }))).toEqual({
      t: 'sensing:hello',
      features: [],
      facing: null,
    });
  });

  it('parses backdrop facing, defaulting to user', () => {
    expect(parseSensingMessage(frame({ t: 'sensing:hello', features: ['backdrop'] }))).toEqual({
      t: 'sensing:hello',
      features: ['backdrop'],
      facing: 'user',
    });
    expect(parseSensingMessage(frame({ t: 'sensing:hello', features: ['backdrop'], facing: 'environment' }))).toEqual({
      t: 'sensing:hello',
      features: ['backdrop'],
      facing: 'environment',
    });
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
    root = null;
    container.remove();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
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
    expect(toGame[0]).toMatchObject({
      ns: BRIDGE_NAMESPACE,
      v: PROTOCOL_VERSION,
      t: 'sensing:state',
      active: false,
      backdrop: false,
    });
  });

  it('ignores a hello that asks for neither tilt nor backdrop', () => {
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
    const { fromGame } = mount();
    fromGame({ t: 'sensing:hello', features: ['face'] });
    expect(latest().engaged).toBe(false);
    expect(latest().backdrop.engaged).toBe(false);
    expect(toGame).toHaveLength(0);
  });

  it('re-hello with a narrower feature set drops the omitted engagement', async () => {
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
    const trackStop = vi.fn();
    const fakeStream = {
      getTracks: () => [{ stop: trackStop, kind: 'video' }],
    } as unknown as MediaStream;
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn(() => Promise.resolve(fakeStream)) },
    });

    const { fromGame } = mount();
    fromGame({ t: 'sensing:hello', features: ['tilt', 'backdrop'] });
    expect(latest().engaged).toBe(true);
    expect(latest().backdrop.engaged).toBe(true);
    await act(async () => {
      latest().backdrop.start();
      await Promise.resolve();
    });
    expect(latest().backdrop.live).toBe(true);

    fromGame({ t: 'sensing:hello', features: ['tilt'] });
    expect(latest().engaged).toBe(true);
    expect(latest().backdrop.engaged).toBe(false);
    expect(latest().backdrop.live).toBe(false);
    expect(trackStop).toHaveBeenCalled();

    fromGame({ t: 'sensing:hello', features: ['backdrop'] });
    expect(latest().engaged).toBe(false);
    expect(latest().backdrop.engaged).toBe(true);
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

  it('re-sends a held, unmoving stick before the game-side decay window', () => {
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { fromGame } = mount();
    fromGame({ t: 'sensing:hello', features: ['tilt'] });
    toGame.length = 0;

    act(() => window.dispatchEvent(orientation(40, 0)));
    now = 1100;
    act(() => window.dispatchEvent(orientation(40, 14)));
    expect(tiltFrames()).toHaveLength(1);

    // Same reading 100ms later: inside the heartbeat window, correctly suppressed.
    now = 1200;
    act(() => window.dispatchEvent(orientation(40, 14)));
    expect(tiltFrames()).toHaveLength(1);

    // Still holding the same turn past the heartbeat: must be re-sent, or the game's
    // ~1.2s staleness decay would read a steady hand as letting go.
    now = 1600;
    act(() => window.dispatchEvent(orientation(40, 14)));
    expect(tiltFrames()).toHaveLength(2);
    expect(tiltFrames()[1]).toMatchObject({ x: 0.5, y: 0 });

    // A level stick does not heartbeat — there is nothing to keep alive.
    now = 1700;
    act(() => window.dispatchEvent(orientation(40, 0)));
    expect(tiltFrames()).toHaveLength(3);
    now = 2300;
    act(() => window.dispatchEvent(orientation(40, 0)));
    expect(tiltFrames()).toHaveLength(3);
  });

  it('rotates the stick into the current screen orientation', () => {
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
    vi.stubGlobal('screen', { orientation: { angle: 90 } });
    const { fromGame } = mount();
    fromGame({ t: 'sensing:hello', features: ['tilt'] });
    toGame.length = 0;

    act(() => window.dispatchEvent(orientation(40, 0)));
    // Device-frame delta (x: 0.5, y: 1); at 90° the screen sees x from device y.
    act(() => window.dispatchEvent(orientation(80, 14)));
    expect(tiltFrames()[0]).toMatchObject({ x: 1, y: -0.5 });
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

  it('engages backdrop on hello without starting the camera', () => {
    const { fromGame } = mount();
    fromGame({ t: 'sensing:hello', features: ['backdrop'], facing: 'environment' });
    expect(latest().engaged).toBe(false);
    expect(latest().backdrop.engaged).toBe(true);
    expect(latest().backdrop.facing).toBe('environment');
    expect(latest().backdrop.live).toBe(false);
    expect(toGame[0]).toMatchObject({ t: 'sensing:state', active: false, backdrop: false });
  });

  it('ignores a second Start while getUserMedia is still settling', async () => {
    let resolveMedia!: (stream: MediaStream) => void;
    const pending = new Promise<MediaStream>((resolve) => {
      resolveMedia = resolve;
    });
    const getUserMedia = vi.fn(() => pending);
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia },
    });

    const { fromGame } = mount();
    fromGame({ t: 'sensing:hello', features: ['backdrop'] });
    act(() => latest().backdrop.start());
    act(() => latest().backdrop.start());
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    const trackStop = vi.fn();
    const fakeStream = {
      getTracks: () => [{ stop: trackStop, kind: 'video' }],
    } as unknown as MediaStream;
    await act(async () => {
      resolveMedia(fakeStream);
      await Promise.resolve();
    });
    expect(latest().backdrop.live).toBe(true);
  });

  it('rejects a stream that resolves after the tab hides', async () => {
    let resolveMedia!: (stream: MediaStream) => void;
    const pending = new Promise<MediaStream>((resolve) => {
      resolveMedia = resolve;
    });
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn(() => pending) },
    });

    const { fromGame } = mount();
    fromGame({ t: 'sensing:hello', features: ['backdrop'] });
    act(() => latest().backdrop.start());

    const trackStop = vi.fn();
    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await act(async () => {
      resolveMedia({
        getTracks: () => [{ stop: trackStop, kind: 'video' }],
      } as unknown as MediaStream);
      await Promise.resolve();
    });
    expect(trackStop).toHaveBeenCalled();
    expect(latest().backdrop.live).toBe(false);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('starts and stops a camera stream from a gesture, posting backdrop state', async () => {
    const trackStop = vi.fn();
    const fakeTrack = { stop: trackStop, kind: 'video' };
    const fakeStream = {
      getTracks: () => [fakeTrack],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn((_constraints: MediaStreamConstraints): Promise<MediaStream> =>
      Promise.resolve(fakeStream),
    );
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia },
    });

    const { fromGame } = mount();
    fromGame({ t: 'sensing:hello', features: ['backdrop'] });
    expect(latest().backdrop.supported).toBe(true);
    toGame.length = 0;

    await act(async () => {
      latest().backdrop.start();
      await Promise.resolve();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    const constraints = getUserMedia.mock.calls[0]?.[0];
    const facingIdeal =
      constraints && typeof constraints.video === 'object' && constraints.video && 'facingMode' in constraints.video
        ? (constraints.video as { facingMode?: { ideal?: string } }).facingMode?.ideal
        : undefined;
    expect(facingIdeal).toBe('user');
    expect(latest().backdrop.live).toBe(true);
    expect(latest().backdrop.stream).toBe(fakeStream);
    expect(toGame.some((m) => m.t === 'sensing:state' && m.backdrop === true)).toBe(true);

    act(() => latest().backdrop.stop());
    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(latest().backdrop.live).toBe(false);
    expect(latest().backdrop.stream).toBeNull();
    expect(toGame.some((m) => m.t === 'sensing:state' && m.backdrop === false)).toBe(true);
  });

  it('stops the camera when the tab hides and on unmount', async () => {
    const trackStop = vi.fn();
    const fakeStream = {
      getTracks: () => [{ stop: trackStop, kind: 'video' }],
    } as unknown as MediaStream;
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn(() => Promise.resolve(fakeStream)) },
    });

    const { fromGame } = mount();
    fromGame({ t: 'sensing:hello', features: ['backdrop'] });
    await act(async () => {
      latest().backdrop.start();
      await Promise.resolve();
    });
    expect(latest().backdrop.live).toBe(true);

    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(trackStop).toHaveBeenCalled();
    expect(latest().backdrop.live).toBe(false);

    // Restart and prove unmount also stops tracks.
    trackStop.mockClear();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => {
      latest().backdrop.start();
      await Promise.resolve();
    });
    act(() => root!.unmount());
    root = null;
    expect(trackStop).toHaveBeenCalled();
  });
});
