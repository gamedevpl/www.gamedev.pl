/**
 * Game Rendering - Draw the game world to canvas
 */

import { GameState, Entity, Vector2D } from '../game-types';

/**
 * Render a single entity
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
 * Draws the entire game world to the canvas
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

  // Render all entities
  for (const entity of state.entities) {
    renderEntity(ctx, entity);
  }

  // Restore context
  ctx.restore();

  // Render UI (no translation)
  renderUI(ctx, state);
}
