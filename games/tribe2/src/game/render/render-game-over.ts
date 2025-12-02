import { GameWorldState } from '../world-types';

export function renderGameOverScreen(ctx: CanvasRenderingContext2D, gameState: GameWorldState): void {
  ctx.fillStyle = 'white';
  ctx.font = '30px "Press Start 2P", Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Game Over!', ctx.canvas.width / 2, ctx.canvas.height / 2 - 60);
  ctx.font = '20px "Press Start 2P", Arial';
  ctx.fillText(`Lineage Extinct.`, ctx.canvas.width / 2, ctx.canvas.height / 2 - 20);
  ctx.fillText(`Cause: ${gameState.causeOfGameOver || 'Unknown'}`, ctx.canvas.width / 2, ctx.canvas.height / 2 + 20);
}
