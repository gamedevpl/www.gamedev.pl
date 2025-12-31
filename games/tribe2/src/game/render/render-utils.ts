import { Entity } from '../entities/entities-types';
import { Vector2D } from '../utils/math-types';
import { VisualEffect } from '../visual-effects/visual-effect-types';

/**
 * Converts screen coordinates to world coordinates, taking into account viewport position and map wrapping.
 * @param screenPos The position on the canvas.
 * @param viewportCenter The center of the viewport in world coordinates.
 * @param canvasDimensions The width and height of the canvas.
 * @param mapDimensions The width and height of the game map.
 * @returns The corresponding world coordinates.
 */
export function screenToWorldCoords(
  screenPos: Vector2D,
  viewportCenter: Vector2D,
  canvasDimensions: { width: number; height: number },
  mapDimensions: { width: number; height: number },
): Vector2D {
  const worldX = viewportCenter.x - canvasDimensions.width / 2;
  const worldY = viewportCenter.y - canvasDimensions.height / 2;
  const absoluteWorldX = worldX + screenPos.x;
  const absoluteWorldY = worldY + screenPos.y;
  const wrappedX = ((absoluteWorldX % mapDimensions.width) + mapDimensions.width) % mapDimensions.width;
  const wrappedY = ((absoluteWorldY % mapDimensions.height) + mapDimensions.height) % mapDimensions.height;
  return { x: wrappedX, y: wrappedY };
}

/**
 * Converts world coordinates to screen coordinates, taking into account viewport position and map wrapping.
 * @param worldPos The position in the game world.
 * @param viewportCenter The center of the viewport in world coordinates.
 * @param canvasDimensions The width and height of the canvas.
 * @param mapDimensions The width and height of the game map.
 * @returns The corresponding screen coordinates.
 */
export function worldToScreenCoords(
  worldPos: Vector2D,
  viewportCenter: Vector2D,
  canvasDimensions: { width: number; height: number },
  mapDimensions: { width: number; height: number },
): Vector2D {
  let dx = worldPos.x - viewportCenter.x;
  let dy = worldPos.y - viewportCenter.y;

  // Handle horizontal wrapping to find the shortest path
  if (Math.abs(dx) > mapDimensions.width / 2) {
    dx = dx - Math.sign(dx) * mapDimensions.width;
  }

  // Handle vertical wrapping
  if (Math.abs(dy) > mapDimensions.height / 2) {
    dy = dy - Math.sign(dy) * mapDimensions.height;
  }

  return {
    x: dx + canvasDimensions.width / 2,
    y: dy + canvasDimensions.height / 2,
  };
}

/**
 * Checks if an entity is within the visible viewport (frustum culling).
 * @param entity The entity to check.
 * @param viewportCenter The center of the viewport in world coordinates.
 * @param canvasDimensions The dimensions of the canvas.
 * @param mapDimensions The dimensions of the game world.
 * @returns True if the entity is at least partially visible, false otherwise.
 */
export function isEntityInView(
  entity: Entity | VisualEffect,
  viewportCenter: Vector2D,
  canvasDimensions: { width: number; height: number },
  mapDimensions: { width: number; height: number },
): boolean {
  const screenPos = worldToScreenCoords(entity.position, viewportCenter, canvasDimensions, mapDimensions);

  // Use the entity's radius, or a default if it's not present (e.g., for some visual effects)
  const radius = 'radius' in entity ? entity.radius : 20;
  const margin = radius + 20; // Add a margin to avoid culling things just off-screen

  return (
    screenPos.x >= -margin &&
    screenPos.x <= canvasDimensions.width + margin &&
    screenPos.y >= -margin &&
    screenPos.y <= canvasDimensions.height + margin
  );
}

/**
 * Renders an entity or visual effect with wrapping around the game world boundaries.
 * @param ctx The canvas rendering context.
 * @param worldWidth The width of the game world.
 * @param worldHeight The height of the game world.
 * @param renderFn The rendering function to call for each wrapped position.
 * @param entity The entity or visual effect to render.
 * @param args Additional arguments to pass to the render function.
 */
export function renderWithWrapping<T extends Entity | VisualEffect>(
  ctx: CanvasRenderingContext2D,
  worldWidth: number,
  worldHeight: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderFn: (ctx: CanvasRenderingContext2D, entity: T, ...args: any[]) => void,
  entity: T,
  ...args: unknown[]
): void {
  const originalPosition = { ...entity.position };

  for (let dy = -worldHeight; dy <= worldHeight; dy += worldHeight) {
    for (let dx = -worldWidth; dx <= worldWidth; dx += worldWidth) {
      entity.position.x = originalPosition.x + dx;
      entity.position.y = originalPosition.y + dy;
      renderFn(ctx, entity, ...args);
    }
  }

  entity.position = originalPosition;
}

/**
 * Creates a new offscreen canvas of the specified dimensions and returns it along with its 2D context.
 * @param width The width of the canvas.
 * @param height The height of the canvas.
 * @returns An object containing the canvas and its context.
 */
export function getOffscreenCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D context for offscreen canvas');
  }
  return { canvas, ctx };
}

/**
 * A simple pseudo-random number generator based on an input seed.
 * Returns a number between 0 and 1.
 * This ensures visual elements look "random" but don't jitter every frame.
 * @param seed The input seed.
 * @returns A pseudo-random number between 0 and 1.
 */
export function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}
