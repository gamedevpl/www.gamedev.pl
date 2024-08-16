import { Position } from './gameplay-types';

export const drawPlayer = (
  ctx: CanvasRenderingContext2D,
  position: Position,
  cellSize: number,
  isInvisible: boolean = false,
) => {
  const x = position.x * cellSize;
  const y = position.y * cellSize;

  ctx.fillStyle = 'blue';
  if (isInvisible) {
    ctx.globalAlpha = 0.5; // Make player semi-transparent when invisible
  }
  ctx.beginPath();
  ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize / 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1; // Reset global alpha
};