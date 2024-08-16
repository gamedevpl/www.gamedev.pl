import { Position } from './gameplay-types';

export const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number, cellSize: number) => {
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;

  for (let i = 0; i <= width; i++) {
    const pos = i * cellSize;

    // Draw vertical line
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, height * cellSize);
    ctx.stroke();
  }

  for (let j = 0; j <= height; j++) {
    const pos = j * cellSize;

    // Draw horizontal line
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(width * cellSize, pos);
    ctx.stroke();
  }
};

export const drawGoal = (ctx: CanvasRenderingContext2D, position: Position, cellSize: number) => {
  const x = position.x * cellSize;
  const y = position.y * cellSize;

  ctx.fillStyle = 'green';
  ctx.fillRect(x, y, cellSize, cellSize);
};

export const drawObstacles = (ctx: CanvasRenderingContext2D, obstacles: Position[], cellSize: number) => {
  ctx.fillStyle = 'gray';

  obstacles.forEach((obstacle) => {
    const x = obstacle.x * cellSize;
    const y = obstacle.y * cellSize;

    // Fill the obstacle
    ctx.fillRect(x, y, cellSize, cellSize);

    // Add a cross pattern to make obstacles more visible
    ctx.strokeStyle = 'darkgray';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + cellSize, y + cellSize);
    ctx.moveTo(x + cellSize, y);
    ctx.lineTo(x, y + cellSize);
    ctx.stroke();
  });
};