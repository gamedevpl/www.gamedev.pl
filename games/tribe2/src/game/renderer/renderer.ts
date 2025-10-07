import { BACKGROUND_COLOR } from '../game-consts';
import { GameWorldState } from '../types/game-types';
import { Vector2D } from '../types/math-types';
import { isEntityInView } from './render-utils';

/**
 * Renders the entire game world, including entities and UI.
 * This is the main entry point for all rendering.
 *
 * @param ctx The canvas rendering context.
 * @param gameState The current state of the game world.
 * @param viewportCenter The center of the camera in world coordinates.
 * @param canvasDimensions The width and height of the canvas.
 */
export function renderGame(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  viewportCenter: Vector2D,
  canvasDimensions: { width: number; height: number },
): void {
  ctx.save();

  // Clear canvas with a background color
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, canvasDimensions.width, canvasDimensions.height);

  // Translate the canvas to center the viewport
  ctx.translate(canvasDimensions.width / 2 - viewportCenter.x, canvasDimensions.height / 2 - viewportCenter.y);

  // --- World Rendering ---
  const visibleEntities = Array.from(gameState.entities.entities.values()).filter((entity) =>
    isEntityInView(entity, viewportCenter, canvasDimensions, gameState.mapDimensions),
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
