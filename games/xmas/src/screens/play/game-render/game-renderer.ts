import { GameWorldState } from '../game-world/game-world-types';
import { renderFireballs } from './fireball-renderer';
import { RenderState } from './render-state';
import { renderSnow } from './snow-renderer';
import { renderLandscape } from './landscape-renderer';
import { renderSantaWithEffects } from './santa-renderer';

// Render layers in order: landscape -> snow -> game objects -> effects
export function renderGame(ctx: CanvasRenderingContext2D, world: GameWorldState, render: RenderState): void {
  ctx.save();
  
  // Clear canvas
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  
  // Background layer
  renderLandscape(ctx, render);
  renderSnow(ctx, render);
  
  // Enable crisp pixel art rendering
  ctx.imageSmoothingEnabled = false;
  
  // Game objects layer
  world.santas.forEach(santa => renderSantaWithEffects(ctx, santa, world.time));
  
  // Effects layer
  renderFireballs(ctx, render);
  
  ctx.restore();
}