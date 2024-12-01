import { LandscapeState } from './landscape-state';
import { renderStars } from './star/star-renderer';
import { renderMountains } from './mountain/mountain-renderer';
import { renderTrees } from './tree/tree-renderer';
import { renderSnowGrounds } from './snow-ground/snow-ground-renderer';
import { ViewportState } from '../render-state';

export function renderLandscape(ctx: CanvasRenderingContext2D, state: LandscapeState, viewport: ViewportState): void {
  // Save the current context state
  ctx.save();

  // Enable crisp pixel art rendering
  ctx.imageSmoothingEnabled = false;

  // Render stars (background)
  renderStars(ctx, state.stars.stars);

  // Render mountains (back to front)
  renderMountains(ctx, state.mountains.mountains, viewport);

  // Render snow ground (between mountains and trees)
  renderSnowGrounds(ctx, state.snowGround.grounds, viewport);

  // Render trees (back to front)
  renderTrees(ctx, state.trees.trees, viewport);

  // Restore the context state
  ctx.restore();
}