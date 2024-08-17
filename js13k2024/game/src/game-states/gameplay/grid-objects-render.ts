import { Position, Obstacle } from './gameplay-types';
import { toIsometric, TILE_WIDTH, TILE_HEIGHT } from './isometric-utils';
import { calculateObstacleHeight } from './animation-utils';

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

export const drawObstacles = (ctx: CanvasRenderingContext2D, obstacles: Obstacle[], cellSize: number) => {
  const shadowOffset = cellSize * 0.1; // Offset for the shadow

  obstacles.forEach((obstacle) => {
    const { position, creationTime, isRaising } = obstacle;
    const { x: isoX, y: isoY } = toIsometric(position.x, position.y);

    // Calculate the current height of the obstacle based on animation
    const height = calculateObstacleHeight(creationTime, isRaising) * cellSize * 0.8;

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
    ctx.moveTo(isoX, isoY - height);
    ctx.lineTo(isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2 - height);
    ctx.lineTo(isoX, isoY + TILE_HEIGHT - height);
    ctx.lineTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2 - height);
    ctx.closePath();
    ctx.fill();

    // Draw right face
    ctx.fillStyle = '#6a1b9a'; // Updated to a slightly darker purple for the right face
    ctx.beginPath();
    ctx.moveTo(isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2 - height);
    ctx.lineTo(isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
    ctx.lineTo(isoX, isoY + TILE_HEIGHT);
    ctx.lineTo(isoX, isoY + TILE_HEIGHT - height);
    ctx.closePath();
    ctx.fill();

    // Draw left face
    ctx.fillStyle = '#4a148c'; // Updated to the darkest purple for the left face
    ctx.beginPath();
    ctx.moveTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2 - height);
    ctx.lineTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
    ctx.lineTo(isoX, isoY + TILE_HEIGHT);
    ctx.lineTo(isoX, isoY + TILE_HEIGHT - height);
    ctx.closePath();
    ctx.fill();
  });
};
