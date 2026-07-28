// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  angleDelta,
  gravityAlignment,
  isFreeFall,
  shakeJerk,
  SHAKE_DELIGHT_AT,
  tiltFromOrientation,
  useDeviceTilt,
  type DeviceTilt,
} from './useDeviceTilt.js';

describe('tilt maths', () => {
  it('takes the short way round the circle', () => {
    // gamma/alpha wrap, so a small physical turn can look like a 358° swing.
    expect(angleDelta(359, 1)).toBe(2);
    expect(angleDelta(1, 359)).toBe(-2);
    expect(angleDelta(0, 0)).toBe(0);
  });

  it('measures tilt from how the phone was first held, not from flat', () => {
    // Held up to read: beta ~60. That must be the neutral, or he starts pinned down.
    const baseline = { beta: 60, gamma: 0 };
    expect(tiltFromOrientation({ beta: 60, gamma: 0 }, baseline)).toEqual({ x: 0, y: 0 });

    const leaned = tiltFromOrientation({ beta: 74, gamma: 14 }, baseline);
    expect(leaned.x).toBeCloseTo(0.5, 2);
    expect(leaned.y).toBeCloseTo(0.5, 2);
  });

  it('clamps a phone turned right over', () => {
    const hard = tiltFromOrientation({ beta: 180, gamma: -90 }, { beta: 0, gamma: 0 });
    expect(hard.x).toBe(-1);
    expect(hard.y).toBeLessThanOrEqual(1);
    expect(hard.y).toBeGreaterThanOrEqual(-1);
  });

  it('survives a reading with no angles', () => {
    expect(tiltFromOrientation({ beta: null, gamma: null }, { beta: 30, gamma: 10 })).toEqual({ x: 0, y: 0 });
  });

  it('scores a shake by the change between samples, not by gravity', () => {
    // A still phone still reads ~9.8 on one axis — that must not count as a shake.
    const still = { x: 0, y: 9.8, z: 0 };
    expect(shakeJerk(still, still)).toBe(0);
    expect(shakeJerk(still, { x: 0, y: -9.8, z: 0 })).toBeCloseTo(19.6, 1);
  });
});

describe('turning the phone over', () => {
  const held = { x: 0, y: 9.8, z: 0 };

  it('measures against how you were holding it, not against an axis', () => {
    expect(gravityAlignment(held, held)).toBeCloseTo(1, 3);
    expect(gravityAlignment(held, { x: 0, y: -9.8, z: 0 })).toBeCloseTo(-1, 3);
    expect(gravityAlignment(held, { x: 9.8, y: 0, z: 0 })).toBeCloseTo(0, 3);
  });

  /**
   * The point of doing it this way: a device whose axes are signed the other way
   * round still reports "same as I started" as +1 and "turned over" as −1, because
   * the quantity is an angle between two of its own readings. Guessing an absolute
   * axis sign wrong would invert the whole feature on half the devices.
   */
  it('is independent of which way the axes are signed', () => {
    const heldOtherConvention = { x: 0, y: -9.8, z: 0 };
    expect(gravityAlignment(heldOtherConvention, heldOtherConvention)).toBeCloseTo(1, 3);
    expect(gravityAlignment(heldOtherConvention, { x: 0, y: 9.8, z: 0 })).toBeCloseTo(-1, 3);
  });

  it('works for a phone that started flat on a table', () => {
    const flat = { x: 0, y: 0, z: 9.8 };
    expect(gravityAlignment(flat, { x: 0, y: 0, z: -9.8 })).toBeCloseTo(-1, 3);
  });

  it('refuses to guess a direction from a falling sample', () => {
    // No usable "down" while falling — 0 keeps it clear of both flip thresholds.
    expect(gravityAlignment(held, { x: 0.1, y: 0.1, z: 0.1 })).toBe(0);
    expect(gravityAlignment({ x: 0, y: 0, z: 0 }, held)).toBe(0);
  });
});

describe('dropping the phone', () => {
  it('knows a fall from a hold', () => {
    // At rest something reads ~9.8; in free fall the accelerometer sees ~nothing.
    expect(isFreeFall({ x: 0, y: 0, z: 0 })).toBe(true);
    expect(isFreeFall({ x: 0.4, y: -0.9, z: 1.1 })).toBe(true);
    expect(isFreeFall({ x: 0, y: 9.8, z: 0 })).toBe(false);
    // A brisk wave is high-magnitude, not low — it must not read as a drop.
    expect(isFreeFall({ x: 4, y: 14, z: 3 })).toBe(false);
  });
});

/**
 * jsdom's DeviceMotionEvent constructor drops the init dictionary, so the payload is
 * attached to a plain Event instead. The hook only ever reads the property.
 */
function motion(x: number, y: number, z: number): Event {
  const event = new Event('devicemotion');
  Object.assign(event, { accelerationIncludingGravity: { x, y, z } });
  return event;
}

// Without this React warns and does not promise to flush effects inside act().
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Mount a hook and expose its latest value. */
function renderTilt(enabled: boolean) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const seen: DeviceTilt[] = [];
  function Probe() {
    seen.push(useDeviceTilt(enabled));
    return null;
  }
  act(() => root.render(<Probe />));
  return { latest: () => seen[seen.length - 1]!, unmount: () => act(() => root.unmount()) };
}

