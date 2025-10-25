import { Entity } from '../types/world-types';
import { Vector2D } from '../types/math-types';

/**
 * Converts screen coordinates to world coordinates, taking into account viewport position, zoom, and map wrapping.
 * This function implements the exact inverse of the vertex shader's coordinate transformation pipeline.
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
  // Step 1: Convert screen coordinates to NDC (Normalized Device Coordinates)
  const canvasCenter = { x: canvasDimensions.width / 2, y: canvasDimensions.height / 2 };
  const ndcX = (screenPos.x - canvasCenter.x) / canvasCenter.x;
  // INVERT Y-AXIS: Screen Y (down) to NDC Y (up)
  const ndcY = -((screenPos.y - canvasCenter.y) / canvasCenter.y);

  // Step 2: Convert NDC to screen space in world units (inverse of zoom)
  const deltaX = (ndcX * canvasCenter.x) / viewportZoom;
  const deltaY = (ndcY * canvasCenter.y) / viewportZoom;

  // Step 3: Add delta to viewport center and apply toroidal wrapping.
  // This wrapping ensures coordinates are normalized to the canonical tile range [0, map_size],
  // which is essential for the dynamic instanced rendering system where 9 copies of the terrain
  // are visible simultaneously. The double modulo operation handles negative values correctly.
  const worldX = (((viewportCenter.x + deltaX) % mapDimensions.width) + mapDimensions.width) % mapDimensions.width;
  const worldY = (((viewportCenter.y + deltaY) % mapDimensions.height) + mapDimensions.height) % mapDimensions.height;

  return { x: worldX, y: worldY };
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
  let dy = worldPos.y + viewportCenter.y;

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
    // INVERT Y-AXIS: World Y (up) to Screen Y (down)
    y: -dy * viewportZoom + canvasDimensions.height / 2,
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

/**
 * Samples the height from the heightmap at a given world position using bilinear interpolation.
 * Handles toroidal wrapping of coordinates.
 * @param worldPos The position in world coordinates.
 * @param heightMap The 2D heightmap array.
 * @param cellSize The size of each heightmap cell in world units (HEIGHT_MAP_RESOLUTION).
 * @param mapDimensions The dimensions of the game world.
 * @returns The interpolated height value in [0, 1].
 */
export function getHeightAtWorldPos(
  worldPos: Vector2D,
  heightMap: number[][],
  cellSize: number,
  mapDimensions: { width: number; height: number },
): number {
  // Wrap world coordinates to map boundaries (toroidal topology)
  const wrappedX = ((worldPos.x % mapDimensions.width) + mapDimensions.width) % mapDimensions.width;
  const wrappedY = ((worldPos.y % mapDimensions.height) + mapDimensions.height) % mapDimensions.height;

  // Convert to grid coordinates
  const gx = wrappedX / cellSize;
  const gy = wrappedY / cellSize;

  // Get integer grid indices and fractional parts for interpolation
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;

  const gridHeight = heightMap.length;
  const gridWidth = heightMap[0]?.length ?? 0;

  // Sample four neighbors with wrapping
  const x1 = (x0 + 1) % gridWidth;
  const y1 = (y0 + 1) % gridHeight;

  const h00 = heightMap[y0 % gridHeight]?.[x0 % gridWidth] ?? 0;
  const h10 = heightMap[y0 % gridHeight]?.[x1] ?? 0;
  const h01 = heightMap[y1]?.[x0 % gridWidth] ?? 0;
  const h11 = heightMap[y1]?.[x1] ?? 0;

  // Bilinear interpolation
  const h0 = h00 * (1 - fx) + h10 * fx;
  const h1 = h01 * (1 - fx) + h11 * fx;
  const height = h0 * (1 - fy) + h1 * fy;

  return height;
}
