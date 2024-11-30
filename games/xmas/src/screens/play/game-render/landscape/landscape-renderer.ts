import { LandscapeState } from './landscape-state';
import { renderStars } from './star/star-renderer';
import { renderMountains } from './mountain/mountain-renderer';
import { renderTrees } from './tree/tree-renderer';

export function renderLandscape(ctx: CanvasRenderingContext2D, state: LandscapeState): void {
  // Save the current context state
  ctx.save();

  // Enable crisp pixel art rendering
  ctx.imageSmoothingEnabled = false;

  // Render stars
  renderStars(ctx, state.stars.stars);

  // Render mountains (back to front)
  renderMountains(ctx, state.mountains.mountains);

  // Render trees (back to front)
  renderTrees(ctx, state.trees.trees);

  // Restore the context state
  ctx.restore();
}
