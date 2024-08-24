import { BonusType, GameState, isActiveBonus, LevelConfig } from './gameplay-types';
import { drawObstacles, drawGoal } from './render/grid-objects-render';
import { drawGrid } from './render/grid-render';
import { drawPlayer } from './render/player-render';
import { drawMonsters } from './render/monster-render';
import { drawBonuses, drawLandMines, drawTimeBombs } from './render/bonus-render';
import { drawExplosions } from './render/explosion-render';
import { calculateDrawingOrder } from './render/isometric-utils';
import { calculateShakeOffset, interpolatePosition } from './render/animation-utils';
import { drawTooltip } from './render/tooltip-render';
import { drawPlatform } from './render/grid-render';
import {
  drawBlasterShot,
  drawSlideTrail,
  drawTsunamiWave,
  generateTsunamiWaves,
  TSUNAMI_TEARDOWN_DURATION,
} from './render/bonus-effect-render';
import { drawPurpleImpulse } from './render/purple-impulse-render';

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

  // Generate tsunami effect
  const tsunamiWaves =
    gameState.tsunamiLevel > 0 || gameState.tsunamiTeardownTimestamp
      ? generateTsunamiWaves(gameState, gridSize, cellSize)
      : [];

  if (Date.now() - gameState.tsunamiTeardownTimestamp! > TSUNAMI_TEARDOWN_DURATION && !gameState.player.isVanishing) {
    gameState.tsunamiTeardownTimestamp = undefined;
  }

  // Draw slide movement trail
  if (isActiveBonus(gameState, BonusType.Slide)) {
    drawSlideTrail(ctx, gameState.player.previousPosition, gameState.player.position);
  }

  // Draw purple impulse effect after all other elements
  // It will only animate for 1 second after player movement
  drawPurpleImpulse(ctx, gameState, { gridSize });

  // Prepare all game objects for sorting
  const allObjects = [
    ...tsunamiWaves.map((obj) => ({ position: obj.grid, type: 'wave', obj }) as const),
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
      case 'wave':
        drawTsunamiWave(ctx, sortedObject.obj);
        break;
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
        drawMonsters(ctx, [sortedObject.obj], cellSize, isActiveBonus(gameState, BonusType.Monster));
        break;
      case 'player':
        drawPlayer(
          ctx,
          sortedObject.obj,
          cellSize,
          gameState.activeBonuses.some((bonus) => bonus.type === BonusType.CapOfInvisibility),
          gameState.obstacles,
          isActiveBonus(gameState, BonusType.Monster),
          isActiveBonus(gameState, BonusType.Blaster),
          isActiveBonus(gameState, BonusType.Climber),
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
  const tooltipBonus = gameState.activeBonuses.sort((a, b) => b.duration - a.duration)[0];

  if (tooltipBonus) {
    drawTooltip(ctx, gameState.player.position, tooltipBonus, cellSize);
  }

  ctx.restore();
};
