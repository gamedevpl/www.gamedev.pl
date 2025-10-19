import { GameWorldState, Entity, EntityType } from '../types/game-types';
import { Vector2D } from '../types/math-types';
import {
  isEntityInView,
  worldToScreenCoords,
  getHeightAtWorldPos,
  computeScreenSpaceDisplacement,
} from './render-utils';
import { HEIGHT_MAP_RESOLUTION, TERRAIN_DISPLACEMENT_FACTOR, HEIGHT_SCALE } from '../game-consts';

/**
 * Renders a tree entity with pseudo-3D effect (shadow, trunk, layered canopy).
 * @param ctx The canvas rendering context.
 * @param entity The tree entity to render.
 * @param drawPos The displaced position to draw at (in world coordinates).
 * @param viewportZoom The current zoom level for scaling effects.
 */
function renderTree(ctx: CanvasRenderingContext2D, entity: Entity, drawPos: Vector2D): void {
  const baseX = drawPos.x;
  const baseY = drawPos.y;
  const radius = entity.radius;

  // Tree dimensions
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
    canopyBaseY - radius * 0.3,
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

  // Set up the camera transform
  ctx.translate(canvasDimensions.width / 2, canvasDimensions.height / 2);
  ctx.scale(viewportZoom, viewportZoom);
  ctx.translate(-viewportCenter.x, -viewportCenter.y);

  // Get rendering parameters (prefer from webgpu state, fallback to constants)
  const heightScale = gameState.webgpu?.heightScale ?? HEIGHT_SCALE;
  const displacementFactor = gameState.webgpu?.displacementFactor ?? TERRAIN_DISPLACEMENT_FACTOR;

  const visibleEntities = Array.from(gameState.entities.entities.values()).filter((entity) =>
    isEntityInView(entity, viewportCenter, viewportZoom, canvasDimensions, gameState.mapDimensions),
  );

  // Render entities based on their type
  visibleEntities.forEach((entity) => {
    // Calculate terrain displacement for this entity
    const baseScreen = worldToScreenCoords(
      entity.position,
      viewportCenter,
      viewportZoom,
      canvasDimensions,
      gameState.mapDimensions,
    );

    const height = getHeightAtWorldPos(
      entity.position,
      gameState.heightMap,
      HEIGHT_MAP_RESOLUTION,
      gameState.mapDimensions,
    );

    const dispPx = computeScreenSpaceDisplacement(
      baseScreen.y,
      height,
      heightScale,
      displacementFactor,
      canvasDimensions.height,
    );

    const dispWorld = dispPx / viewportZoom;

    // Create displaced draw position
    const drawPos: Vector2D = {
      x: entity.position.x,
      y: entity.position.y + dispWorld,
    };

    // Render based on entity type
    switch (entity.type) {
      case EntityType.TREE:
        renderTree(ctx, entity, drawPos);
        break;
      // Default case for other entities (players, boids, etc.)
      default:
        ctx.beginPath();
        ctx.arc(drawPos.x, drawPos.y, entity.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.stroke();
        break;
    }
  });

  ctx.restore();
}
