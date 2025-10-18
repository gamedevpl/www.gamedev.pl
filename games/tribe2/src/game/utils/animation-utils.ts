/**
 * Clamps a value between a minimum and maximum.
 * @param v The value to clamp.
 * @param min The minimum value.
 * @param max The maximum value.
 * @returns The clamped value.
 */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Linear interpolation between two values.
 * @param a The start value.
 * @param b The end value.
 * @param t The interpolation factor (0 to 1).
 * @returns The interpolated value.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Cubic ease-in-out function for smooth acceleration and deceleration.
 * @param t The progress value (0 to 1).
 * @returns The eased value (0 to 1).
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Quadratic ease-in-out function for smooth acceleration and deceleration.
 * @param t The progress value (0 to 1).
 * @returns The eased value (0 to 1).
 */
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
