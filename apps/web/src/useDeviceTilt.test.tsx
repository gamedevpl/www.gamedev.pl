// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  angleDelta,
  gravityAlignment,
  isFreeFall,
  shakeJerk,
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
