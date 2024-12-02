import { GameWorldState } from '../game-world/game-world-types';
import { RenderState } from './render-state';
import { renderLandscape } from './landscape/landscape-renderer';
import { renderSnow } from './snow-renderer';
import { renderSanta } from './santa-renderer';
import { renderFireballs } from './fireball-renderer';
import { renderSky } from './landscape/sky/sky-renderer';
import { renderGifts } from './gift-renderer';
import { devConfig } from '../dev/dev-config';

export const renderGame = (ctx: CanvasRenderingContext2D, world: GameWorldState, renderState: RenderState) => {
  const { viewport } = renderState;

  // Save the current context state
  ctx.save();

  // Render sky gradient (background)
  renderSky(ctx, ctx.canvas.height);

  // Apply viewport translation
  ctx.translate(viewport.x, viewport.y);

  // Conditionally render landscape elements based on dev config
  if (devConfig.renderMountains || devConfig.renderTrees || devConfig.renderSnowGround) {
    // Pass dev config to control individual landscape elements
    renderLandscape(ctx, renderState.landscape, renderState.viewport);
  }

  // Conditionally render snow effects
  if (devConfig.renderSnow) {
    renderSnow(ctx, renderState);
  }

  // Render gifts before Santas for proper depth
  renderGifts(ctx, world.gifts, world.time);

  // Always render Santas as they're essential game elements
  world.santas.forEach((santa) => {
    renderSanta(ctx, santa, world.time);
  });

  // Conditionally render fire effects
  if (devConfig.renderFire) {
    renderFireballs(ctx, renderState);
  }

  // Restore the context state
  ctx.restore();
};
