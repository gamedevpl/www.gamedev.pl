import { Vector2D } from '../types/math-types';

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

export function vectorLerp(v1: Vector2D, v2: Vector2D, t: number): Vector2D {
  return {
    x: v1.x + (v2.x - v1.x) * t,
    y: v1.y + (v2.y - v1.y) * t,
  };
}

export function getDirectionVectorOnTorus(
  from: Vector2D,
  to: Vector2D,
  worldWidth: number,
  worldHeight: number,
): Vector2D {
  let dx = to.x - from.x;
  let dy = to.y - from.y;

  if (Math.abs(dx) > worldWidth / 2) {
    dx = dx - Math.sign(dx) * worldWidth;
  }

  if (Math.abs(dy) > worldHeight / 2) {
    dy = dy - Math.sign(dy) * worldHeight;
  }

  return { x: dx, y: dy };
}

export function dirToTarget(
  position: Vector2D,
  targetPosition: Vector2D,
  mapDimensions: { width: number; height: number },
) {
  const dir = getDirectionVectorOnTorus(position, targetPosition, mapDimensions.width, mapDimensions.height);
  return vectorNormalize(dir);
}

export function calculateWrappedDistance(v1: Vector2D, v2: Vector2D, worldWidth: number, worldHeight: number): number {
  const difference = getDirectionVectorOnTorus(v1, v2, worldWidth, worldHeight);
  return vectorLength(difference);
}
