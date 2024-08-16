import { GridSize, BonusType, GameState, Position, Bonus, TimeBomb, Monster, Explosion } from './gameplay-types';
import { drawGrid, drawObstacles } from './grid-utils';
import { drawPlayer } from './player-render';
import { drawMonsters } from './monster-render';
import { drawGoal } from './grid-utils';
import { drawBonuses, drawLandMines, drawTimeBombs } from './bonus-render';
import { drawExplosions } from './explosion-render';
import { toIsometric, calculateDrawingOrder } from './isometric-utils';

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

  // Prepare all game objects for sorting
  const allObjects: ({ position: Position } & (
    | { type: 'obstacle'; obj: Position }
    | { type: 'bonus'; obj: Bonus }
    | { type: 'landMine'; obj: Position }
    | { type: 'timeBomb'; obj: TimeBomb }
    | { type: 'monster'; obj: Monster }
    | { type: 'player'; obj: Position }
    | { type: 'goal'; obj: Position }
    | { type: 'explosion'; obj: Explosion }
  ))[] = [
    ...gameState.obstacles.map((obj) => ({ position: obj, type: 'obstacle', obj } as const)),
    ...gameState.bonuses.map((obj) => ({ position: obj.position, type: 'bonus', obj } as const)),
    ...gameState.landMines.map((obj) => ({ position: obj, type: 'landMine', obj } as const)),
    ...gameState.timeBombs.map((obj) => ({ position: obj.position, type: 'timeBomb', obj } as const)),
    ...gameState.monsters.map((obj) => ({ position: obj.position, type: 'monster', obj } as const)),
    { position: gameState.playerPosition, type: 'player', obj: gameState.playerPosition } as const,
    { position: gameState.goal, type: 'goal', obj: gameState.goal } as const,
    ...gameState.explosions.map((obj) => ({ position: obj.position, type: 'explosion', obj } as const)),
  ];

  // Sort all objects using calculateDrawingOrder
  const sortedObjects = calculateDrawingOrder(allObjects);

  // Draw game elements in sorted order
  for (const { type, obj } of sortedObjects) {
    switch (type) {
      case 'obstacle':
        drawObstacles(ctx, [obj], cellSize);
        break;
      case 'bonus':
        drawBonuses(ctx, [obj], cellSize);
        break;
      case 'landMine':
        drawLandMines(ctx, [obj], cellSize);
        break;
      case 'timeBomb':
        drawTimeBombs(ctx, [obj], cellSize);
        break;
      case 'monster':
        drawMonsters(ctx, [obj], cellSize);
        break;
      case 'player':
        drawPlayer(
          ctx,
          obj,
          cellSize,
          gameState.activeBonuses.some((bonus) => bonus.type === BonusType.CapOfInvisibility),
        );
        break;
      case 'goal':
        drawGoal(ctx, obj, cellSize);
        break;
      case 'explosion':
        drawExplosions(ctx, [obj], cellSize);
        break;
    }
  }

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
  ctx.fillStyle = '#734A12'; // Medium brown
  ctx.beginPath();
  ctx.moveTo(bottomRight.x, bottomRight.y);
  ctx.lineTo(bottomRight.x, bottomRight.y + PLATFORM_HEIGHT);
  ctx.lineTo(bottomLeft.x, bottomLeft.y + PLATFORM_HEIGHT);
  ctx.lineTo(bottomLeft.x, bottomLeft.y);
  ctx.closePath();
  ctx.fill();

  // Draw front side
  ctx.fillStyle = '#5D2E0C'; // Darker brown
  ctx.beginPath();
  ctx.moveTo(bottomRight.x, bottomRight.y);
  ctx.lineTo(bottomRight.x, bottomRight.y + PLATFORM_HEIGHT);
  ctx.lineTo(topRight.x, topRight.y + PLATFORM_HEIGHT);
  ctx.lineTo(topRight.x, topRight.y);
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
