import { Position } from './gameplay-types';
import { toIsometric, TILE_WIDTH, TILE_HEIGHT } from './isometric-utils';

export const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  ctx.strokeStyle = '#4a4a4a'; // Updated to a darker gray for better visibility
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
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(isoX, isoY + TILE_HEIGHT / 2, TILE_WIDTH / 2, TILE_HEIGHT / 4, 0, 0, Math.PI * 2);
  ctx.fill();

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
  const shadowOffset = cellSize * 0.1; // Offset for the shadow

  obstacles.forEach((obstacle) => {
    const { x: isoX, y: isoY } = toIsometric(obstacle.x, obstacle.y);

    // Draw rectangular shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; // Slightly transparent black
    ctx.beginPath();
    ctx.moveTo(isoX - TILE_WIDTH / 2 + shadowOffset, isoY + TILE_HEIGHT / 2 + shadowOffset);
    ctx.lineTo(isoX + shadowOffset, isoY + TILE_HEIGHT + shadowOffset);
    ctx.lineTo(isoX + TILE_WIDTH / 2 + shadowOffset, isoY + TILE_HEIGHT / 2 + shadowOffset);
    ctx.lineTo(isoX + shadowOffset, isoY + shadowOffset);
    ctx.closePath();
    ctx.fill();

    // Draw top face
    ctx.fillStyle = '#8e24aa'; // Updated to match the bright purple color in the image
    ctx.beginPath();
    ctx.moveTo(isoX, isoY - obstacleHeight);
    ctx.lineTo(isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2 - obstacleHeight);
    ctx.lineTo(isoX, isoY + TILE_HEIGHT - obstacleHeight);
    ctx.lineTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2 - obstacleHeight);
    ctx.closePath();
    ctx.fill();

    // Draw right face
    ctx.fillStyle = '#6a1b9a'; // Updated to a slightly darker purple for the right face
    ctx.beginPath();
    ctx.moveTo(isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2 - obstacleHeight);
    ctx.lineTo(isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
    ctx.lineTo(isoX, isoY + TILE_HEIGHT);
    ctx.lineTo(isoX, isoY + TILE_HEIGHT - obstacleHeight);
    ctx.closePath();
    ctx.fill();

    // Draw left face
    ctx.fillStyle = '#4a148c'; // Updated to the darkest purple for the left face
    ctx.beginPath();
    ctx.moveTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2 - obstacleHeight);
    ctx.lineTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
    ctx.lineTo(isoX, isoY + TILE_HEIGHT);
    ctx.lineTo(isoX, isoY + TILE_HEIGHT - obstacleHeight);
    ctx.closePath();
    ctx.fill();
  });
};
