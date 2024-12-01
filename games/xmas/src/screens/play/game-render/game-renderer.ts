import { GameWorldState } from '../game-world/game-world-types';
import { RenderState } from './render-state';
import { renderLandscape } from './landscape/landscape-renderer';
import { renderSnow } from './snow-renderer';
import { renderSanta } from './santa-renderer';
import { renderFireballs } from './fireball-renderer';
import { renderSky } from './landscape/sky/sky-renderer';
import { renderGifts } from './gift-renderer';

export const renderGame = (ctx: CanvasRenderingContext2D, world: GameWorldState, renderState: RenderState) => {
  const { viewport } = renderState;

  // Save the current context state
  ctx.save();

  // Render sky gradient (background)
  renderSky(ctx, ctx.canvas.height);

  // Apply viewport translation
  ctx.translate(viewport.x, viewport.y);

  // Render all game elements with the applied translation
  renderLandscape(ctx, renderState.landscape, renderState.viewport);
  renderSnow(ctx, renderState);

  // Render gifts before Santas for proper depth
  renderGifts(ctx, world.gifts, world.time);

  // Render all santas
  world.santas.forEach((santa) => {
    renderSanta(ctx, santa, world.time);
  });

  renderFireballs(ctx, renderState);

  // Restore the context state
  ctx.restore();
};