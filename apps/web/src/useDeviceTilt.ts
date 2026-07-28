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
/** A further shake inside this window escalates the streak instead of starting over. */
const SHAKE_STREAK_MS = 2_200;
/** Streak at which he stops being dizzy and starts enjoying it. */
export const SHAKE_DELIGHT_AT = 3;
/** Gravity agreement below which the device counts as turned over. */
const FLIP_ALIGNMENT = -0.55;
/** …and above which it counts as righted again. Hysteresis, so the edge cannot chatter. */
const FLIP_RELEASE_ALIGNMENT = -0.25;
/** Hold the flip this long before reacting, so a shake passing through does not trip it. */
const FLIP_HOLD_MS = 350;
/** Total acceleration below this is a fall rather than a hold. */
const FREE_FALL_MS2 = 3;
/** Consecutive falling samples required, so one noisy reading cannot fake a drop. */
const FREE_FALL_SAMPLES = 2;
/** Falls cannot retrigger faster than this. */
const FREE_FALL_COOLDOWN_MS = 1_200;

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

export type Vec3 = { x: number; y: number; z: number };

/**
 * How closely the device's current "down" agrees with the "down" it had when the
 * first reading arrived: +1 held exactly as you started, 0 rotated a quarter turn,
 * −1 turned right over.
 *
 * Doing it relative to the start, rather than against an absolute axis, is what
 * keeps this honest across platforms. The sign of each accelerometer axis depends
 * on the device and the browser, and guessing wrong inverts the whole feature — but
 * *the angle between two readings from the same device* needs no convention at all.
 * It also matches what a person means by upside down: flipped from how they were
 * holding it, not flipped relative to the room.
 *
 * Returns 0 for a degenerate sample (free fall has no usable direction).
 */
export function gravityAlignment(baseline: Vec3, current: Vec3): number {
  const baseLength = Math.hypot(baseline.x, baseline.y, baseline.z);
  const currentLength = Math.hypot(current.x, current.y, current.z);
  if (baseLength < FREE_FALL_MS2 || currentLength < FREE_FALL_MS2) return 0;
  const dot = baseline.x * current.x + baseline.y * current.y + baseline.z * current.z;
  return clamp(dot / (baseLength * currentLength));
}

/**
 * A dropped phone reads close to zero on every axis — the accelerometer measures
 * proper acceleration, and something falling freely has none. At rest it reads ~9.8
 * on whichever axis is down, so this is a wide, unambiguous gap.
 */
export function isFreeFall(sample: Vec3): boolean {
  return Math.hypot(sample.x, sample.y, sample.z) < FREE_FALL_MS2;
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
  /**
   * Increments once per recognised gesture. Read it with {@link DeviceTilt.gesture} —
   * the counter exists because the same gesture twice in a row still has to fire
   * twice, which a bare string could not express.
   */
  gestureSeq: number;
  gesture: MascotGesture | null;
  /** Shakes so far in the current burst: 1, 2, 3… Resets when the burst stops. */
  shakeStreak: number;
  /** Held turned over, relative to how it was being held when readings began. */
  upsideDown: boolean;
  /** Safe to call unconditionally; only meaningful inside a user gesture on iOS. */
  request: () => void;
};

/** Things worth reacting to, as opposed to the continuous tilt. */
export type MascotGesture = 'shake' | 'flip' | 'right-side-up' | 'freefall';

