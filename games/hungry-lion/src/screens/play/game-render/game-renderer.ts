import { GameWorldState } from '../game-world/game-world-types';
import { RenderState } from './render-state';

export const renderGame = (ctx: CanvasRenderingContext2D, _world: GameWorldState, renderState: RenderState) => {
  const { viewport } = renderState;

  // Save the current context state
  ctx.save();

  // Apply viewport translation
  ctx.translate(viewport.x, viewport.y);

  // Restore the context state
  ctx.restore();
};
