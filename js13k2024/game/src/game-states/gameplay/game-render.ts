import { BonusType, GameState, LevelConfig } from './gameplay-types';
import { drawObstacles, drawGoal } from './grid-objects-render';
import { drawGrid } from './grid-render';
import { drawPlayer } from './player-render';
import { drawMonsters } from './monster-render';
import { drawBonuses, drawLandMines, drawTimeBombs } from './bonus-render';
import { drawExplosions } from './explosion-render';
import { calculateDrawingOrder } from './isometric-utils';
import { calculateShakeOffset } from './animation-utils';
import { drawTooltip } from './tooltip-render';
import { drawElectricalDischarges } from './discharges-render';
import { drawPlatform } from './grid-render';

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
  drawGrid(ctx, gridSize);

  // Draw electrical discharges
  drawElectricalDischarges(ctx, gridSize, gameState.monsterSpawnSteps, gameState.player.moveTimestamp, cellSize);

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
        drawMonsters(ctx, [sortedObject.obj], cellSize);
        break;
      case 'player':
        drawPlayer(
          ctx,
          sortedObject.obj,
          cellSize,
          gameState.activeBonuses.some((bonus) => bonus.type === BonusType.CapOfInvisibility),
          gameState.obstacles,
        );
        break;
      case 'goal':
        drawGoal(ctx, position, cellSize);
        break;
      case 'explosion':
        drawExplosions(ctx, [sortedObject.obj]);
        break;
    }
  }

  // Draw tooltip if there's an active bonus
  const tooltipBonus = gameState.activeBonuses.find(
    (bonus) =>
      bonus.duration === 13 || [BonusType.Builder, BonusType.CapOfInvisibility, BonusType.Crusher].includes(bonus.type),
  );

  if (tooltipBonus) {
    drawTooltip(ctx, gameState.player.position, tooltipBonus, cellSize);
  }

  ctx.restore();
};

// const drawTeleportPoint = (ctx: CanvasRenderingContext2D, teleportPoint: TeleportPoint, cellSize: number) => {
//   const { x, y } = teleportPoint.position;
//   const isoX = ((x - y) * cellSize) / 2;
//   const isoY = ((x + y) * cellSize) / 4;

//   ctx.save();
//   ctx.translate(isoX, isoY);

//   // Draw the base of the teleport point
//   ctx.beginPath();
//   ctx.moveTo(0, -cellSize / 4);
//   ctx.lineTo(cellSize / 2, 0);
//   ctx.lineTo(0, cellSize / 4);
//   ctx.lineTo(-cellSize / 2, 0);
//   ctx.closePath();
//   ctx.fillStyle = 'rgba(0, 255, 255, 0.5)'; // Cyan with transparency
//   ctx.fill();

//   // Draw the energy field
//   const time = Date.now() / 1000;
//   const waveHeight = (cellSize / 8) * Math.sin(time * 5);

//   ctx.beginPath();
//   ctx.moveTo(-cellSize / 2, 0);
//   ctx.quadraticCurveTo(0, -waveHeight, cellSize / 2, 0);
//   ctx.quadraticCurveTo(0, cellSize / 4 + waveHeight, -cellSize / 2, 0);
//   ctx.closePath();

//   const gradient = ctx.createLinearGradient(0, -cellSize / 4, 0, cellSize / 4);
//   gradient.addColorStop(0, 'rgba(0, 255, 255, 0.8)');
//   gradient.addColorStop(1, 'rgba(0, 128, 255, 0.4)');
//   ctx.fillStyle = gradient;
//   ctx.fill();

//   // Draw sparkles
//   for (let i = 0; i < 5; i++) {
//     const sparkleX = (Math.random() - 0.5) * cellSize;
//     const sparkleY = ((Math.random() - 0.5) * cellSize) / 2;
//     const sparkleSize = (Math.random() * cellSize) / 10;
//     ctx.beginPath();
//     ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
//     ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.5 + Math.random() * 0.5) + ')';
//     ctx.fill();
//   }

//   ctx.restore();
// };
