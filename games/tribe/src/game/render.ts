import { GameWorldState } from './world-types';
import { HOURS_PER_GAME_DAY } from './world-consts';

export function renderGame(ctx: CanvasRenderingContext2D, gameState: GameWorldState): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Background
  ctx.fillStyle = '#2c5234'; // Dark green
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  if (gameState.gameOver) {
    ctx.fillStyle = 'white';
    ctx.font = '30px Press Start 2P, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over!', ctx.canvas.width / 2, ctx.canvas.height / 2 - 60);
    ctx.font = '20px Press Start 2P, Arial';
    ctx.fillText(
      `Lineage Extinct. Generations Survived: ${gameState.generationCount}`,
      ctx.canvas.width / 2,
      ctx.canvas.height / 2 - 20,
    );
    ctx.fillText(`Cause: ${gameState.causeOfGameOver || 'Unknown'}`, ctx.canvas.width / 2, ctx.canvas.height / 2 + 20);
    return;
  }

  // TODO: Implement rendering of entities like characters, berry bushes, etc.

  // Render UI
  ctx.fillStyle = 'white';
  ctx.font = '18px Press Start 2P, Arial'; // Using a common fallback
  ctx.textAlign = 'left';
  let uiLine = 1;
  const lineHeight = 22;

  ctx.fillText(`Generation: ${gameState.generationCount}`, 20, lineHeight * uiLine++);
  ctx.fillText(`Time: Day ${Math.floor(gameState.time / HOURS_PER_GAME_DAY)}`, 20, lineHeight * uiLine++);
}
