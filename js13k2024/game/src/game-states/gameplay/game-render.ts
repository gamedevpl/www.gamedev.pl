import { GridSize, BonusType, GameState } from './gameplay-types';
import { drawGrid, drawObstacles } from './grid-utils';
import { drawPlayer } from './player-render';
import { drawMonsters } from './monster-render';
import { drawGoal } from './grid-utils';
import { drawBonuses, drawLandMines, drawTimeBombs } from './bonus-render';
import { drawExplosions } from './explosion-render';
import { toIsometric } from './isometric-utils';

const PLATFORM_HEIGHT = 20;
const SHADOW_OFFSET = 5;

export const drawGameState = (
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  gridSize: GridSize,
  cellSize: number,
) => {
  ctx.save();
  ctx.translate(ctx.canvas.width / 2, 100); // Center the isometric view

  // Clear the canvas
  ctx.clearRect(-ctx.canvas.width / 2, -100, ctx.canvas.width, ctx.canvas.height);

  // Draw the platform
  drawPlatform(ctx, gridSize);

  // Draw the grid
  drawGrid(ctx, gridSize.width, gridSize.height);

  // Draw game elements
  drawObstacles(ctx, gameState.obstacles, cellSize);
  drawBonuses(ctx, gameState.bonuses, cellSize);
  drawLandMines(ctx, gameState.landMines, cellSize);
  drawTimeBombs(ctx, gameState.timeBombs, cellSize);
  drawMonsters(ctx, gameState.monsters, cellSize);
  drawPlayer(
    ctx,
    gameState.playerPosition,
    cellSize,
    gameState.activeBonuses.some((bonus) => bonus.type === BonusType.CapOfInvisibility),
  );
  drawGoal(ctx, gameState.goal, cellSize);
  drawExplosions(ctx, gameState.explosions, cellSize);

  ctx.restore();
};

const drawPlatform = (ctx: CanvasRenderingContext2D, gridSize: GridSize) => {
  const { width, height } = gridSize;
  const topLeft = toIsometric(0, 0);
  const topRight = toIsometric(width, 0);
  const bottomLeft = toIsometric(0, height);
  const bottomRight = toIsometric(width, height);

  // Draw top surface
  ctx.fillStyle = '#8B4513'; // Saddle Brown
  ctx.beginPath();
  ctx.moveTo(topLeft.x, topLeft.y);
  ctx.lineTo(topRight.x, topRight.y);
  ctx.lineTo(bottomRight.x, bottomRight.y);
  ctx.lineTo(bottomLeft.x, bottomLeft.y);
  ctx.closePath();
  ctx.fill();

  // Draw right side
  ctx.fillStyle = '#5D2E0C'; // Darker brown
  ctx.beginPath();
  ctx.moveTo(bottomRight.x, bottomRight.y);
  ctx.lineTo(bottomRight.x, bottomRight.y + PLATFORM_HEIGHT);
  ctx.lineTo(bottomLeft.x, bottomLeft.y + PLATFORM_HEIGHT);
  ctx.lineTo(bottomLeft.x, bottomLeft.y);
  ctx.closePath();
  ctx.fill();

  // Draw left side
  ctx.fillStyle = '#734A12'; // Medium brown
  ctx.beginPath();
  ctx.moveTo(bottomLeft.x, bottomLeft.y);
  ctx.lineTo(bottomLeft.x, bottomLeft.y + PLATFORM_HEIGHT);
  ctx.lineTo(topLeft.x, topLeft.y + PLATFORM_HEIGHT);
  ctx.lineTo(topLeft.x, topLeft.y);
  ctx.closePath();
  ctx.fill();
};

// Helper function to draw shadows
export const drawShadow = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height / 2 + SHADOW_OFFSET, width / 2, height / 4, 0, 0, Math.PI * 2);
  ctx.fill();
};
