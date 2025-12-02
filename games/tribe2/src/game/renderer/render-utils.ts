import { Entity } from '../world-types';
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
 * Converts world coordinates to screen coordinates.
 * This function handles wrapped instances by normalizing distances to the shortest toroidal path.
 * @param worldPos The position in the game world (can be outside the canonical [0, map_width] range for wrapped instances).
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

  // Normalize to shortest toroidal distance (range: [-mapWidth/2, mapWidth/2])
  // This is critical for correct rendering of wrapped instances at world boundaries.
  // Without this normalization, wrapped instances far outside the canonical range
  // (e.g., x=-2900 or x=5950 for a 3000-wide map) would produce incorrect screen positions.
  while (dx > mapDimensions.width / 2) dx -= mapDimensions.width;
  while (dx < -mapDimensions.width / 2) dx += mapDimensions.width;
  while (dy > mapDimensions.height / 2) dy -= mapDimensions.height;
  while (dy < -mapDimensions.height / 2) dy += mapDimensions.height;

  // Scale the distance by the zoom factor and translate to the canvas center
  return {
    x: dx * viewportZoom + canvasDimensions.width / 2,
    // INVERT Y-AXIS: World Y (up) to Screen Y (down). The delta `dy` is already `world - camera`,
    // so to make positive `dy` (up in world) move down on screen, we must negate it.
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

/**
 * Computes the vertical displacement in screen pixels for a given terrain height.
 * This ensures 2D entities align visually with the pseudo-3D WebGPU terrain.
 * @param height The normalized terrain height [0, 1].
 * @param displacementFactor The global displacement factor (TERRAIN_DISPLACEMENT_FACTOR).
 * @param viewportZoom The current zoom level.
 * @returns The vertical offset in screen pixels (positive = up on screen).
 */
export function computeScreenSpaceDisplacement(
  height: number,
  displacementFactor: number,
  viewportZoom: number,
): number {
  return height * displacementFactor * 50 * viewportZoom;
}

/**
 * Adjusts the brightness of a hex color.
 * @param hex The hex color string (e.g., "#RRGGBB").
 * @param factor The brightness factor (0.0 to 2.0+).
 * @returns The adjusted hex color string.
 */
export function adjustColorBrightness(hex: string, factor: number): string {
  // Remove hash if present
  hex = hex.replace(/^#/, '');

  // Parse RGB
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);

  // Apply factor
  r = Math.min(255, Math.max(0, Math.round(r * factor)));
  g = Math.min(255, Math.max(0, Math.round(g * factor)));
  b = Math.min(255, Math.max(0, Math.round(b * factor)));

  // Convert back to hex
  const rr = r.toString(16).padStart(2, '0');
  const gg = g.toString(16).padStart(2, '0');
  const bb = b.toString(16).padStart(2, '0');

  return `#${rr}${gg}${bb}`;
}

/**
 * Projects a world position to screen coordinates WITHOUT applying toroidal wrapping.
 * This is used when we have already calculated the specific wrapped instance position
 * relative to the camera and want to project it exactly as is.
 */
export function projectToScreen(
  worldPos: Vector2D,
  viewportCenter: Vector2D,
  viewportZoom: number,
  canvasDimensions: { width: number; height: number },
): Vector2D {
  const dx = worldPos.x - viewportCenter.x;
  const dy = worldPos.y - viewportCenter.y;

  return {
    x: dx * viewportZoom + canvasDimensions.width / 2,
    // INVERT Y-AXIS: World Y (up) to Screen Y (down).
    y: -dy * viewportZoom + canvasDimensions.height / 2,
  };
}

/**
 * Calculates all wrapped positions for an entity in a toroidal world using 3x3 instancing.
 * This mirrors the WebGPU terrain shader's instancing approach.
 *
 * @param entityPos The entity's canonical position in world coordinates [0, mapDimensions]
 * @param viewportCenter The viewport center in world coordinates
 * @param mapDimensions The dimensions of the game world
 * @returns Array of up to 9 wrapped positions where the entity should be rendered
 */
export function getWrappedEntityPositions(
  entityPos: Vector2D,
  viewportCenter: Vector2D,
  mapDimensions: { width: number; height: number },
): Vector2D[] {
  // Calculate which tile the camera is in (using floor for precise integer division)
  // We use the raw viewportCenter here because it is now unwrapped (can be negative or > mapWidth)
  const cameraTileX = Math.floor(viewportCenter.x / mapDimensions.width);
  const cameraTileY = Math.floor(viewportCenter.y / mapDimensions.height);

  const positions: Vector2D[] = [];

  // Generate 9 instances in a 3x3 grid centered on the camera tile
  for (let instanceIdx = 0; instanceIdx < 9; instanceIdx++) {
    // Calculate this instance's relative tile position in the 3x3 grid
    const tileX = (instanceIdx % 3) - 1;
    const tileY = Math.floor(instanceIdx / 3) - 1;

    // Calculate this instance's absolute tile position
    const instanceTileX = cameraTileX + tileX;
    const instanceTileY = cameraTileY + tileY;

    // Calculate the wrapped world position for this instance
    const wrappedPos: Vector2D = {
      x: entityPos.x + instanceTileX * mapDimensions.width,
      y: entityPos.y + instanceTileY * mapDimensions.height,
    };

    positions.push(wrappedPos);
  }

  return positions;
}
