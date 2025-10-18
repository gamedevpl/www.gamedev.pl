import { GameWorldState } from '../types/game-types';
import { Vector2D } from '../types/math-types';
import { isEntityInView } from './render-utils';

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

  ctx.restore();
}
