import { GridSize, BonusType, GameState } from './gameplay-types';
import { drawGrid } from './grid-utils';
import { drawPlayer } from './player-render';
import { drawMonsters } from './monster-render';
import { drawGoal, drawObstacles } from './grid-utils';
import { drawBonuses, drawLandMines, drawTimeBombs } from './bonus-render';
import { drawExplosions } from './explosion-render';

export const drawGameState = (
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  gridSize: GridSize,
  cellSize: number,
) => {
  ctx.clearRect(0, 0, gridSize.width * cellSize, gridSize.height * cellSize);
  drawGrid(ctx, gridSize.width, gridSize.height, cellSize);
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
};
