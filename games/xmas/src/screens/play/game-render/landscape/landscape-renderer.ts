import { LandscapeState } from './landscape-state';
import { renderStars } from './star/star-renderer';
import { renderMountains } from './mountain/mountain-renderer';
import { renderTrees } from './tree/tree-renderer';
import { renderSnowGrounds } from './snow-ground/snow-ground-renderer';
import { ViewportState } from '../render-state';
import { devConfig } from '../../dev/dev-config';

/**
 * Render the complete landscape with all its components
 * Rendering order (back to front):
 * 1. Stars (background)
 * 2. Mountains (with parallax)
 * 3. Snow Ground (simplified)
 * 4. Trees (simplified)
 */
export function renderLandscape(ctx: CanvasRenderingContext2D, state: LandscapeState, viewport: ViewportState): void {
  // Save the current context state
  ctx.save();

  // Enable crisp pixel art rendering
  ctx.imageSmoothingEnabled = false;

  // Render stars (background)
  renderStars(ctx, state.stars.stars, viewport);

  // Render mountains (with parallax)
  if (devConfig.renderMountains) {
    renderMountains(ctx, state.mountains.mountains, viewport);
  }

  // Render snow ground (simplified, no parallax)
  if (devConfig.renderSnowGround) {
    renderSnowGrounds(ctx, state.snowGround.grounds);
  }

  // Render trees (simplified, no parallax)
  if (devConfig.renderTrees) {
    renderTrees(ctx, state.trees.trees);
  }

  // Restore the context state
  ctx.restore();
}
