import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from './game-world-consts';
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

export function vectorDot(v1: Vector2D, v2: Vector2D): number {
  return v1.x * v2.x + v1.y * v2.y;
}

export function vectorAngleBetween(v1: Vector2D, v2: Vector2D): number {
  const dot = vectorDot(v1, v2);
  const length1 = vectorLength(v1);
  const length2 = vectorLength(v2);
  if (length1 === 0 || length2 === 0) return 0;
  return Math.acos(dot / (length1 * length2));
}

export function vectorRotate(v: Vector2D, angle: number): Vector2D {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos,
  };
}

export function calculateBoundaryForce(position: Vector2D, boundaryRange: number, boundaryStrength: number): Vector2D {
  const force = { x: 0, y: 0 };

  if (position.x < boundaryRange) {
    force.x += boundaryStrength * (boundaryRange - position.x);
  }
  if (position.x > GAME_WORLD_WIDTH - boundaryRange) {
    force.x -= boundaryStrength * (position.x - (GAME_WORLD_WIDTH - boundaryRange));
  }
  if (position.y < boundaryRange) {
    force.y += boundaryStrength * (boundaryRange - position.y);
  }
  if (position.y > GAME_WORLD_HEIGHT - boundaryRange) {
    force.y -= boundaryStrength * (position.y - (GAME_WORLD_HEIGHT - boundaryRange));
  }

  return force;
}
