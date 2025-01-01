import { GameWorldState } from '../game-world/game-world-types';
import { RenderState } from './render-state';

export function drawGround(ctx: CanvasRenderingContext2D, world: GameWorldState, renderState: RenderState) {
  const { viewport } = renderState;

  // Create a simple canvas pattern for the ground
  const patternCanvas = document.createElement('canvas');
  patternCanvas.width = 32;
  patternCanvas.height = 32;
  const patternCtx = patternCanvas.getContext('2d');
  if (!patternCtx) return;

  // Draw a simple grass pattern
  patternCtx.fillStyle = '#228B22';
  patternCtx.fillRect(0, 0, 32, 32);
  patternCtx.fillStyle = '#32CD32';
  patternCtx.fillRect(0, 0, 16, 16);
  patternCtx.fillRect(16, 16, 16, 16);

  // Create the pattern
  const pattern = ctx.createPattern(patternCanvas, 'repeat');
  if (!pattern) return;

  // Apply the pattern to the ground
  ctx.save();
  ctx.fillStyle = pattern;
  ctx.fillRect(-viewport.x, -viewport.y, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}
