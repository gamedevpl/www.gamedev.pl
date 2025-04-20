import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from '../game-world-consts';
import { Vector2D } from './math-types';

export function vectorAdd(v1: Vector2D, v2: Vector2D): Vector2D {
  return {
    x: v1.x + v2.x,
    y: v1.y + v2.y,
  };
}

export function vectorSubtract(v1: Vector2D, v2: Vector2D): Vector2D {
  return {
    x: v1.x - v2.x,
    y: v1.y - v2.y,
  };
}

export function vectorScale(v: Vector2D, scalar: number): Vector2D {
  return {
    x: v.x * scalar,
    y: v.y * scalar,
  };
}

export function vectorLength(v: Vector2D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function vectorNormalize(v: Vector2D): Vector2D {
  const length = vectorLength(v);
  if (length === 0) return { x: 0, y: 0 };
  return vectorScale(v, 1 / length);
}

export function vectorDistance(v1: Vector2D, v2: Vector2D): number {
  return vectorLength(vectorSubtract(v1, v2));
}

/**
 * Calculates the shortest vector difference between two points in a wrapping world.
 * @param v1 - The first vector.
 * @param v2 - The second vector.
 * @returns The shortest vector difference (dx, dy).
 */
export function calculateWrappedVectorDifference(v1: Vector2D, v2: Vector2D): Vector2D {
  let dx = v1.x - v2.x;
  let dy = v1.y - v2.y;

  // Wrap around horizontally if shorter
  if (Math.abs(dx) > GAME_WORLD_WIDTH / 2) {
    dx = dx - Math.sign(dx) * GAME_WORLD_WIDTH;
  }

  // Wrap around vertically if shorter
  if (Math.abs(dy) > GAME_WORLD_HEIGHT / 2) {
    dy = dy - Math.sign(dy) * GAME_WORLD_HEIGHT;
  }

  return { x: dx, y: dy };
}

/**
 * Calculates the shortest distance between two points in a wrapping world.
 * @param v1 - The first vector.
 * @param v2 - The second vector.
 * @returns The shortest distance.
 */
export function calculateWrappedDistance(v1: Vector2D, v2: Vector2D): number {
  const difference = calculateWrappedVectorDifference(v1, v2);
  return vectorLength(difference);
}

export function vectorDot(v1: Vector2D, v2: Vector2D): number {
  return v1.x * v2.x + v1.y * v2.y;
}

export function vectorAngleBetween(v1: Vector2D, v2: Vector2D): number {
  const dot = vectorDot(v1, v2);
  const length1 = vectorLength(v1);
  const length2 = vectorLength(v2);
  if (length1 === 0 || length2 === 0) return 0;
  // Clamp the dot product ratio to avoid floating point errors leading to Math.acos returning NaN
  const cosTheta = Math.max(-1, Math.min(1, dot / (length1 * length2)));
  return Math.acos(cosTheta);
}

export function vectorRotate(v: Vector2D, angle: number): Vector2D {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos,
  };
}

// Removed calculateBoundaryForce as it's replaced by world wrapping
