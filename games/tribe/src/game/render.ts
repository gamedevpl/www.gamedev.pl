import { GameWorldState } from './world-types';

export function renderGame(ctx: CanvasRenderingContext2D, gameState: GameWorldState): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.fillStyle = 'black';
  ctx.font = '24px Arial';
  ctx.fillText('Time: ' + Math.floor(gameState.time), 50, 50);
}
