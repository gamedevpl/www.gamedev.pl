import { BonusType, GameState, LevelConfig } from './gameplay-types';
import { drawObstacles, drawGoal } from './grid-objects-render';
import { drawGrid } from './grid-render';
import { drawPlayer } from './player-render';
import { drawMonsters } from './monster-render';
import { drawBonuses, drawLandMines, drawTimeBombs } from './bonus-render';
import { drawExplosions } from './explosion-render';
import { calculateDrawingOrder } from './isometric-utils';
import { calculateShakeOffset, interpolatePosition } from './animation-utils';
import { drawTooltip } from './tooltip-render';
import { drawElectricalDischarges } from './discharges-render';
import { drawPlatform } from './grid-render';
import { drawBlasterShot, drawSlideTrail, drawTsunamiEffect } from './bonus-effect-render';

export const PLATFORM_HEIGHT = 20;

export const drawGameState = (
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  { gridSize, cellSize }: LevelConfig,
) => {
  ctx.save();

  // Apply screen shake if there are active explosions
  if (gameState.explosions.length > 0) {
    const shakeIntensity = Math.min(
      gameState.explosions.filter((explosion) => Date.now() - explosion.startTime < explosion.duration).length * 2,
      10,
    ); // Cap the intensity
    const shakeOffset = calculateShakeOffset(shakeIntensity);
    ctx.translate(shakeOffset.x, shakeOffset.y);
  }

  ctx.translate(ctx.canvas.width / 2, 100); // Center the isometric view

  // Clear the canvas
  ctx.clearRect(-ctx.canvas.width / 2, -100, ctx.canvas.width, ctx.canvas.height);

  // Draw the platform
  drawPlatform(ctx, gridSize);

  // Draw the grid
  drawGrid(ctx, gridSize, gameState);

  // Draw tsunami effect
  if (gameState.tsunamiLevel > 0) {
    drawTsunamiEffect(ctx, gameState, gridSize, cellSize);
  }

  // Draw electrical discharges
  drawElectricalDischarges(ctx, gridSize, gameState.monsterSpawnSteps, gameState.player.moveTimestamp, cellSize);

  // Draw slide movement trail
  if (gameState.isSliding) {
    drawSlideTrail(ctx, gameState.player.previousPosition, gameState.player.position);
  }

  // Prepare all game objects for sorting
  const allObjects = [
    ...gameState.obstacles.map((obj) => ({ position: obj.position, type: 'obstacle', obj }) as const),
    ...gameState.bonuses.map((obj) => ({ position: obj.position, type: 'bonus', obj }) as const),
    ...gameState.landMines.map((obj) => ({ position: obj, type: 'landMine' }) as const),
    ...gameState.timeBombs.map((obj) => ({ position: obj.position, type: 'timeBomb', obj }) as const),
    ...gameState.monsters.map((obj) => ({ position: obj.position, type: 'monster', obj }) as const),
    { position: gameState.player.position, type: 'player', obj: gameState.player } as const,
    { position: gameState.goal, type: 'goal' } as const,
    ...gameState.explosions.map((obj) => ({ position: obj.position, type: 'explosion', obj }) as const),
    ...gameState.blasterShots.map(
      (obj) =>
        ({
          position: interpolatePosition(obj.endPosition, obj.startPosition, obj.shotTimestamp, obj.duration),
          type: 'blasterShot',
          obj,
        }) as const,
    ),
  ];

  // Sort all objects using calculateDrawingOrder
  const sortedObjects = calculateDrawingOrder(allObjects);

  // Draw game elements in sorted order
  for (const sortedObject of sortedObjects) {
    const { type, position } = sortedObject;
    switch (type) {
      case 'obstacle':
        drawObstacles(ctx, [sortedObject.obj], cellSize);
        break;
      case 'bonus':
        drawBonuses(ctx, [sortedObject.obj], cellSize);
        break;
      case 'landMine':
        drawLandMines(ctx, [position], cellSize);
        break;
      case 'timeBomb':
        drawTimeBombs(ctx, [sortedObject.obj], cellSize);
        break;
      case 'monster':
        drawMonsters(ctx, [sortedObject.obj], cellSize, gameState.player.isMonster);
        break;
      case 'player':
        drawPlayer(
          ctx,
          sortedObject.obj,
          cellSize,
          gameState.activeBonuses.some((bonus) => bonus.type === BonusType.CapOfInvisibility),
          gameState.obstacles,
          gameState.player.isMonster,
          gameState.player.hasBlaster,
        );
        break;
      case 'goal':
        drawGoal(ctx, position, cellSize);
        break;
      case 'explosion':
        drawExplosions(ctx, [sortedObject.obj]);
        break;
      case 'blasterShot':
        drawBlasterShot(ctx, sortedObject.obj, cellSize);
        break;
    }
  }

  // Draw tooltip if there's an active bonus
  const tooltipBonus = gameState.activeBonuses.find(
    (bonus) =>
      bonus.duration === 13 ||
      [BonusType.Builder, BonusType.CapOfInvisibility, BonusType.Crusher, BonusType.Blaster].includes(bonus.type),
  );

  if (tooltipBonus) {
    drawTooltip(ctx, gameState.player.position, tooltipBonus, cellSize);
  }

  ctx.restore();
};
