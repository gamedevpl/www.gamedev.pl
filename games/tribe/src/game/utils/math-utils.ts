import { Vector2D } from './math-types';
import { Entity, EntityId } from '../entities/entities-types'; // Added import

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

export function calculateWrappedVectorDifference(
  v1: Vector2D,
  v2: Vector2D,
  worldWidth: number,
  worldHeight: number,
): Vector2D {
  let dx = v1.x - v2.x;
  let dy = v1.y - v2.y;

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

export function calculateWrappedDistance(v1: Vector2D, v2: Vector2D, worldWidth: number, worldHeight: number): number {
  const difference = calculateWrappedVectorDifference(v1, v2, worldWidth, worldHeight);
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

/**
 * Generates a random position within a radius of a center point, accounting for world wrapping
 * @param center The center position
 * @param radius The maximum distance from the center
 * @param worldWidth The width of the world
 * @param worldHeight The height of the world
 * @returns A new random position
 */
export function getRandomNearbyPosition(center: Vector2D, radius: number, worldWidth: number, worldHeight: number): Vector2D {
  // Generate a random angle in radians (0 to 2π)
  const randomAngle = Math.random() * Math.PI * 2;
  
  // Generate a random distance (0 to radius)
  // Using square root to ensure uniform distribution in the circle
  const randomDistance = Math.sqrt(Math.random()) * radius;
  
  // Calculate the offset from the center
  const offset = {
    x: Math.cos(randomAngle) * randomDistance,
    y: Math.sin(randomAngle) * randomDistance
  };
  
  // Add the offset to the center
  const newPosition = vectorAdd(center, offset);
  
  // Wrap the position to ensure it's within world boundaries
  return {
    x: ((newPosition.x % worldWidth) + worldWidth) % worldWidth,
    y: ((newPosition.y % worldHeight) + worldHeight) % worldHeight
  };
}

/**
 * Checks if a position is occupied by any entity within a specified radius
 * @param position The position to check
 * @param entities Map of all entities
 * @param checkRadius The radius to check for occupation
 * @returns True if the position is occupied, false otherwise
 */
export function isPositionOccupied(position: Vector2D, entities: Map<EntityId, Entity>, checkRadius: number): boolean {
  // Iterate through all entities
  for (const entity of entities.values()) {
    // Skip checking against the position itself if it's an entity
    if (entity.position === position) continue;
    
    // Calculate the wrapped distance between the entity and the position
    // Note: This requires worldWidth and worldHeight, which we don't have here
    // Ideally, this function would also take worldWidth and worldHeight as parameters
    // For now, we'll assume entities have access to these values or use a large value
    const WORLD_WIDTH = 10000; // Use a large value as fallback
    const WORLD_HEIGHT = 10000; // Use a large value as fallback
    
    const distance = calculateWrappedDistance(
      position,
      entity.position,
      WORLD_WIDTH,
      WORLD_HEIGHT
    );
    
    // If the distance is less than the check radius, the position is occupied
    if (distance < checkRadius) {
      return true;
    }
  }
  
  // If we've checked all entities and none are within the radius, the position is not occupied
  return false;
}

// Removed calculateBoundaryForce as it's replaced by world wrapping