export function useDeviceTilt(enabled: boolean): DeviceTilt {
  const [supported, setSupported] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [granted, setGranted] = useState(false);
  const [active, setActive] = useState(false);
  const [tilt, setTilt] = useState<Tilt>({ x: 0, y: 0 });
  const [gesture, setGesture] = useState<{ seq: number; kind: MascotGesture | null }>({ seq: 0, kind: null });
  const [shakeStreak, setShakeStreak] = useState(0);
  const [upsideDown, setUpsideDown] = useState(false);

  const baseline = useRef<{ beta: number; gamma: number } | null>(null);
  const smoothed = useRef<Tilt>({ x: 0, y: 0 });
  const published = useRef<Tilt>({ x: 0, y: 0 });
  const lastAccel = useRef<Vec3 | null>(null);
  // −Infinity, not 0: `performance.now()` counts from page load, so a 0 sentinel
  // silently swallows a gesture made within one cooldown of the page opening.
  const lastShakeAt = useRef(Number.NEGATIVE_INFINITY);
  const streak = useRef(0);
  /**
   * Captured once and deliberately NOT reset by a shake, unlike the tilt baseline.
   * "Upside down" has to stay relative to how you first held the phone, or shaking it
   * would quietly redefine which way is up and the flip would never register.
   */
  const gravityBaseline = useRef<Vec3 | null>(null);
  const flippedSince = useRef(0);
  const flipped = useRef(false);
  const fallingSamples = useRef(0);
  const lastFallAt = useRef(Number.NEGATIVE_INFINITY);

  const emit = useCallback((kind: MascotGesture) => {
    setGesture((previous) => ({ seq: previous.seq + 1, kind }));
  }, []);

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
      const sample: Vec3 = { x: a.x, y: a.y, z: a.z };
      const previous = lastAccel.current;
      lastAccel.current = sample;
      const now = performance.now();

      // ——— Dropped. Checked before anything else: a fall has no usable gravity
      // direction, so letting it reach the flip test would compare against noise.
      if (isFreeFall(sample)) {
        fallingSamples.current += 1;
        if (fallingSamples.current >= FREE_FALL_SAMPLES && now - lastFallAt.current > FREE_FALL_COOLDOWN_MS) {
          lastFallAt.current = now;
          emit('freefall');
        }
        return;
      }
      fallingSamples.current = 0;

      if (!gravityBaseline.current) gravityBaseline.current = sample;

      // ——— Turned over. Has to be held: a shake swings the phone through every
      // angle on the way, and reacting to that would fire flips constantly.
      const alignment = gravityAlignment(gravityBaseline.current, sample);
      if (!flipped.current && alignment < FLIP_ALIGNMENT) {
        if (!flippedSince.current) flippedSince.current = now;
        if (now - flippedSince.current >= FLIP_HOLD_MS) {
          flipped.current = true;
          flippedSince.current = 0;
          setUpsideDown(true);
          emit('flip');
        }
      } else if (flipped.current && alignment > FLIP_RELEASE_ALIGNMENT) {
        flipped.current = false;
        flippedSince.current = 0;
        setUpsideDown(false);
        emit('right-side-up');
      } else if (alignment >= FLIP_ALIGNMENT) {
        flippedSince.current = 0;
      }

      // ——— Shaken.
      if (!previous) return;
      if (shakeJerk(previous, sample) < SHAKE_JERK) return;
      if (now - lastShakeAt.current < SHAKE_COOLDOWN_MS) return;
      // Keep shaking and it escalates; stop and the next one starts over at 1.
      streak.current = now - lastShakeAt.current < SHAKE_STREAK_MS ? streak.current + 1 : 1;
      lastShakeAt.current = now;
      // A shake is also a good moment to forget how the phone was first held — the
      // tilt baseline only, never the gravity one.
      baseline.current = null;
      setShakeStreak(streak.current);
      emit('shake');
    };

    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('devicemotion', onMotion);
      if (frame) cancelAnimationFrame(frame);
      baseline.current = null;
      lastAccel.current = null;
      gravityBaseline.current = null;
      flipped.current = false;
      flippedSince.current = 0;
      fallingSamples.current = 0;
      streak.current = 0;
      smoothed.current = { x: 0, y: 0 };
      published.current = { x: 0, y: 0 };
    };
  }, [listening, emit]);

  return {
    supported,
    needsPermission,
    active,
    tilt,
    gestureSeq: gesture.seq,
    gesture: gesture.kind,
    shakeStreak,
    upsideDown,
    request,
  };
}
