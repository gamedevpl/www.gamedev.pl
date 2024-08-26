import { PLATFORM_HEIGHT } from '../game-render';
import { TILE_HEIGHT, TILE_WIDTH, toIsometric } from './isometric-utils';
import { BonusType, GameState, isActiveBonus } from '../gameplay-types';

export const drawPlatform = (ctx: CanvasRenderingContext2D, gridSize: number) => {
  const topLeft = toIsometric(0, 0);
  const topRight = toIsometric(gridSize, 0);
  const bottomLeft = toIsometric(0, gridSize);
  const bottomRight = toIsometric(gridSize, gridSize);

  ctx.fillStyle = '#c2b280';
  ctx.beginPath();
  ctx.moveTo(topLeft.x, topLeft.y);
  ctx.lineTo(topRight.x, topRight.y);
  ctx.lineTo(bottomRight.x, bottomRight.y);
  ctx.lineTo(bottomLeft.x, bottomLeft.y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#5d4037';
  ctx.beginPath();
  ctx.moveTo(bottomRight.x, bottomRight.y);
  ctx.lineTo(bottomRight.x, bottomRight.y + PLATFORM_HEIGHT);
  ctx.lineTo(bottomLeft.x, bottomLeft.y + PLATFORM_HEIGHT);
  ctx.lineTo(bottomLeft.x, bottomLeft.y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#8d6e63';
  ctx.beginPath();
  ctx.moveTo(bottomRight.x, bottomRight.y);
  ctx.lineTo(bottomRight.x, bottomRight.y + PLATFORM_HEIGHT);
  ctx.lineTo(topRight.x, topRight.y + PLATFORM_HEIGHT);
  ctx.lineTo(topRight.x, topRight.y);
  ctx.closePath();
  ctx.fill();
};

export const drawGrid = (ctx: CanvasRenderingContext2D, gridSize: number, gameState: GameState) => {
  ctx.strokeStyle = '#4a4a4a';
  ctx.lineWidth = 1;

  for (let y = 0; y <= gridSize; y++) {
    for (let x = 0; x <= gridSize; x++) {
      const { x: isoX, y: isoY } = toIsometric(x, y);

      if (x < gridSize) {
        ctx.beginPath();
        ctx.moveTo(isoX, isoY);
        ctx.lineTo(isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
        ctx.stroke();
      }

      if (y < gridSize) {
        ctx.beginPath();
        ctx.moveTo(isoX, isoY);
        ctx.lineTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
        ctx.stroke();
      }

      if (isActiveBonus(gameState, BonusType.Slide)) {
        drawSlideTile(ctx, isoX, isoY);
      }
    }
  }
};

const drawSlideTile = (ctx: CanvasRenderingContext2D, isoX: number, isoY: number) => {
  const gradient = ctx.createLinearGradient(isoX - TILE_WIDTH / 2, isoY, isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT);
  gradient.addColorStop(0, '#c8c8ff33');
  gradient.addColorStop(0.5, '#dcdcff4d');
  gradient.addColorStop(1, '#c8c8ff33');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(isoX, isoY);
  ctx.lineTo(isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
  ctx.lineTo(isoX, isoY + TILE_HEIGHT);
  ctx.lineTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 3; i++) {
    const sparkleX = isoX + (Math.random() - 0.5) * TILE_WIDTH;
    const sparkleY = isoY + (Math.random() - 0.5) * TILE_HEIGHT;
    const sparkleSize = Math.random() * 2 + 1;

    ctx.fillStyle = '#ffffffb3';
    ctx.beginPath();
    ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const drawShadow = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
  ctx.fillStyle = '#0000004d';
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height / 2 + 5, width / 2, height / 4, 0, 0, Math.PI * 2);
  ctx.fill();
};