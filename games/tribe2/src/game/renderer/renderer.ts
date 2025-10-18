import { BACKGROUND_COLOR, HEIGHT_MAP_RESOLUTION } from '../game-consts';
import { GameWorldState } from '../types/game-types';
import { Vector2D } from '../types/math-types';
import { isEntityInView } from './render-utils';

/**
 * Renders the height map terrain, handling world wrapping.
 * It calculates the visible grid cells and draws them for the main world and 8 surrounding clones.
 * @param ctx The canvas rendering context.
 * @param gameState The current state of the game world.
 * @param viewportCenter The center of the camera in world coordinates.
 * @param viewportZoom The current zoom level.
 * @param canvasDimensions The width and height of the canvas.
 */
export function renderHeightMap(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  viewportCenter: Vector2D,
  viewportZoom: number,
  canvasDimensions: { width: number; height: number },
) {
  const { heightMap, mapDimensions } = gameState;
  if (!heightMap || heightMap.length === 0) return;

  const gridHeight = heightMap.length;
  const gridWidth = heightMap[0].length;

  // Calculate the world coordinates of the viewport edges, adjusted for zoom
  const viewLeft = viewportCenter.x - canvasDimensions.width / 2 / viewportZoom;
  const viewRight = viewportCenter.x + canvasDimensions.width / 2 / viewportZoom;
  const viewTop = viewportCenter.y - canvasDimensions.height / 2 / viewportZoom;
  const viewBottom = viewportCenter.y + canvasDimensions.height / 2 / viewportZoom;

  // Render the height map in a 3x3 grid to handle wrapping
  for (let offsetY = -1; offsetY <= 1; offsetY++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      const worldOffsetX = offsetX * mapDimensions.width;
      const worldOffsetY = offsetY * mapDimensions.height;

      // Calculate the start and end grid indices to render for this tile
      const startX = Math.max(0, Math.floor((viewLeft - worldOffsetX) / HEIGHT_MAP_RESOLUTION));
      const endX = Math.min(gridWidth, Math.ceil((viewRight - worldOffsetX) / HEIGHT_MAP_RESOLUTION));
      const startY = Math.max(0, Math.floor((viewTop - worldOffsetY) / HEIGHT_MAP_RESOLUTION));
      const endY = Math.min(gridHeight, Math.ceil((viewBottom - worldOffsetY) / HEIGHT_MAP_RESOLUTION));

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const height = heightMap[y][x];
          // Simple color gradient from dark green to a lighter green
          const lightness = 20 + height * 25; // 20% to 45% lightness
          ctx.fillStyle = `hsl(120, 40%, ${lightness}%)`;

          const cellX = x * HEIGHT_MAP_RESOLUTION + worldOffsetX;
          const cellY = y * HEIGHT_MAP_RESOLUTION + worldOffsetY;

          // Add 1 to avoid 1px gaps between cells from rendering inaccuracies
          ctx.fillRect(cellX, cellY, HEIGHT_MAP_RESOLUTION + 1, HEIGHT_MAP_RESOLUTION + 1);
        }
      }
    }
  }
}

/**
 * Renders the entire game world, including entities and UI.
 * This is the main entry point for all rendering.
 *
 * @param ctx The canvas rendering context.
 * @param gameState The current state of the game world.
 * @param viewportCenter The center of the camera in world coordinates.
 * @param viewportZoom The current zoom level.
 * @param canvasDimensions The width and height of the canvas.
 */
export function renderGame(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  viewportCenter: Vector2D,
  viewportZoom: number,
  canvasDimensions: { width: number; height: number },
): void {
  ctx.save();

  // Clear canvas with a background color
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, canvasDimensions.width, canvasDimensions.height);

  // --- World Rendering ---

  // Set up the camera transform:
  // 1. Move the origin to the center of the canvas.
  ctx.translate(canvasDimensions.width / 2, canvasDimensions.height / 2);
  // 2. Apply the zoom.
  ctx.scale(viewportZoom, viewportZoom);
  // 3. Move the canvas to center the viewport on the player.
  ctx.translate(-viewportCenter.x, -viewportCenter.y);

  // Render the height map first as the background
  renderHeightMap(ctx, gameState, viewportCenter, viewportZoom, canvasDimensions);

  const visibleEntities = Array.from(gameState.entities.entities.values()).filter((entity) =>
    isEntityInView(entity, viewportCenter, viewportZoom, canvasDimensions, gameState.mapDimensions),
  );

  // Render simple debug markers for visible entities
  visibleEntities.forEach((entity) => {
    ctx.beginPath();
    ctx.arc(entity.position.x, entity.position.y, entity.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.stroke();
  });

  ctx.restore(); // Restore context to draw fixed UI elements

  // --- UI Rendering (placeholder) ---
  // Future UI rendering calls would go here, after the context is restored.
}
