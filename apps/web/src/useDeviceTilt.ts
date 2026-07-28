/**
 * Device orientation as a normalized look vector, for the splash mascot.
 *
 * Three things make this awkward on the web, and all three are handled here rather
 * than at the call site:
 *
 * 1. **iOS needs a gesture.** Since iOS 13 `DeviceOrientationEvent.requestPermission()`
 *    exists, returns a promise, and throws unless it was called from a user gesture on
 *    a secure origin. Android/Chrome has no such call and simply fires the event. So
 *    support and permission are two separate questions, and `request()` is a no-op on
 *    the platforms that do not need it.
 * 2. **There is no neutral holding angle.** `beta` is ~0 with the phone flat on a table
 *    and ~70 held up to read. Treating raw angles as absolute means the mascot is
 *    already pinned to one side before you tilt anything, so the first reading becomes
 *    the zero and everything after it is a delta from how you happened to be holding it.
 * 3. **The events fire at 60Hz+.** Raw values are also jittery enough to shiver a
 *    rendered face, so readings are smoothed and only published past a threshold.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type Tilt = { x: number; y: number };

/** Degrees of tilt that count as a full deflection. A wrist roll, not a whole arm. */
const FULL_TILT_DEGREES = 28;
/** Ignore deltas below this so a resting hand does not re-render at display rate. */
const PUBLISH_THRESHOLD = 0.035;
/** Fraction of the gap to close per reading — lower is smoother and laggier. */
const SMOOTHING = 0.18;
/** m/s² of jerk between samples that reads as a deliberate shake, not a wobble. */
const SHAKE_JERK = 22;
/** Shakes cannot retrigger faster than this. */
const SHAKE_COOLDOWN_MS = 900;

const clamp = (value: number) => Math.max(-1, Math.min(1, value));

/** Signed shortest distance between two angles, so 359°→1° is +2 and not -358. */
export function angleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/** Orientation reading → look vector, relative to the angles first seen. */
export function tiltFromOrientation(
  reading: { beta: number | null; gamma: number | null },
  baseline: { beta: number; gamma: number },
): Tilt {
  return {
    x: clamp(angleDelta(baseline.gamma, reading.gamma ?? baseline.gamma) / FULL_TILT_DEGREES),
    y: clamp(angleDelta(baseline.beta, reading.beta ?? baseline.beta) / FULL_TILT_DEGREES),
  };
}

/** Jerk between two acceleration samples — the quantity a shake actually is. */
export function shakeJerk(
  previous: { x: number; y: number; z: number },
  next: { x: number; y: number; z: number },
): number {
  return Math.hypot(next.x - previous.x, next.y - previous.y, next.z - previous.z);
}

type OrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState | 'granted' | 'denied'>;
};

function orientationCtor(): OrientationConstructor | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as unknown as { DeviceOrientationEvent?: OrientationConstructor }).DeviceOrientationEvent;
  return ctor ?? null;
}

export type DeviceTilt = {
  /** The browser exposes orientation events at all. */
  supported: boolean;
  /** iOS: a gesture-initiated `request()` is still required. */
  needsPermission: boolean;
  /** Readings are arriving. */
  active: boolean;
  tilt: Tilt;
  /** Increments once per detected shake — a signal to react to, not a level. */
  shakeCount: number;
  /** Safe to call unconditionally; only meaningful inside a user gesture on iOS. */
  request: () => void;
};

export function useDeviceTilt(enabled: boolean): DeviceTilt {
  const [supported, setSupported] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [granted, setGranted] = useState(false);
  const [active, setActive] = useState(false);
  const [tilt, setTilt] = useState<Tilt>({ x: 0, y: 0 });
  const [shakeCount, setShakeCount] = useState(0);

  const baseline = useRef<{ beta: number; gamma: number } | null>(null);
  const smoothed = useRef<Tilt>({ x: 0, y: 0 });
  const published = useRef<Tilt>({ x: 0, y: 0 });
  const lastAccel = useRef<{ x: number; y: number; z: number } | null>(null);
  const lastShakeAt = useRef(0);

  useEffect(() => {
    const ctor = orientationCtor();
    if (!ctor) return;
    setSupported(true);
    // Only iOS defines requestPermission; everywhere else the events just flow.
    setNeedsPermission(typeof ctor.requestPermission === 'function');
  }, []);

  const request = useCallback(() => {
    const ctor = orientationCtor();
    if (!ctor || typeof ctor.requestPermission !== 'function') return;
    // Must stay inside the gesture's task — no awaiting anything first.
    ctor
      .requestPermission()
      .then((result) => {
        if (result === 'granted') {
          setGranted(true);
          setNeedsPermission(false);
        }
      })
      // A denial is a normal outcome, not an error to surface — the mascot simply
      // keeps reacting to touch instead.
      .catch(() => undefined);
  }, []);

  const listening = enabled && supported && (granted || !needsPermission);

  useEffect(() => {
    if (!listening) {
      setActive(false);
      return;
    }

    let frame = 0;
    let pending: Tilt | null = null;

    const flush = () => {
      frame = 0;
      if (!pending) return;
      const target = pending;
      pending = null;
      smoothed.current = {
        x: smoothed.current.x + (target.x - smoothed.current.x) * SMOOTHING,
        y: smoothed.current.y + (target.y - smoothed.current.y) * SMOOTHING,
      };
      const next = smoothed.current;
      const previous = published.current;
      if (Math.abs(next.x - previous.x) < PUBLISH_THRESHOLD && Math.abs(next.y - previous.y) < PUBLISH_THRESHOLD) {
        return;
      }
      published.current = { ...next };
      setTilt(published.current);
    };

    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta == null && event.gamma == null) return;
      if (!baseline.current) {
        baseline.current = { beta: event.beta ?? 0, gamma: event.gamma ?? 0 };
        setActive(true);
        return;
      }
      pending = tiltFromOrientation(event, baseline.current);
      if (!frame) frame = requestAnimationFrame(flush);
    };

    const onMotion = (event: DeviceMotionEvent) => {
      const a = event.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const sample = { x: a.x, y: a.y, z: a.z };
      const previous = lastAccel.current;
      lastAccel.current = sample;
      if (!previous) return;
      if (shakeJerk(previous, sample) < SHAKE_JERK) return;
      const now = performance.now();
      if (now - lastShakeAt.current < SHAKE_COOLDOWN_MS) return;
      lastShakeAt.current = now;
      // A shake is also a good moment to forget how the phone was first held.
      baseline.current = null;
      setShakeCount((count) => count + 1);
    };

    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('devicemotion', onMotion);
      if (frame) cancelAnimationFrame(frame);
      baseline.current = null;
      lastAccel.current = null;
      smoothed.current = { x: 0, y: 0 };
      published.current = { x: 0, y: 0 };
    };
  }, [listening]);

  return { supported, needsPermission, active, tilt, shakeCount, request };
}
