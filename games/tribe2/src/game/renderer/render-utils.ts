import { Entity } from '../types/game-types';
import { Vector2D } from '../types/math-types';

/**
 * Converts screen coordinates to world coordinates, taking into account viewport position, zoom, and map wrapping.
 * @param screenPos The position on the canvas.
 * @param viewportCenter The center of the viewport in world coordinates.
 * @param viewportZoom The current zoom level of the viewport.
 * @param canvasDimensions The width and height of the canvas.
 * @param mapDimensions The width and height of the game map.
 * @returns The corresponding world coordinates.
 */
export function screenToWorldCoords(
  screenPos: Vector2D,
  viewportCenter: Vector2D,
  viewportZoom: number,
  canvasDimensions: { width: number; height: number },
  mapDimensions: { width: number; height: number },
): Vector2D {
  // Calculate the top-left corner of the viewport in world coordinates, adjusted for zoom
  const worldX = viewportCenter.x - canvasDimensions.width / 2 / viewportZoom;
  const worldY = viewportCenter.y - canvasDimensions.height / 2 / viewportZoom;

  // Scale the screen position by the zoom factor to convert it to world units
  const absoluteWorldX = worldX + screenPos.x / viewportZoom;
  const absoluteWorldY = worldY + screenPos.y / viewportZoom;

  // Wrap the coordinates to stay within the map boundaries
  const wrappedX = ((absoluteWorldX % mapDimensions.width) + mapDimensions.width) % mapDimensions.width;
  const wrappedY = ((absoluteWorldY % mapDimensions.height) + mapDimensions.height) % mapDimensions.height;

  return { x: wrappedX, y: wrappedY };
}

/**
 * Converts world coordinates to screen coordinates, taking into account viewport position, zoom, and map wrapping.
 * @param worldPos The position in the game world.
 * @param viewportCenter The center of the viewport in world coordinates.
 * @param viewportZoom The current zoom level of the viewport.
 * @param canvasDimensions The width and height of the canvas.
 * @param mapDimensions The width and height of the game map.
 * @returns The corresponding screen coordinates.
 */
export function worldToScreenCoords(
  worldPos: Vector2D,
  viewportCenter: Vector2D,
  viewportZoom: number,
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

  // Scale the distance by the zoom factor and translate to the canvas center
  return {
    x: dx * viewportZoom + canvasDimensions.width / 2,
    y: dy * viewportZoom + canvasDimensions.height / 2,
  };
}

/**
 * Checks if an entity is within the visible viewport (frustum culling), considering the zoom level.
 * @param entity The entity to check.
 * @param viewportCenter The center of the viewport in world coordinates.
 * @param viewportZoom The current zoom level of the viewport.
 * @param canvasDimensions The dimensions of the canvas.
 * @param mapDimensions The dimensions of the game world.
 * @returns True if the entity is at least partially visible, false otherwise.
 */
export function isEntityInView(
  entity: Entity,
  viewportCenter: Vector2D,
  viewportZoom: number,
  canvasDimensions: { width: number; height: number },
  mapDimensions: { width: number; height: number },
): boolean {
  const screenPos = worldToScreenCoords(entity.position, viewportCenter, viewportZoom, canvasDimensions, mapDimensions);

  // The apparent radius on screen is scaled by the zoom level
  const radius = entity.radius * viewportZoom;
  const margin = radius + 20; // Add a margin to avoid culling things just off-screen

  return (
    screenPos.x >= -margin &&
    screenPos.x <= canvasDimensions.width + margin &&
    screenPos.y >= -margin &&
    screenPos.y <= canvasDimensions.height + margin
  );
}
