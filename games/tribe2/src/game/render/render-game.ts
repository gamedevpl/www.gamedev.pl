/**
 * Game Rendering - Draw the game world to canvas
 */

import { GameState, Entity, Vector2D } from '../game-types';

/**
 * Render a single entity at its current position
 */
function renderEntity(ctx: CanvasRenderingContext2D, entity: Entity): void {
  ctx.fillStyle = entity.color;
  ctx.beginPath();
  ctx.arc(entity.position.x, entity.position.y, entity.radius, 0, Math.PI * 2);
  ctx.fill();

  // Add a border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

/**
 * Check if an entity is visible in the viewport
 */
function isEntityInView(
  entity: Entity,
  viewportCenter: Vector2D,
  canvasWidth: number,
  canvasHeight: number,
  worldWidth: number,
  worldHeight: number,
): boolean {
  // Calculate shortest distance considering wrapping
  let dx = entity.position.x - viewportCenter.x;
  let dy = entity.position.y - viewportCenter.y;

  // Handle horizontal wrapping
  if (Math.abs(dx) > worldWidth / 2) {
    dx = dx - Math.sign(dx) * worldWidth;
  }

  // Handle vertical wrapping
  if (Math.abs(dy) > worldHeight / 2) {
    dy = dy - Math.sign(dy) * worldHeight;
  }

  const margin = entity.radius + 50;
  return (
    Math.abs(dx) <= canvasWidth / 2 + margin &&
    Math.abs(dy) <= canvasHeight / 2 + margin
  );
}

/**
 * Render entity with toroidal world wrapping
 * Entities near boundaries appear on both sides
 */
function renderEntityWithWrapping(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  worldWidth: number,
  worldHeight: number,
): void {
  const originalPosition = { ...entity.position };

  // Render the entity at all wrapped positions (up to 9 copies for corners)
  for (let dy = -worldHeight; dy <= worldHeight; dy += worldHeight) {
    for (let dx = -worldWidth; dx <= worldWidth; dx += worldWidth) {
      entity.position = {
        x: originalPosition.x + dx,
        y: originalPosition.y + dy,
      };
      renderEntity(ctx, entity);
    }
  }

  // Restore original position
  entity.position = originalPosition;
}

/**
 * Render UI overlay with game info
 */
function renderUI(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(10, 10, 250, 120);

  ctx.fillStyle = '#fff';
  ctx.font = '14px "Press Start 2P", monospace';
  ctx.fillText(`Time: ${state.time.toFixed(1)}s`, 20, 35);
  ctx.fillText(`Entities: ${state.entities.length}`, 20, 60);
  ctx.fillText(`${state.isPaused ? 'PAUSED' : 'Running'}`, 20, 85);
  ctx.fillText(`Press SPACE to pause`, 20, 110);
}

/**
 * Main render function
 * Draws the entire game world to the canvas with proper toroidal wrapping
 */
export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewportCenter: Vector2D,
  canvasWidth: number,
  canvasHeight: number,
): void {
  // Clear canvas
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Fill background
  ctx.fillStyle = '#2c5234';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Save context state
  ctx.save();

  // Translate to center viewport
  ctx.translate(canvasWidth / 2 - viewportCenter.x, canvasHeight / 2 - viewportCenter.y);

  // Filter visible entities for frustum culling
  const visibleEntities = state.entities.filter((entity) =>
    isEntityInView(entity, viewportCenter, canvasWidth, canvasHeight, state.worldWidth, state.worldHeight)
  );

  // Render all visible entities with wrapping
  for (const entity of visibleEntities) {
    renderEntityWithWrapping(ctx, entity, state.worldWidth, state.worldHeight);
  }

  // Restore context
  ctx.restore();

  // Render UI (no translation)
  renderUI(ctx, state);
}
