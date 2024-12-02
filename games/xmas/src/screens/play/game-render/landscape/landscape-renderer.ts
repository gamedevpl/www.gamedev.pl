import { LandscapeState } from './landscape-state';
import { renderStars } from './star/star-renderer';
import { renderMountains } from './mountain/mountain-renderer';
import { renderTrees } from './tree/tree-renderer';
import { renderSnowGrounds } from './snow-ground/snow-ground-renderer';
import { ViewportState } from '../render-state';
import { devConfig } from '../../dev/dev-config';

export function renderLandscape(ctx: CanvasRenderingContext2D, state: LandscapeState, viewport: ViewportState): void {
  // Save the current context state
  ctx.save();

  // Enable crisp pixel art rendering
  ctx.imageSmoothingEnabled = false;

  // Render stars (background)
  renderStars(ctx, state.stars.stars);

  // Render mountains (back to front)
  if (devConfig.renderMountains) {
    renderMountains(ctx, state.mountains.mountains, viewport);
  }

  // Render snow ground (between mountains and trees)
  if (devConfig.renderSnowGround) {
    renderSnowGrounds(ctx, state.snowGround.grounds, viewport);
  }

  // Render trees (back to front)
  if (devConfig.renderTrees) {
    renderTrees(ctx, state.trees.trees, viewport);
  }

  // Restore the context state
  ctx.restore();
}
