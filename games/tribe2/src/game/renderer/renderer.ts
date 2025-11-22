import { GameWorldState, Entity, EntityType, BiomeType } from '../types/world-types';
import { Vector2D } from '../types/math-types';
import { getHeightAtWorldPos } from './render-utils';
import {
  GROUND_COLOR,
  GRASS_COLOR,
  ROCK_COLOR,
  SAND_COLOR,
  SNOW_COLOR,
  TERRAIN_DISPLACEMENT_FACTOR,
} from '../constants/rendering-constants';
import { HEIGHT_MAP_RESOLUTION } from '../constants/world-constants';

// Displacement factor for 2D canvas rendering (aligned with 3D WebGPU terrain)
const CANVAS_HEIGHT_DISPLACEMENT = TERRAIN_DISPLACEMENT_FACTOR * 50; // ~20 pixels max

/**
 * Projects a world position to screen coordinates WITHOUT applying toroidal wrapping.
 * This is used when we have already calculated the specific wrapped instance position
 * relative to the camera and want to project it exactly as is.
 */
function projectToScreen(
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
function getWrappedEntityPositions(
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
  const baseY = screenPos.y + treeHeight / 2 - heightDisplacement;

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
 * Renders a rabbit entity with directional orientation and details.
 * @param ctx The canvas rendering context.
 * @param entity The rabbit entity.
 * @param screenPos The screen position of the rabbit.
 * @param worldPos The position in world coordinates (for height sampling).
 * @param heightMap The heightmap for terrain elevation.
 * @param mapDimensions The dimensions of the game world.
 * @param cellSize The size of each heightmap cell.
 * @param viewportZoom The current zoom level.
 * @param time The current game time for animation.
 */
function renderRabbit(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  screenPos: Vector2D,
  worldPos: Vector2D,
  heightMap: number[][],
  mapDimensions: { width: number; height: number },
  cellSize: number,
  viewportZoom: number,
  time: number,
): void {
  const radius = entity.radius * viewportZoom;
  const angle = Math.atan2(entity.direction.y, entity.direction.x);
  const speed = Math.sqrt(entity.velocity.x ** 2 + entity.velocity.y ** 2);
  const isMoving = speed > 1;

  // Sample terrain height at rabbit position
  const terrainHeight = getHeightAtWorldPos(worldPos, heightMap, cellSize, mapDimensions);
  const heightDisplacement = terrainHeight * CANVAS_HEIGHT_DISPLACEMENT * viewportZoom;

  ctx.save();
  // Apply displacement to position it correctly on the pseudo-3D terrain
  ctx.translate(screenPos.x, screenPos.y - heightDisplacement);

  // Shadow (always on ground)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.0, radius * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hopping calculation
  let hopY = 0;
  let stretchX = 1;
  let stretchY = 1;

  if (isMoving) {
    const hopSpeed = 15;
    const hopPhase = time * hopSpeed;
    hopY = Math.abs(Math.sin(hopPhase)) * radius * 0.3; // Jump height (screen pixels)
    const stretch = Math.sin(hopPhase) * 0.1;
    stretchY = 1 + stretch;
    stretchX = 1 - stretch;
  }

  // Move "up" (screen Y) to simulate jumping
  ctx.translate(0, -hopY);

  // Rotate for direction
  ctx.rotate(angle);

  // Scale for squash/stretch
  ctx.scale(stretchX, stretchY);

  // Body (oval)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.2, radius * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#dddddd';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Paws
  ctx.fillStyle = '#eeeeee';
  // Front Left
  ctx.beginPath();
  ctx.ellipse(radius * 0.8, -radius * 0.5, radius * 0.25, radius * 0.15, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Front Right
  ctx.beginPath();
  ctx.ellipse(radius * 0.8, radius * 0.5, radius * 0.25, radius * 0.15, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Head (circle, slightly offset forward)
  const headOffset = radius * 0.8;
  ctx.beginPath();
  ctx.arc(headOffset, 0, radius * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.stroke();

  // Ears (long ovals on head)
  // Twitch rotation
  const twitchAngle = isMoving ? 0 : Math.sin(time * 3 + entity.id) * 0.1;

  ctx.save();
  ctx.translate(headOffset + radius * 0.2, -radius * 0.6);
  ctx.rotate(-0.5 + twitchAngle); // Left ear base rotation
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.6, radius * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Inner Ear
  ctx.fillStyle = '#ffcccc';
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.4, radius * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(headOffset + radius * 0.2, radius * 0.6);
  ctx.rotate(0.5 - twitchAngle); // Right ear base rotation
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.6, radius * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Inner Ear
  ctx.fillStyle = '#ffcccc';
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.4, radius * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Eyes (black dots)
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(headOffset + radius * 0.4, -radius * 0.2, radius * 0.1, 0, Math.PI * 2);
  ctx.arc(headOffset + radius * 0.4, radius * 0.2, radius * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Tail (small circle at back)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-radius * 1.2, 0, radius * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
  ctx.restore(); // Restore initial save (translation)
}

/**
 * Renders a wireframe of the terrain mesh on the 2D canvas.
 * This function uses 3x3 instancing to handle the toroidal world.
 *
 * @param ctx The canvas rendering context.
 * @param gameState The current state of the game world.
 * @param viewportCenter The center of the camera in world coordinates.
 * @param viewportZoom The current zoom level.
 * @param canvasDimensions The width and height of the canvas.
 */
function renderWireframe(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  viewportCenter: Vector2D,
  viewportZoom: number,
  canvasDimensions: { width: number; height: number },
): void {
  const { heightMap, mapDimensions } = gameState;
  const gridH = heightMap.length;
  const gridW = heightMap[0]?.length ?? 0;
  if (gridW === 0 || gridH === 0) return;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const currentWorldPos = {
        x: x * HEIGHT_MAP_RESOLUTION,
        y: y * HEIGHT_MAP_RESOLUTION,
      };
      const currentHeight = heightMap[y][x];

      // Get 9 wrapped positions for the current grid point
      const wrappedCurrentPositions = getWrappedEntityPositions(currentWorldPos, viewportCenter, mapDimensions);

      // Connect to right neighbor
      if (x < gridW - 1) {
        const rightWorldPos = {
          x: (x + 1) * HEIGHT_MAP_RESOLUTION,
          y: y * HEIGHT_MAP_RESOLUTION,
        };
        const rightHeight = heightMap[y][x + 1];
        const wrappedRightPositions = getWrappedEntityPositions(rightWorldPos, viewportCenter, mapDimensions);

        // Draw lines between corresponding wrapped instances
        for (let i = 0; i < 9; i++) {
          const screenPos1 = projectToScreen(
            wrappedCurrentPositions[i],
            viewportCenter,
            viewportZoom,
            canvasDimensions,
          );
          screenPos1.y -= currentHeight * CANVAS_HEIGHT_DISPLACEMENT * viewportZoom;

          const screenPos2 = projectToScreen(
            wrappedRightPositions[i],
            viewportCenter,
            viewportZoom,
            canvasDimensions,
          );
          screenPos2.y -= rightHeight * CANVAS_HEIGHT_DISPLACEMENT * viewportZoom;

          ctx.moveTo(screenPos1.x, screenPos1.y);
          ctx.lineTo(screenPos2.x, screenPos2.y);
        }
      }

      // Connect to bottom neighbor
      if (y < gridH - 1) {
        const bottomWorldPos = {
          x: x * HEIGHT_MAP_RESOLUTION,
          y: (y + 1) * HEIGHT_MAP_RESOLUTION,
        };
        const bottomHeight = heightMap[y + 1][x];
        const wrappedBottomPositions = getWrappedEntityPositions(bottomWorldPos, viewportCenter, mapDimensions);

        for (let i = 0; i < 9; i++) {
          const screenPos1 = projectToScreen(
            wrappedCurrentPositions[i],
            viewportCenter,
            viewportZoom,
            canvasDimensions,
          );
          screenPos1.y -= currentHeight * CANVAS_HEIGHT_DISPLACEMENT * viewportZoom;

          const screenPos2 = projectToScreen(
            wrappedBottomPositions[i],
            viewportCenter,
            viewportZoom,
            canvasDimensions,
          );
          screenPos2.y -= bottomHeight * CANVAS_HEIGHT_DISPLACEMENT * viewportZoom;

          ctx.moveTo(screenPos1.x, screenPos1.y);
          ctx.lineTo(screenPos2.x, screenPos2.y);
        }
      }
    }
  }
  ctx.stroke();
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

  // Render wireframe if mode is active
  if (gameState.wireframeMode) {
    renderWireframe(ctx, gameState, viewportCenter, viewportZoom, canvasDimensions);
  }

  // Render roads if not in wireframe mode
  if (!gameState.wireframeMode) {
    // Roads are now rendered in the WebGPU terrain shader

    // Render each entity using 3x3 instanced approach
    gameState.entities.entities.forEach((entity) => {
      // Get all 9 potential wrapped positions for this entity
      const wrappedPositions = getWrappedEntityPositions(entity.position, viewportCenter, gameState.mapDimensions);

      // Render each wrapped instance that is visible
      wrappedPositions.forEach((wrappedPos) => {
        // Use projectToScreen instead of worldToScreenCoords to avoid re-wrapping
        const screenPos = projectToScreen(wrappedPos, viewportCenter, viewportZoom, canvasDimensions);

        // TEMPORARILY DISABLED: Frustum culling for debugging
        // TODO: Fix frustum culling logic for toroidal world boundaries
        // For now, do a simple screen bounds check with generous margin
        // Account for full tree visual height (trunk 2.2 + canopy 1.1 ≈ 3.3 * radius)
        // This ensures all 9 wrapped instances are properly evaluated at all zoom levels
        const margin = entity.radius * 3.3 * viewportZoom + 20;
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
            case EntityType.RABBIT:
              renderRabbit(
                ctx,
                entity,
                screenPos,
                wrappedPos,
                gameState.heightMap,
                gameState.mapDimensions,
                HEIGHT_MAP_RESOLUTION,
                viewportZoom,
                gameState.time,
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

    // Render road editing preview if active
    if (gameState.roadEditingMode) {
      const { lastRoadPosition, previewRoadPosition } = gameState;

      // 1. Render the preview piece at the cursor
      if (previewRoadPosition) {
        const wrappedPreviewPositions = getWrappedEntityPositions(
          previewRoadPosition,
          viewportCenter,
          gameState.mapDimensions,
        );
        wrappedPreviewPositions.forEach((wrappedPos) => {
          const screenPos = projectToScreen(wrappedPos, viewportCenter, viewportZoom, canvasDimensions);
          const terrainHeight = getHeightAtWorldPos(
            wrappedPos,
            gameState.heightMap,
            HEIGHT_MAP_RESOLUTION,
            gameState.mapDimensions,
          );
          const heightDisplacement = terrainHeight * CANVAS_HEIGHT_DISPLACEMENT * viewportZoom;
          const roadCellSize = HEIGHT_MAP_RESOLUTION * viewportZoom;

          // Check if preview is on screen before drawing
          const margin = roadCellSize;
          if (
            screenPos.x >= -margin &&
            screenPos.x <= canvasDimensions.width + margin &&
            screenPos.y >= -margin &&
            screenPos.y <= canvasDimensions.height + margin
          ) {
            ctx.fillStyle = 'rgba(138, 116, 95, 0.5)'; // Semi-transparent path color
            ctx.fillRect(
              screenPos.x - roadCellSize / 2,
              screenPos.y - roadCellSize / 2 - heightDisplacement,
              roadCellSize,
              roadCellSize,
            );
          }
        });
      }

      // 2. Render the connecting line from the last piece
      if (lastRoadPosition && previewRoadPosition) {
        // Note: This line doesn't perfectly handle world wrapping, but gives a good indication.
        // We use projectToScreen for consistency, assuming closest instance logic isn't strictly required for the line itself
        // (or we could use worldToScreenCoords for the line specifically if we wanted the "shortest path" line).
        // For consistency with the preview boxes, we'll use projectToScreen on the *closest* instance,
        // but finding the closest instance manually is annoying.
        // Let's stick to worldToScreenCoords for the line as it handles the "shortest path" visual best for a simple line.
        // Actually, worldToScreenCoords is imported from render-utils, so we can use it.
        // Wait, I removed worldToScreenCoords import? No, it's still there in render-utils.
        // I need to import it if I want to use it.
        // But wait, I am inside renderer.ts.
        // I should use the projectToScreen helper if I want to be consistent with the instances.
        // But the line connects two points.
        // Let's just use projectToScreen on the FIRST instance of the preview/last position for now.
        // Actually, the line is a bit tricky in a wrapped world.
        // Let's leave the line logic using a simple projection of the canonical positions relative to viewport?
        // No, that breaks wrapping.
        // Let's just use projectToScreen on the wrapped positions that are closest to center.
        // Simplest fix: Use getWrappedEntityPositions for both, find the pair that is closest to each other?
        // That's too complex for a debug line.
        // I will just use projectToScreen on the wrapped position generated by getWrappedEntityPositions that is closest to screen center.
        // Actually, for the line, let's just use the 0-th instance from getWrappedEntityPositions (which is the center one).
        
        // REVISIT: The original code used worldToScreenCoords.
        // I will use projectToScreen on the first generated wrapped position (which is usually the central one).
        // This might be slightly wrong if the user is editing across a seam, but it's a preview line.
        
        const lastWrapped = getWrappedEntityPositions(lastRoadPosition, viewportCenter, gameState.mapDimensions)[4]; // Center instance
        const previewWrapped = getWrappedEntityPositions(previewRoadPosition, viewportCenter, gameState.mapDimensions)[4]; // Center instance
        
        const screenLastPos = projectToScreen(lastWrapped, viewportCenter, viewportZoom, canvasDimensions);
        const lastPosHeight = getHeightAtWorldPos(
          lastRoadPosition,
          gameState.heightMap,
          HEIGHT_MAP_RESOLUTION,
          gameState.mapDimensions,
        );
        screenLastPos.y -= lastPosHeight * CANVAS_HEIGHT_DISPLACEMENT * viewportZoom;

        const screenPreviewPos = projectToScreen(previewWrapped, viewportCenter, viewportZoom, canvasDimensions);
        const previewPosHeight = getHeightAtWorldPos(
          previewRoadPosition,
          gameState.heightMap,
          HEIGHT_MAP_RESOLUTION,
          gameState.mapDimensions,
        );
        screenPreviewPos.y -= previewPosHeight * CANVAS_HEIGHT_DISPLACEMENT * viewportZoom;

        ctx.beginPath();
        ctx.moveTo(screenLastPos.x, screenLastPos.y);
        ctx.lineTo(screenPreviewPos.x, screenPreviewPos.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 10]);
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash
      }
    }

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
        const screenPos = projectToScreen(wrappedPos, viewportCenter, viewportZoom, canvasDimensions);

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
}
