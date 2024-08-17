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
        drawExplosions(ctx, [obj]);
        break;
    }
  }

  // Draw tooltip if there's an active bonus
  const tooltipBonus = gameState.activeBonuses.find(
    (bonus) =>
      bonus.duration === 13 || [BonusType.Builder, BonusType.CapOfInvisibility, BonusType.Crusher].includes(bonus.type),
  );

  if (tooltipBonus) {
    drawTooltip(ctx, gameState.playerPosition, tooltipBonus, cellSize);
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
  ctx.fillStyle = '#c2b280'; // Updated to match the beige color in the image
  ctx.beginPath();
  ctx.moveTo(topLeft.x, topLeft.y);
  ctx.lineTo(topRight.x, topRight.y);
  ctx.lineTo(bottomRight.x, bottomRight.y);
  ctx.lineTo(bottomLeft.x, bottomLeft.y);
  ctx.closePath();
  ctx.fill();

  // Draw right side
  ctx.fillStyle = '#8d6e63'; // Updated to match the darker brown color in the image
  ctx.beginPath();
  ctx.moveTo(bottomRight.x, bottomRight.y);
  ctx.lineTo(bottomRight.x, bottomRight.y + PLATFORM_HEIGHT);
  ctx.lineTo(bottomLeft.x, bottomLeft.y + PLATFORM_HEIGHT);
  ctx.lineTo(bottomLeft.x, bottomLeft.y);
  ctx.closePath();
  ctx.fill();

  // Draw front side
  ctx.fillStyle = '#5d4037'; // Updated to match the darkest brown color in the image
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

// Function to get human-readable bonus descriptions
const getBonusDescription = (bonusType: BonusType): string => {
  switch (bonusType) {
    case BonusType.CapOfInvisibility:
      return "Now you see me, now you don't!";
    case BonusType.ConfusedMonsters:
      return 'Monsters are dizzy!';
    case BonusType.LandMine:
      return 'Boom goes the floor!';
    case BonusType.TimeBomb:
      return "Tick tock, boom o'clock!";
    case BonusType.Crusher:
      return 'Hulk smash!';
    case BonusType.Builder:
      return 'Bob the Builder mode: ON';
    default:
      return 'Mystery power activated!';
  }
};

// Updated function to draw tooltip as a speech bubble with adjusted dimensions and font sizes
const drawTooltip = (
  ctx: CanvasRenderingContext2D,
  playerPosition: Position,
  activeBonus: { type: BonusType; duration: number },
  cellSize: number,
) => {
  ctx.save();
  ctx.globalAlpha = activeBonus.duration === 12 ? 1 : 0.5;
  // Measure description text
  ctx.font = 'bold 16px Arial';

  const { x, y } = toIsometric(playerPosition.x, playerPosition.y);
  const tooltipWidth = ctx.measureText(getBonusDescription(activeBonus.type)).width + 20;
  const tooltipHeight = 70;
  const arrowSize = 15;
  const cornerRadius = 10;

  // Position the tooltip above the player
  const tooltipX = x - tooltipWidth / 2;
  const tooltipY = y - cellSize - tooltipHeight - arrowSize;

  // Draw the speech bubble background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.beginPath();
  ctx.moveTo(tooltipX + cornerRadius, tooltipY);
  ctx.lineTo(tooltipX + tooltipWidth - cornerRadius, tooltipY);
  ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY, tooltipX + tooltipWidth, tooltipY + cornerRadius);
  ctx.lineTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight - cornerRadius);
  ctx.quadraticCurveTo(
    tooltipX + tooltipWidth,
    tooltipY + tooltipHeight,
    tooltipX + tooltipWidth - cornerRadius,
    tooltipY + tooltipHeight,
  );
  ctx.lineTo(tooltipX + tooltipWidth / 2 + arrowSize, tooltipY + tooltipHeight);
  ctx.lineTo(tooltipX + tooltipWidth / 2, tooltipY + tooltipHeight + arrowSize);
  ctx.lineTo(tooltipX + tooltipWidth / 2 - arrowSize, tooltipY + tooltipHeight);
  ctx.lineTo(tooltipX + cornerRadius, tooltipY + tooltipHeight);
  ctx.quadraticCurveTo(tooltipX, tooltipY + tooltipHeight, tooltipX, tooltipY + tooltipHeight - cornerRadius);
  ctx.lineTo(tooltipX, tooltipY + cornerRadius);
  ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX + cornerRadius, tooltipY);
  ctx.closePath();
  ctx.fill();

  // Draw the speech bubble border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw the tooltip text
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.fillText(getBonusDescription(activeBonus.type), tooltipX + tooltipWidth / 2, tooltipY + 30);

  ctx.font = '14px Arial';
  ctx.fillText(`${activeBonus.duration} steps left`, tooltipX + tooltipWidth / 2, tooltipY + 55);
  ctx.restore();
};
