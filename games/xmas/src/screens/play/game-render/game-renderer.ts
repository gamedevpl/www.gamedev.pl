import { GameWorldState } from '../game-world/game-world-types';

export function renderGame(world: GameWorldState, ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = 'red';
  ctx.fillText(world.time.toString(), 10, 10);

  return null;
}
