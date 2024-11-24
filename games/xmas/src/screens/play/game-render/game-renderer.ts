import { GameWorldState } from '../game-world/game-world-types';
import { renderFireballs } from './fireball-renderer';
import { RenderState } from './render-state';
import { renderSnow } from './snow-renderer';
import { renderLandscape } from './landscape-renderer';
import { renderSantaWithEffects } from './santa-renderer';

/**
 * Render the game world in proper order:
 * 1. Background (landscape)
 * 2. Snow effects
 * 3. Game objects (Santas)
 * 4. Foreground effects (fireballs)
 */
export function renderGame(ctx: CanvasRenderingContext2D, world: GameWorldState, render: RenderState): void {
  // Save initial context state
  ctx.save();

  // Clear the canvas with a dark background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Render landscape as the background layer
  renderLandscape(ctx, render);

  // Render snow above landscape
  renderSnow(ctx, render);

  // Enable crisp pixel art rendering
  ctx.imageSmoothingEnabled = false;

  // Render all Santas
  world.santas.forEach(santa => {
    renderSantaWithEffects(ctx, santa, world.time);
  });

  // Render fireballs on top
  renderFireballs(ctx, render);

  // Restore initial context state
  ctx.restore();
}