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
