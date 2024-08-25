import { Position } from '../gameplay-types';

// Constants for isometric tile dimensions
export const TILE_WIDTH = 60;
export const TILE_HEIGHT = 30;

/**
 * Convert grid coordinates to isometric screen coordinates
 * @param x Grid x-coordinate
 * @param y Grid y-coordinate
 * @returns Isometric screen coordinates
 */
export function toIsometric(x: number, y: number): Position {
  return {
    x: ((x - y) * TILE_WIDTH) / 2,
    y: ((x + y) * TILE_HEIGHT) / 2,
  };
}

// Function to get z-index for different object types
function getZIndex(type: string): number {
  switch (type) {
    case 'wave':
    case 'obstacle':
      return 3;
    case 'bonus':
    case 'landMine':
    case 'timeBomb':
      return 2;
    case 'goal':
      return 2;
    case 'monster':
      return 4;
    case 'player':
      return 5;
    case 'explosion':
      return 6;
    default:
      return 0;
  }
}

/**
 * Calculate the drawing order for isometric objects
 * @param objects Array of objects with x and y properties and an optional z property
 * @returns Sorted array of objects in the correct drawing order
 */
export function calculateDrawingOrder<T extends { position: Position; type: string }>(objects: T[]): T[] {
  return objects.sort((a, b) => {
    // First, compare x + y
    const sumA = a.position.x + a.position.y;
    const sumB = b.position.x + b.position.y;
    if (sumA !== sumB) {
      return sumA - sumB;
    }

    // If x + y is equal, compare z-index based on object type
    const zIndexA = getZIndex(a.type);
    const zIndexB = getZIndex(b.type);
    if (zIndexA !== zIndexB) {
      return zIndexA - zIndexB;
    }

    // If z-index is equal, maintain original order
    return 0;
  });
}
