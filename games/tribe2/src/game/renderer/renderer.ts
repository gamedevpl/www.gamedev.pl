import { GameWorldState, Entity, EntityType, BiomeType } from '../types/world-types';
import { Vector2D } from '../types/math-types';
import { isEntityInView, worldToScreenCoords, getHeightAtWorldPos } from './render-utils';
import {
  GROUND_COLOR,
  GRASS_COLOR,
  ROCK_COLOR,
  SAND_COLOR,
  SNOW_COLOR,
  HEIGHT_SCALE,
} from '../constants/rendering-constants';
import { HEIGHT_MAP_RESOLUTION } from '../constants/world-constants';

// Displacement factor for 2D canvas rendering (much smaller than 3D mesh HEIGHT_SCALE)
const CANVAS_HEIGHT_DISPLACEMENT = HEIGHT_SCALE * 0.005; // ~200 pixels max

/**
 * Calculates all wrapped positions for an entity in a toroidal world using 3x3 instancing.
 * This mirrors the WebGPU terrain shader's instancing approach.
 *
 * @param entityPos The entity's canonical position in world coordinates [0, mapDimensions]
 * @param viewportCenter The viewport center in world coordinates
 * @param mapDimensions The dimensions of the game world
 * @returns Array of up to 9 wrapped positions where the entity should be rendered
 */
