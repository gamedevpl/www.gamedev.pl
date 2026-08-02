/**
 * Pure landmark → game-verb math for sensing Phase 1 (camera hand control).
 *
 * The shell runs MediaPipe (or a stub) and feeds 21 normalized hand landmarks
 * here. Only the sanitized outputs — aim in [-1,1], pinch closeness in [0,1],
 * and pinch rising edges — ever cross into the game iframe. Unit-tested without
 * the model.
 *
 * Landmark indices match MediaPipe Hands:
 *   4  thumb tip
 *   8  index fingertip  (aim)
 */

export type Landmark = { x: number; y: number; z?: number };

/** Max posts per second for aim — battery / bridge budget. */
export const HAND_AIM_HZ = 15;
export const HAND_AIM_MIN_INTERVAL_MS = Math.ceil(1000 / HAND_AIM_HZ);

/**
 * Pinch distance (normalized image space) at or below this = pinched.
 * Slightly forgiving: phone foreshortening makes a real pinch look larger in 2D.
 */
export const PINCH_ON = 0.08;
/** Must open past this before another pinch can fire (hysteresis). */
export const PINCH_OFF = 0.13;
/**
 * Distances at or above this map to pinch closeness 0 on the meter.
 * Between PINCH_FAR and PINCH_ON the meter ramps 0→1.
 */
export const PINCH_FAR = 0.22;
/** Ignore pinch edges closer than this (ms). */
export const PINCH_REFRACTORY_MS = 280;

export type HandAim = { x: number; y: number };

export type HandVerbState = {
  /** Last emitted aim, or null before the first sample. */
  aim: HandAim | null;
  pinched: boolean;
  lastAimAt: number;
  lastPinchAt: number;
};

export function createHandVerbState(): HandVerbState {
  return { aim: null, pinched: false, lastAimAt: 0, lastPinchAt: 0 };
}

function clamp1(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Map index fingertip into a stick-like aim.
 * MediaPipe x grows right, y grows down in image space.
 * For a mirrored user-facing camera the shell already mirrors the <video>;
 * landmarks from detectForVideo follow the unmirrored frame — flip x when
 * `mirror` is true so "hand left of frame" aims left on screen.
 */
export function aimFromIndexTip(tip: Landmark, mirror: boolean): HandAim {
  const nx = mirror ? 1 - tip.x : tip.x;
  // Image y down → stick y up (same convention as tilt / WASD).
  return {
    x: clamp1(nx * 2 - 1),
    y: clamp1(1 - tip.y * 2),
  };
}

export function pinchDistance(thumb: Landmark, index: Landmark): number {
  const dx = thumb.x - index.x;
  const dy = thumb.y - index.y;
  return Math.hypot(dx, dy);
}

/**
 * How close the tips are to a pinch fire, in [0, 1].
 * 0 = clearly open (at/above PINCH_FAR); 1 = at/below PINCH_ON (would fire).
 */
export function pinchCloseness(dist: number): number {
  if (dist <= PINCH_ON) return 1;
  if (dist >= PINCH_FAR) return 0;
  const t = clamp01((PINCH_FAR - dist) / (PINCH_FAR - PINCH_ON));
  // Collapse float dust so "open" reads as exactly 0 in the game meter.
  return t < 1e-6 ? 0 : t;
}

export type HandVerbSample = {
  aim: HandAim | null;
  /** Continuous pinch meter for the game aim ring — 0 open, 1 would-fire. */
  pinch: number;
  /** True exactly once per pinch press (rising edge after hysteresis). */
  pinchEdge: boolean;
};

/**
 * Fold one landmark frame into verb outputs. Returns null aim when throttled
 * (caller should not post aim). Pinch closeness always returns when a hand is
 * present so the meter can update on the same post cadence as aim.
 */
export function sampleHandVerbs(
  state: HandVerbState,
  landmarks: Landmark[] | null,
  nowMs: number,
  opts: { mirror: boolean },
): HandVerbSample {
  if (!landmarks || landmarks.length < 9) {
    return { aim: null, pinch: 0, pinchEdge: false };
  }
  const thumb = landmarks[4];
  const index = landmarks[8];
  if (!thumb || !index) return { aim: null, pinch: 0, pinchEdge: false };

  const dist = pinchDistance(thumb, index);
  let pinchEdge = false;
  if (!state.pinched && dist <= PINCH_ON) {
    if (nowMs - state.lastPinchAt >= PINCH_REFRACTORY_MS) {
      pinchEdge = true;
      state.lastPinchAt = nowMs;
    }
    state.pinched = true;
  } else if (state.pinched && dist >= PINCH_OFF) {
    state.pinched = false;
  }

  // While held closed, keep the meter pegged so a refractory hold still reads "in".
  const pinch = state.pinched ? 1 : pinchCloseness(dist);

  let aim: HandAim | null = null;
  if (nowMs - state.lastAimAt >= HAND_AIM_MIN_INTERVAL_MS) {
    aim = aimFromIndexTip(index, opts.mirror);
    state.aim = aim;
    state.lastAimAt = nowMs;
  }

  return { aim, pinch, pinchEdge };
}
