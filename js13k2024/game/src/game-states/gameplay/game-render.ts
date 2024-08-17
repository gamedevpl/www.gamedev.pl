import { GridSize, BonusType, GameState, Position, Direction } from './gameplay-types';
import { drawObstacles, drawGoal } from './grid-objects-render';
import { drawGrid } from './grid-render';
import { drawPlayer } from './player-render';
import { drawMonsters } from './monster-render';
import { drawBonuses, drawLandMines, drawTimeBombs } from './bonus-render';
import { drawExplosions } from './explosion-render';
import { calculateDrawingOrder, toIsometric } from './isometric-utils';
import { calculateShakeOffset } from './animation-utils';
import { drawTooltip } from './tooltip-render';
import { drawElectricalDischarges } from './discharges-render';
import { drawPlatform } from './grid-render';

export const PLATFORM_HEIGHT = 20;
const SHADOW_OFFSET = 5;

export const drawGameState = (
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  gridSize: GridSize,
  cellSize: number,
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
  drawGrid(ctx, gridSize.width, gridSize.height);

  // Draw electrical discharges
  drawElectricalDischarges(ctx, gridSize, gameState.monsterSpawnSteps, gameState.player.moveTimestamp, cellSize);

  // Prepare all game objects for sorting
  const allObjects = [
    ...gameState.obstacles.map((obj) => ({ position: obj.position, type: 'obstacle', obj } as const)),
    ...gameState.bonuses.map((obj) => ({ position: obj.position, type: 'bonus', obj } as const)),
    ...gameState.landMines.map((obj) => ({ position: obj, type: 'landMine' } as const)),
    ...gameState.timeBombs.map((obj) => ({ position: obj.position, type: 'timeBomb', obj } as const)),
    ...gameState.monsters.map((obj) => ({ position: obj.position, type: 'monster', obj } as const)),
    { position: gameState.player.position, type: 'player', obj: gameState.player } as const,
    { position: gameState.goal, type: 'goal' } as const,
    ...gameState.explosions.map((obj) => ({ position: obj.position, type: 'explosion', obj } as const)),
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

// Helper function to draw shadows
export const drawShadow = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height / 2 + SHADOW_OFFSET, width / 2, height / 4, 0, 0, Math.PI * 2);
  ctx.fill();
};

// Updated function to draw move arrows
export const drawMoveArrows = (
  ctx: CanvasRenderingContext2D,
  validMoves: { position: Position; direction: Direction }[],
  playerPosition: Position,
  cellSize: number,
) => {
  ctx.save();
  ctx.translate(ctx.canvas.width / 2, 100); // Center the isometric view

  validMoves.forEach(({ position: move }) => {
    const start = toIsometric(playerPosition.x + 0.5, playerPosition.y + 0.5);
    const end = toIsometric(move.x + 0.5, move.y + 0.5);

    // Calculate the midpoint for the control point of the curve
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const controlPoint = { x: midX, y: midY - cellSize / 2 }; // Lift the control point up

    // Draw the curved arrow
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(controlPoint.x, controlPoint.y, end.x, end.y);
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.7)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw arrowhead
    const angle = Math.atan2(end.y - controlPoint.y, end.x - controlPoint.x);
    const arrowSize = cellSize / 4;
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - arrowSize * Math.cos(angle - Math.PI / 6), end.y - arrowSize * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(end.x - arrowSize * Math.cos(angle + Math.PI / 6), end.y - arrowSize * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
    ctx.fill();
  });

  ctx.restore();
};