function getWrappedEntityPositions(
  entityPos: Vector2D,
  viewportCenter: Vector2D,
  mapDimensions: { width: number; height: number },
): Vector2D[] {
  // Calculate which tile the camera is in (using floor for precise integer division)
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

/**
 * Renders a tree entity with pseudo-3D effect (shadow, trunk, layered canopy) in screen space.
 * @param ctx The canvas rendering context.
 * @param entity The tree entity to render.
 * @param screenPos The position to draw at (in screen coordinates).
 * @param worldPos The position in world coordinates (for height sampling).
 * @param heightMap The heightmap for terrain elevation.
 * @param mapDimensions The dimensions of the game world.
 * @param cellSize The size of each heightmap cell.
 * @param viewportZoom The current zoom level.
 */
function renderTree(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  screenPos: Vector2D,
  worldPos: Vector2D,
  heightMap: number[][],
  mapDimensions: { width: number; height: number },
  cellSize: number,
  viewportZoom: number,
): void {
  // Sample terrain height at tree position
  const terrainHeight = getHeightAtWorldPos(worldPos, heightMap, cellSize, mapDimensions);
  const heightDisplacement = terrainHeight * CANVAS_HEIGHT_DISPLACEMENT * viewportZoom;

  const baseX = screenPos.x;
  const radius = entity.radius * viewportZoom;
  // screenPos.y is the entity CENTER; convert to BASE (ground level)
  // Tree trunk height is 2.2 * radius, so center is at trunk_height/2 above base
  // Higher terrain (positive heightDisplacement) should move tree UP on screen (negative Y)
  const treeHeight = radius * 2.2; // Trunk height
  const baseY = screenPos.y + (treeHeight / 2) - heightDisplacement;

  // Tree dimensions (scaled by zoom)
  const trunkWidth = radius * 0.5;
  const trunkHeight = radius * 2.2;
  const shadowWidth = radius * 1.8;
  const shadowHeight = radius * 0.6;

  // 1. Draw shadow (ellipse at base)
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(baseX, baseY + radius * 0.1, shadowWidth / 2, shadowHeight / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Draw trunk
  ctx.save();
  ctx.fillStyle = '#5c3d20'; // Brown
  ctx.fillRect(baseX - trunkWidth / 2, baseY - trunkHeight, trunkWidth, trunkHeight);

  // Add subtle shading on right edge of trunk
  ctx.strokeStyle = '#4a2f18'; // Darker brown
  ctx.lineWidth = Math.max(1, trunkWidth * 0.15);
  ctx.beginPath();
  ctx.moveTo(baseX + trunkWidth / 2, baseY - trunkHeight);
  ctx.lineTo(baseX + trunkWidth / 2, baseY);
  ctx.stroke();
  ctx.restore();

  // 3. Draw canopy (layered circles with gradients)
  const canopyBaseY = baseY - trunkHeight;

  // Layer 1: Largest circle (back)
  ctx.save();
  const grad1 = ctx.createRadialGradient(
    baseX - radius * 0.3,
    canopyBaseY - radius * 0.3,
    0,
    baseX,
    canopyBaseY,
    radius * 1.1,
  );
  grad1.addColorStop(0, '#3d7a42'); // Lighter green
  grad1.addColorStop(1, '#2e6b34'); // Darker green
  ctx.fillStyle = grad1;
  ctx.beginPath();
  ctx.arc(baseX, canopyBaseY, radius * 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Layer 2: Medium circle (middle)
  ctx.save();
  const grad2 = ctx.createRadialGradient(
    baseX - radius * 0.2,
    canopyBaseY - radius * 0.5,
    0,
    baseX - radius * 0.2,
    canopyBaseY - radius * 0.3,
    radius * 0.8,
  );
  grad2.addColorStop(0, '#4a8f50'); // Lighter green
  grad2.addColorStop(1, '#3d7a42'); // Medium green
  ctx.fillStyle = grad2;
  ctx.beginPath();
  ctx.arc(baseX - radius * 0.2, canopyBaseY - radius * 0.3, radius * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Layer 3: Smallest circle (front/top highlight)
  ctx.save();
  const grad3 = ctx.createRadialGradient(
    baseX + radius * 0.3,
    canopyBaseY - radius * 0.6,
    0,
    baseX + radius * 0.3,
    canopyBaseY - radius * 0.5,
    radius * 0.6,
  );
  grad3.addColorStop(0, '#5fa865'); // Lightest green (highlight)
  grad3.addColorStop(1, '#4a8f50'); // Medium-light green
  ctx.fillStyle = grad3;
  ctx.beginPath();
  ctx.arc(baseX + radius * 0.3, canopyBaseY - radius * 0.5, radius * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Renders the entire game world entities over a pre-rendered terrain background.
 * The terrain is handled by the WebGPU renderer on a separate canvas layer.
 *
 * This function uses 3x3 instanced rendering to handle toroidal world wrapping,
 * mirroring the approach used in the WebGPU terrain shader.
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
  // Clear the canvas
  ctx.clearRect(0, 0, canvasDimensions.width, canvasDimensions.height);

  // Get all entities (we'll check visibility per wrapped instance)
  const entities = Array.from(gameState.entities.entities.values());

  // Render each entity using 3x3 instanced approach
  entities.forEach((entity) => {
    // Get all 9 potential wrapped positions for this entity
    const wrappedPositions = getWrappedEntityPositions(entity.position, viewportCenter, gameState.mapDimensions);

    // Render each wrapped instance that is visible
    wrappedPositions.forEach((wrappedPos) => {
      // Convert wrapped world position to screen coordinates
      const screenPos = worldToScreenCoords(
        wrappedPos,
        viewportCenter,
        viewportZoom,
        canvasDimensions,
        gameState.mapDimensions,
      );

      // TEMPORARILY DISABLED: Frustum culling for debugging
      // TODO: Fix frustum culling logic for toroidal world boundaries
      // For now, do a simple screen bounds check with generous margin
      // Account for full tree visual height (trunk 2.2 + canopy 1.1 ≈ 3.3 * radius)
      // This ensures all 9 wrapped instances are properly evaluated at all zoom levels
      const margin = (entity.radius * 3.3) * viewportZoom + 20;
      const shouldRender =
        screenPos.x >= -margin &&
        screenPos.x <= canvasDimensions.width + margin &&
        screenPos.y >= -margin &&
        screenPos.y <= canvasDimensions.height + margin;

      if (shouldRender) {
        // Render based on entity type (all in screen space now)
        switch (entity.type) {
          case EntityType.TREE:
            renderTree(
              ctx,
              entity,
              screenPos,
              wrappedPos,
              gameState.heightMap,
              gameState.mapDimensions,
              HEIGHT_MAP_RESOLUTION,
              viewportZoom,
            );
            break;
          // Default case for other entities (players, boids, etc.)
          default:
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, entity.radius * viewportZoom, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
            break;
        }
      }
    });
  });

  // Render editor brush cursor if active (in screen space, outside camera transform)
  if (gameState.terrainEditingMode || gameState.biomeEditingMode) {
    const { position, radius } = gameState.editorBrush;

    // Get all wrapped positions for the brush cursor
    const wrappedBrushPositions = getWrappedEntityPositions(position, viewportCenter, gameState.mapDimensions);

    let brushColor = 'rgba(255, 255, 255, 0.8)'; // Default for terrain editing

    if (gameState.biomeEditingMode) {
      let biomeRgb = { r: 1, g: 1, b: 1 };
      switch (gameState.selectedBiome) {
        case BiomeType.GROUND:
          biomeRgb = GROUND_COLOR;
          break;
        case BiomeType.SAND:
          biomeRgb = SAND_COLOR;
          break;
        case BiomeType.GRASS:
          biomeRgb = GRASS_COLOR;
          break;
        case BiomeType.ROCK:
          biomeRgb = ROCK_COLOR;
          break;
        case BiomeType.SNOW:
          biomeRgb = SNOW_COLOR;
          break;
      }
      brushColor = `rgba(${biomeRgb.r * 255}, ${biomeRgb.g * 255}, ${biomeRgb.b * 255}, 0.8)`;
    }

    // Render each wrapped instance of the brush cursor that is visible
    wrappedBrushPositions.forEach((wrappedPos) => {
      // Convert wrapped world position to screen coordinates
      const screenPos = worldToScreenCoords(
        wrappedPos,
        viewportCenter,
        viewportZoom,
        canvasDimensions,
        gameState.mapDimensions,
      );

      // Check if this wrapped instance is visible on screen
      const margin = radius * viewportZoom + 20;
      const isVisible =
        screenPos.x >= -margin &&
        screenPos.x <= canvasDimensions.width + margin &&
        screenPos.y >= -margin &&
        screenPos.y <= canvasDimensions.height + margin;

      if (isVisible) {
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, radius * viewportZoom, 0, Math.PI * 2);
        ctx.strokeStyle = brushColor;
        ctx.lineWidth = 2; // Fixed screen-space width
        ctx.stroke();
      }
    });
  }
}
