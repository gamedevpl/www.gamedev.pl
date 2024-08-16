import { Position } from './gameplay-types';
import { toIsometric, TILE_WIDTH, TILE_HEIGHT } from './isometric-utils';
import { drawShadow } from './game-render';

export const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  ctx.strokeStyle = '#8B7D6B'; // Light brown for grid lines
  ctx.lineWidth = 1;

  for (let y = 0; y <= height; y++) {
    for (let x = 0; x <= width; x++) {
      const { x: isoX, y: isoY } = toIsometric(x, y);

      // Draw horizontal line
      if (x < width) {
        ctx.beginPath();
        ctx.moveTo(isoX, isoY);
        ctx.lineTo(isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
        ctx.stroke();
      }

      // Draw vertical line
      if (y < height) {
        ctx.beginPath();
        ctx.moveTo(isoX, isoY);
        ctx.lineTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
        ctx.stroke();
      }
    }
  }
};

export const drawGoal = (ctx: CanvasRenderingContext2D, position: Position, cellSize: number) => {
  const { x: isoX, y: isoY } = toIsometric(position.x, position.y);

  // Draw shadow
  drawShadow(ctx, isoX - TILE_WIDTH / 2, isoY, TILE_WIDTH, TILE_HEIGHT);

  // Draw goal
  ctx.fillStyle = '#FFD700'; // Gold color for the goal
  ctx.beginPath();
  ctx.moveTo(isoX, isoY);
  ctx.lineTo(isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
  ctx.lineTo(isoX, isoY + TILE_HEIGHT);
  ctx.lineTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
  ctx.closePath();
  ctx.fill();

  // Add a star or flag icon to represent the goal
  ctx.fillStyle = '#000000';
  ctx.font = `${cellSize / 2}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', isoX, isoY + TILE_HEIGHT / 2);
};

export const drawObstacles = (ctx: CanvasRenderingContext2D, obstacles: Position[], cellSize: number) => {
  const obstacleHeight = cellSize * 0.8; // Height of the obstacle

  obstacles.forEach((obstacle) => {
    const { x: isoX, y: isoY } = toIsometric(obstacle.x, obstacle.y);

    // Draw shadow
    drawShadow(ctx, isoX - TILE_WIDTH / 2, isoY, TILE_WIDTH, TILE_HEIGHT);

    // Draw top face
    ctx.fillStyle = '#8B4513'; // Saddle Brown
    ctx.beginPath();
    ctx.moveTo(isoX, isoY - obstacleHeight);
    ctx.lineTo(isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2 - obstacleHeight);
    ctx.lineTo(isoX, isoY + TILE_HEIGHT - obstacleHeight);
    ctx.lineTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2 - obstacleHeight);
    ctx.closePath();
    ctx.fill();

    // Draw right face
    ctx.fillStyle = '#5D2E0C'; // Darker brown
    ctx.beginPath();
    ctx.moveTo(isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2 - obstacleHeight);
    ctx.lineTo(isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
    ctx.lineTo(isoX, isoY + TILE_HEIGHT);
    ctx.lineTo(isoX, isoY + TILE_HEIGHT - obstacleHeight);
    ctx.closePath();
    ctx.fill();

    // Draw left face
    ctx.fillStyle = '#734A12'; // Medium brown
    ctx.beginPath();
    ctx.moveTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2 - obstacleHeight);
    ctx.lineTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
    ctx.lineTo(isoX, isoY + TILE_HEIGHT);
    ctx.lineTo(isoX, isoY + TILE_HEIGHT - obstacleHeight);
    ctx.closePath();
    ctx.fill();
  });
};
