import { ViewportState } from '../game-render/render-state';
import { Vector2D } from './game-world-types';

/**
 * Calculates world coordinates from screen coordinates and viewport state
 */
export function calculateWorldCoordinates(
  screenX: number,
  screenY: number,
  viewport: ViewportState,
): { worldX: number; worldY: number } {
  const worldX = screenX - viewport.x;
  const worldY = screenY - viewport.y;
  return { worldX, worldY };
}

/**
 * Calculates input position data including normalized coordinates and world coordinates
 */
export function calculateInputPosition(clientX: number, clientY: number, viewport: ViewportState) {
  const { innerWidth, innerHeight } = window;
  const centerX = innerWidth / 2;
  const centerY = innerHeight / 2;

  // Calculate normalized coordinates (-1 to 1)
  const normalizedX = (clientX - centerX) / centerX;
  const normalizedY = (clientY - centerY) / centerY;

  // Calculate world coordinates
  const { worldX, worldY } = calculateWorldCoordinates(clientX, clientY, viewport);

  return {
    normalizedX,
    normalizedY,
    screenX: clientX,
    screenY: clientY,
    worldX,
    worldY,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
  };
}

/**
 * Normalizes a vector to have a length of 1
 */
export function normalizeVector(vector: Vector2D): Vector2D {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (length === 0) return { x: 0, y: 0 };
  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

/**
 * Calculates the distance between two points
 */
export function getDistance(pos1: Vector2D, pos2: Vector2D): number {
  const dx = pos2.x - pos1.x;
  const dy = pos2.y - pos1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Checks if a target position is within a specified range from a source position
 */
export function isInRange(source: Vector2D, target: Vector2D, range: number): boolean {
  return getDistance(source, target) <= range;
}

/**
 * Calculates the angle between two vectors in radians
 */
export function calculateAngleBetweenVectors(v1: Vector2D, v2: Vector2D): number {
  const dot = v1.x * v2.x + v1.y * v2.y;
  const v1Length = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const v2Length = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
  
  if (v1Length === 0 || v2Length === 0) return 0;
  
  const cosAngle = dot / (v1Length * v2Length);
  // Clamp the value to prevent floating point errors
  return Math.acos(Math.max(-1, Math.min(1, cosAngle)));
}

/**
 * Checks if a target is within a vision cone defined by source position,
 * vision direction, and vision angle
 */
export function isInVisionCone(
  source: Vector2D,
  target: Vector2D,
  visionDirection: Vector2D,
  visionAngle: number
): boolean {
  const toTarget = normalizeVector({
    x: target.x - source.x,
    y: target.y - source.y,
  });

  const angle = calculateAngleBetweenVectors(visionDirection, toTarget);
  return angle <= visionAngle / 2;
}

/**
 * Gets the direction vector from source to target
 */
export function getDirectionToTarget(source: Vector2D, target: Vector2D): Vector2D {
  return normalizeVector({
    x: target.x - source.x,
    y: target.y - source.y,
  });
}

/**
 * Adds random variation to a direction vector
 */
export function addRandomness(direction: Vector2D, amount: number): Vector2D {
  const randomAngle = (Math.random() - 0.5) * amount * Math.PI;
  const cos = Math.cos(randomAngle);
  const sin = Math.sin(randomAngle);
  return normalizeVector({
    x: direction.x * cos - direction.y * sin,
    y: direction.x * sin + direction.y * cos,
  });
}

/**
 * Generates a random direction vector
 */
export function getRandomDirection(): Vector2D {
  const angle = Math.random() * Math.PI * 2;
  return {
    x: Math.cos(angle),
    y: Math.sin(angle),
  };
}

/**
 * Handles boundary checks and bouncing for entities
 */
export function handleBoundaryBounce(position: Vector2D, direction: Vector2D, worldWidth: number, worldHeight: number): Vector2D {
  let newDirection = { ...direction };
  if (position.x < 0 || position.x > worldWidth) {
    newDirection.x *= -1;
    newDirection = addRandomness(newDirection, 0.2);
  }
  if (position.y < 0 || position.y > worldHeight) {
    newDirection.y *= -1;
    newDirection = addRandomness(newDirection, 0.2);
  }
  return newDirection;
}