describe('useDeviceTilt', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports no support when the browser has no orientation events', () => {
    // jsdom defines DeviceOrientationEvent, so absence has to be staged. Desktop
    // Chrome defines it too with no sensor behind it — which is why `active` (an
    // event actually arrived), not `supported`, is what gates the mascot.
    vi.stubGlobal('DeviceOrientationEvent', undefined);
    const probe = renderTilt(true);
    expect(probe.latest().supported).toBe(false);
    expect(probe.latest().active).toBe(false);
    probe.unmount();
  });

  it('treats a requestPermission-bearing browser as needing a gesture', () => {
    // This is the iOS shape: the constructor carries a static requestPermission.
    const ctor = function DeviceOrientationEvent() {} as unknown as Record<string, unknown>;
    ctor.requestPermission = vi.fn(() => Promise.resolve('granted'));
    vi.stubGlobal('DeviceOrientationEvent', ctor);

    const probe = renderTilt(true);
    expect(probe.latest().supported).toBe(true);
    expect(probe.latest().needsPermission).toBe(true);
    probe.unmount();
  });

  it('does not ask for permission where the events simply flow', () => {
    // Android/Chrome: constructor exists, no requestPermission. Asking would throw.
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
    const probe = renderTilt(true);
    expect(probe.latest().supported).toBe(true);
    expect(probe.latest().needsPermission).toBe(false);
    // request() must stay safe to call unconditionally.
    expect(() => probe.latest().request()).not.toThrow();
    probe.unmount();
  });

  it('stays asleep while disabled, so it costs nothing off the splash', () => {
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
    const addSpy = vi.spyOn(window, 'addEventListener');
    const probe = renderTilt(false);
    expect(addSpy.mock.calls.some(([type]) => type === 'deviceorientation')).toBe(false);
    probe.unmount();
    addSpy.mockRestore();
  });

  it('listens, and lets go again on unmount', () => {
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const probe = renderTilt(true);
    const listened = addSpy.mock.calls.map(([type]) => type);
    expect(listened).toContain('deviceorientation');
    expect(listened).toContain('devicemotion');

    probe.unmount();
    const released = removeSpy.mock.calls.map(([type]) => type);
    expect(released).toContain('deviceorientation');
    expect(released).toContain('devicemotion');

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

/**
 * The gesture semantics — hold times, hysteresis, streak window, consecutive-sample
 * gating — are the load-bearing part and none of it is visible in the pure helpers.
 * These drive the real hook with real events and a clock under test control, so the
 * thresholds cannot drift silently (Copilot review on #313).
 */
describe('gesture recognition', () => {
  const HELD = [0, 9.8, 0] as const;
  const OVER = [0, -9.8, 0] as const;
  let clock = 0;

  const send = (sample: readonly [number, number, number]) =>
    act(() => {
      window.dispatchEvent(motion(sample[0], sample[1], sample[2]));
    });
  const advance = (ms: number) => {
    clock += ms;
  };

  beforeEach(() => {
    // Well past every cooldown, so the start of the clock is never what is under test.
    clock = 50_000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('makes you hold a flip before believing it', () => {
    const probe = renderTilt(true);
    send(HELD); // establishes which way was up

    send(OVER);
    advance(120);
    send(OVER);
    // A shake swings through every angle; reacting instantly would fire flips constantly.
    expect(probe.latest().upsideDown).toBe(false);
    expect(probe.latest().gestureSeq).toBe(0);

    advance(300); // now past FLIP_HOLD_MS in total
    send(OVER);
    expect(probe.latest().gesture).toBe('flip');
    expect(probe.latest().upsideDown).toBe(true);

    probe.unmount();
  });

  it('reports being turned back the right way', () => {
    const probe = renderTilt(true);
    send(HELD);
    send(OVER);
    advance(400);
    send(OVER);
    expect(probe.latest().upsideDown).toBe(true);

    send(HELD);
    expect(probe.latest().gesture).toBe('right-side-up');
    expect(probe.latest().upsideDown).toBe(false);
    probe.unmount();
  });

  it('escalates a shake streak, and forgets it once you stop', () => {
    const probe = renderTilt(true);
    send(HELD);

    // Each jump is well over the jerk threshold, and stays aligned with the baseline
    // so the flip detector has nothing to say about it.
    send([0, 40, 0]);
    expect(probe.latest().gesture).toBe('shake');
    expect(probe.latest().shakeStreak).toBe(1);

    advance(950); // past the cooldown, inside the streak window
    send(HELD);
    expect(probe.latest().shakeStreak).toBe(2);

    advance(950);
    send([0, 40, 0]);
    expect(probe.latest().shakeStreak).toBe(SHAKE_DELIGHT_AT);

    // Stop for longer than the streak window and the next one starts over.
    advance(3_000);
    send(HELD);
    expect(probe.latest().shakeStreak).toBe(1);
    probe.unmount();
  });

  it('ignores a shake that arrives inside the cooldown', () => {
    const probe = renderTilt(true);
    send(HELD);
    send([0, 40, 0]);
    const afterFirst = probe.latest().gestureSeq;

    advance(100);
    send(HELD);
    expect(probe.latest().gestureSeq).toBe(afterFirst);
    probe.unmount();
  });

  it('wants two falling samples in a row before calling it a drop', () => {
    const probe = renderTilt(true);
    send(HELD);

    send([0.1, 0.1, 0.1]);
    expect(probe.latest().gestureSeq).toBe(0); // one reading could be noise

    send([0.2, 0.1, 0.2]);
    expect(probe.latest().gesture).toBe('freefall');
    probe.unmount();
  });

  it('does not let a single odd reading accumulate into a drop', () => {
    const probe = renderTilt(true);
    send(HELD);

    send([0.1, 0.1, 0.1]);
    send(HELD); // back to rest — the run is broken
    send([0.1, 0.1, 0.1]);
    expect(probe.latest().gestureSeq).toBe(0);
    probe.unmount();
  });
});
