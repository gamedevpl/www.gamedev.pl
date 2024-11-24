import { GameWorldState } from '../game-world/game-world-types';
import { renderFireballs } from './fireball-renderer';
import { RenderState } from './render-state';
import { renderSnow } from './snow-renderer';
import { renderLandscape } from './landscape-renderer';

/**
 * Render the game world
 */
export function renderGame(ctx: CanvasRenderingContext2D, _world: GameWorldState, render: RenderState): void {
  // Save initial context state
  ctx.save();

  // Clear the canvas with a dark background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Render landscape as the background layer
  renderLandscape(ctx, render);

  // Render snow above landscape
  renderSnow(ctx, render);

  // Render fireballs on top
  renderFireballs(ctx, render);

  // Restore initial context state
  ctx.restore();
}