import { GameWorldState } from '../game-world/game-world-types';
import { RenderState } from './render-state';
import { drawGround } from './ground-renderer';
import { renderPrey } from './entity-renderers/prey-renderer';
import { renderDebugInfo } from './debug-renderer';
import { getLions, getPrey, getCarrion } from '../game-world/game-world-query';
import { drawLion } from './entity-renderers/lion-renderer';
import { drawCarrion } from './entity-renderers/carrion-renderer';
import { renderEnvironment } from './environment-renderer';

export const renderGame = (ctx: CanvasRenderingContext2D, world: GameWorldState, renderState: RenderState) => {
  const { viewport } = renderState;

  ctx.save();

  // Draw the ground
  drawGround(ctx, renderState);

  ctx.translate(viewport.x, viewport.y);

  // Render environment
  renderEnvironment(ctx, world.environment);

  // Render all carrion entities
  getCarrion(world).forEach((c) => drawCarrion(ctx, c));

  // Render all prey entities
  getPrey(world).forEach((p) => renderPrey(ctx, p));

  // Render all lions
  getLions(world).forEach((lion) => drawLion(ctx, lion));

  // Render debug information
  renderDebugInfo(ctx, world);

  ctx.restore();
};
