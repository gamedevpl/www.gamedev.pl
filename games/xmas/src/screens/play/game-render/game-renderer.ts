import { GameWorldState } from '../game-world/game-world-types';
import { renderFireballs } from './fireball-renderer';
import { RenderState } from './render-state';

/**
 * Render the game world
 */
export function renderGame(ctx: CanvasRenderingContext2D, _world: GameWorldState, render: RenderState): void {
  // Save initial context state
  ctx.save();

  // Clear the canvas with a dark background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  renderFireballs(ctx, render);

  // Restore initial context state
  ctx.restore();
}
