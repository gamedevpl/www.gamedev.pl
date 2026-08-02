/**
 * Pure landmark → game-verb math for sensing Phase 1 (camera hand control).
 *
 * The shell runs MediaPipe (or a stub) and feeds 21 normalized hand landmarks
 * here. Only the sanitized outputs — aim in [-1,1] and pinch rising edges —
 * ever cross into the game iframe. Unit-tested without the model.
 *
 * Landmark indices match MediaPipe Hands:
 *   4  thumb tip
 *   8  index fingertip  (aim)
 */

export type Landmark = { x: number; y: number; z?: number };

/** Max posts per second for aim — battery / bridge budget. */
export const HAND_AIM_HZ = 15;
export const HAND_AIM_MIN_INTERVAL_MS = Math.ceil(1000 / HAND_AIM_HZ);

/** Pinch distance (normalized image space) below this = pinched. */
export const PINCH_ON = 0.055;
/** Must open past this before another pinch can fire (hysteresis). */
export const PINCH_OFF = 0.09;
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

export type HandVerbSample = {
  aim: HandAim | null;
  /** True exactly once per pinch press (rising edge after hysteresis). */
  pinchEdge: boolean;
};

/**
 * Fold one landmark frame into verb outputs. Returns null aim when throttled
 * (caller should not post). Pinch edges always return even if aim is throttled.
 */
export function sampleHandVerbs(
  state: HandVerbState,
  landmarks: Landmark[] | null,
  nowMs: number,
  opts: { mirror: boolean },
): HandVerbSample {
  if (!landmarks || landmarks.length < 9) {
    return { aim: null, pinchEdge: false };
  }
  const thumb = landmarks[4];
  const index = landmarks[8];
  if (!thumb || !index) return { aim: null, pinchEdge: false };

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

  let aim: HandAim | null = null;
  if (nowMs - state.lastAimAt >= HAND_AIM_MIN_INTERVAL_MS) {
    aim = aimFromIndexTip(index, opts.mirror);
    state.aim = aim;
    state.lastAimAt = nowMs;
  }

  return { aim, pinchEdge };
}
