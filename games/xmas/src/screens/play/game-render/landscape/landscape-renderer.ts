import { LandscapeState } from './landscape-state';
import { renderSky } from './sky/sky-renderer';
import { renderStars } from './star/star-renderer';
import { renderMountains } from './mountain/mountain-renderer';
import { renderTrees } from './tree/tree-renderer';

/**
 * Main landscape rendering function
 * Coordinates the rendering of all landscape components in the correct order:
 * 1. Sky (background)
 * 2. Stars
 * 3. Mountains (back to front)
 * 4. Trees (back to front)
 */
export function renderLandscape(ctx: CanvasRenderingContext2D, state: LandscapeState): void {
  // Save the current context state
  ctx.save();

  // Enable crisp pixel art rendering
  ctx.imageSmoothingEnabled = false;

  // Render sky gradient (background)
  renderSky(ctx, ctx.canvas.height);

  // Render stars
  renderStars(ctx, state.stars.stars);

  // Render mountains (back to front)
  renderMountains(ctx, state.mountains.mountains);

  // Render trees (back to front)
  renderTrees(ctx, state.trees.trees);

  // Restore the context state
  ctx.restore();
}