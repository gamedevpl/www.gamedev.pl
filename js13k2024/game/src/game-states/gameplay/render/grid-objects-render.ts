import { Position, Obstacle } from '../gameplay-types';
import { toIsometric, TILE_WIDTH, TILE_HEIGHT } from './isometric-utils';
import { calculateObstacleHeight } from './animation-utils';

export const drawGoal = (ctx: CanvasRenderingContext2D, position: Position, cellSize: number) => {
  const { x: isoX, y: isoY } = toIsometric(position.x, position.y);

  // Draw shadow
  ctx.fillStyle = '#0000004D';
  ctx.beginPath();
  ctx.ellipse(isoX, isoY + TILE_HEIGHT / 2, TILE_WIDTH / 2, TILE_HEIGHT / 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw goal
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.moveTo(isoX, isoY);
  ctx.lineTo(isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
  ctx.lineTo(isoX, isoY + TILE_HEIGHT);
  ctx.lineTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
  ctx.closePath();
  ctx.fill();

  // Add star icon
  ctx.fillStyle = '#000000';
  ctx.font = `${cellSize / 2}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', isoX, isoY + TILE_HEIGHT / 2);
};

export const drawObstacles = (ctx: CanvasRenderingContext2D, obstacles: Obstacle[], cellSize: number) => {
  obstacles.forEach((obstacle) => {
    const { position, creationTime, isRaising, isDestroying } = obstacle;
    const { x: isoX, y: isoY } = toIsometric(position.x, position.y);

    const height = calculateObstacleHeight(creationTime, isRaising, isDestroying) * cellSize * 0.8;
    if (height === 0) return;

    const shadowHeight = (height / cellSize) * 0.2;
    drawObstacleShadow(ctx, position, shadowHeight);

    const opacity = isDestroying ? height / (cellSize * 0.8) : 1;
    const alphaHex = Math.floor(opacity * 255).toString(16).padStart(2, '0');

    drawObstacleFace(ctx, isoX, isoY, height, '#8E24AA' + alphaHex, 0);
    drawObstacleFace(ctx, isoX, isoY, height, '#6A1B9A' + alphaHex, 1);
    drawObstacleFace(ctx, isoX, isoY, height, '#4A148C' + alphaHex, 2);
  });
};

const drawObstacleShadow = (ctx: CanvasRenderingContext2D, position: Position, shadowHeight: number) => {
  const { x: x1, y: y1 } = toIsometric(position.x, position.y + 1);
  const { x: x2, y: y2 } = toIsometric(position.x + 1, position.y + 1);
  const { x: x3, y: y3 } = toIsometric(position.x + 1, position.y + 1 + shadowHeight);
  const { x: x4, y: y4 } = toIsometric(position.x, position.y + 1 + shadowHeight);

  ctx.fillStyle = '#0000004D';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
};

const drawObstacleFace = (ctx: CanvasRenderingContext2D, x: number, y: number, height: number, color: string, face: number) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  switch (face) {
    case 0: // top
      ctx.moveTo(x, y - height);
      ctx.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - height);
      ctx.lineTo(x, y + TILE_HEIGHT - height);
      ctx.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - height);
      break;
    case 1: // right
      ctx.moveTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - height);
      ctx.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
      ctx.lineTo(x, y + TILE_HEIGHT);
      ctx.lineTo(x, y + TILE_HEIGHT - height);
      break;
    case 2: // left
      ctx.moveTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - height);
      ctx.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
      ctx.lineTo(x, y + TILE_HEIGHT);
      ctx.lineTo(x, y + TILE_HEIGHT - height);
      break;
  }
  ctx.closePath();
  ctx.fill();
};