/**
 * Math Utilities - Vector operations and mathematical helpers
 * Ported from Tribe 1
 */

import { Vector2D } from '../game-types';

/**
 * Add two vectors
 */
export function vectorAdd(v1: Vector2D, v2: Vector2D): Vector2D {
  return {
    x: v1.x + v2.x,
    y: v1.y + v2.y,
  };
}

/**
 * Subtract two vectors
 */
export function vectorSubtract(v1: Vector2D, v2: Vector2D): Vector2D {
  return {
    x: v1.x - v2.x,
    y: v1.y - v2.y,
  };
}

/**
 * Scale a vector by a scalar
 */
export function vectorScale(v: Vector2D, scalar: number): Vector2D {
  return {
    x: v.x * scalar,
    y: v.y * scalar,
  };
}

/**
 * Calculate the length/magnitude of a vector
 */
export function vectorLength(v: Vector2D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export const vectorMagnitude = vectorLength;

/**
 * Normalize a vector (make it length 1)
 */
export function vectorNormalize(v: Vector2D): Vector2D {
  const length = vectorLength(v);
  if (length === 0) return { x: 0, y: 0 };
  return vectorScale(v, 1 / length);
}

/**
 * Calculate the distance between two vectors
 */
export function vectorDistance(v1: Vector2D, v2: Vector2D): number {
  return vectorLength(vectorSubtract(v1, v2));
}

/**
 * Linear interpolation between two vectors
 */
export function vectorLerp(v1: Vector2D, v2: Vector2D, t: number): Vector2D {
  return {
    x: v1.x + (v2.x - v1.x) * t,
    y: v1.y + (v2.y - v1.y) * t,
  };
}

/**
 * Calculate the dot product of two vectors
 */
export function vectorDot(v1: Vector2D, v2: Vector2D): number {
  return v1.x * v2.x + v1.y * v2.y;
}

/**
 * Calculate the angle between two vectors
 */
export function vectorAngleBetween(v1: Vector2D, v2: Vector2D): number {
  const dot = vectorDot(v1, v2);
  const length1 = vectorLength(v1);
  const length2 = vectorLength(v2);
  if (length1 === 0 || length2 === 0) return 0;
  const cosTheta = Math.max(-1, Math.min(1, dot / (length1 * length2)));
  return Math.acos(cosTheta);
}

/**
 * Rotate a vector by an angle (in radians)
 */
export function vectorRotate(v: Vector2D, angle: number): Vector2D {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos,
  };
}

/**
 * Get the direction vector from one point to another on a toroidal world
 * This accounts for wrapping at world boundaries
 */
export function getDirectionVectorOnTorus(
  from: Vector2D,
  to: Vector2D,
  worldWidth: number,
  worldHeight: number,
): Vector2D {
  let dx = to.x - from.x;
  let dy = to.y - from.y;

  // Wrap around horizontally if shorter
  if (Math.abs(dx) > worldWidth / 2) {
    dx = dx - Math.sign(dx) * worldWidth;
  }

  // Wrap around vertically if shorter
  if (Math.abs(dy) > worldHeight / 2) {
    dy = dy - Math.sign(dy) * worldHeight;
  }

  return { x: dx, y: dy };
}

/**
 * Calculate the wrapped distance between two points on a toroidal world
 */
export function calculateWrappedDistance(
  v1: Vector2D,
  v2: Vector2D,
  worldWidth: number,
  worldHeight: number,
): number {
  const difference = getDirectionVectorOnTorus(v1, v2, worldWidth, worldHeight);
  return vectorLength(difference);
}

/**
 * Get the normalized direction from one position to a target on a toroidal world
 */
export function dirToTarget(
  position: Vector2D,
  targetPosition: Vector2D,
  worldWidth: number,
  worldHeight: number,
): Vector2D {
  const dirToTarget = getDirectionVectorOnTorus(position, targetPosition, worldWidth, worldHeight);
  return vectorNormalize(dirToTarget);
}

/**
 * Calculate the average position of multiple vectors
 */
export function getAveragePosition(positions: Vector2D[]): Vector2D {
  if (positions.length === 0) {
    return { x: 0, y: 0 };
  }

  const sum = positions.reduce((acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }), { x: 0, y: 0 });

  return {
    x: sum.x / positions.length,
    y: sum.y / positions.length,
  };
}

/**
 * Linear interpolation between two colors (hex format)
 */
export function lerpColor(color1: string, color2: string, t: number): string {
  const factor = Math.max(0, Math.min(1, t));

  const c1 = {
    r: parseInt(color1.substring(1, 3), 16),
    g: parseInt(color1.substring(3, 5), 16),
    b: parseInt(color1.substring(5, 7), 16),
  };
  const c2 = {
    r: parseInt(color2.substring(1, 3), 16),
    g: parseInt(color2.substring(3, 5), 16),
    b: parseInt(color2.substring(5, 7), 16),
  };

  const r = Math.round(c1.r + (c2.r - c1.r) * factor);
  const g = Math.round(c1.g + (c2.g - c1.g) * factor);
  const b = Math.round(c1.b + (c2.b - c1.b) * factor);

  const toHex = (c: number) => ('00' + c.toString(16)).slice(-2);

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Generate a random number between min and max
 */
export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Generate a random integer between min and max (inclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(randomRange(min, max + 1));
}
