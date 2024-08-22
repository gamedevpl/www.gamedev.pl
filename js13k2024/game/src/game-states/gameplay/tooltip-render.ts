import { Position, BonusType, getBonusDescription } from './gameplay-types';
import { toIsometric } from './isometric-utils';

export const drawTooltip = (
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
  const tooltipHeight = 90; // Increased height to accommodate icon
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

  // Draw bonus-specific icon
  drawBonusIcon(ctx, activeBonus.type, tooltipX + tooltipWidth - 30, tooltipY + 25, 20);

  ctx.restore();
};

const drawBonusIcon = (ctx: CanvasRenderingContext2D, bonusType: BonusType, x: number, y: number, size: number) => {
  ctx.save();
  ctx.strokeStyle = '#FFD700'; // Gold color
  ctx.lineWidth = 2;

  switch (bonusType) {
    case BonusType.Climber:
      drawClimberIcon(ctx, x, y, size);
      break;
    case BonusType.Tsunami:
      drawTsunamiIcon(ctx, x, y, size);
      break;
    case BonusType.Monster:
      drawMonsterIcon(ctx, x, y, size);
      break;
    case BonusType.Slide:
      drawSlideIcon(ctx, x, y, size);
      break;
    case BonusType.Sokoban:
      drawSokobanIcon(ctx, x, y, size);
      break;
    case BonusType.Blaster:
      drawBlasterIcon(ctx, x, y, size);
      break;
    // Add other bonus types here
    default:
      drawDefaultIcon(ctx, x, y, size);
  }

  ctx.restore();
};

const drawClimberIcon = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  // Draw a simple ladder icon
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + size);
  ctx.moveTo(x + size, y);
  ctx.lineTo(x + size, y + size);

  // Draw rungs
  for (let i = 0; i < 3; i++) {
    const rungY = y + (i + 1) * (size / 3);
    ctx.moveTo(x, rungY);
    ctx.lineTo(x + size, rungY);
  }

  ctx.stroke();
};

const drawTsunamiIcon = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  ctx.beginPath();
  ctx.moveTo(x, y + size);
  ctx.quadraticCurveTo(x + size / 4, y, x + size / 2, y + size / 2);
  ctx.quadraticCurveTo(x + size * 3 / 4, y + size, x + size, y);
  ctx.stroke();

  ctx.fillStyle = 'rgba(0, 100, 255, 0.5)';
  ctx.fill();
};

const drawMonsterIcon = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  // Draw monster body
  ctx.fillStyle = '#800080';
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 3, 0, Math.PI * 2);
  ctx.fill();

  // Draw eyes
  ctx.fillStyle = 'red';
  ctx.beginPath();
  ctx.arc(x + size / 3, y + size / 3, size / 10, 0, Math.PI * 2);
  ctx.arc(x + size * 2 / 3, y + size / 3, size / 10, 0, Math.PI * 2);
  ctx.fill();
};

const drawSlideIcon = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  ctx.beginPath();
  ctx.moveTo(x, y + size);
  ctx.quadraticCurveTo(x + size / 2, y, x + size, y + size);
  ctx.stroke();

  // Add some "ice" particles
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = 'rgba(200, 200, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(x + Math.random() * size, y + Math.random() * size, size / 10, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawSokobanIcon = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  // Draw a box
  ctx.strokeRect(x + size / 4, y + size / 4, size / 2, size / 2);

  // Draw an arrow indicating movement
  ctx.beginPath();
  ctx.moveTo(x, y + size / 2);
  ctx.lineTo(x + size, y + size / 2);
  ctx.lineTo(x + size * 3 / 4, y + size / 4);
  ctx.moveTo(x + size, y + size / 2);
  ctx.lineTo(x + size * 3 / 4, y + size * 3 / 4);
  ctx.stroke();
};

const drawBlasterIcon = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  // Draw blaster body
  ctx.fillStyle = '#808080';
  ctx.fillRect(x, y + size / 3, size * 2 / 3, size / 3);

  // Draw blaster nozzle
  ctx.beginPath();
  ctx.arc(x + size * 2 / 3, y + size / 2, size / 6, 0, Math.PI * 2);
  ctx.fill();

  // Draw "laser" beam
  ctx.strokeStyle = 'red';
  ctx.setLineDash([size / 10, size / 20]);
  ctx.beginPath();
  ctx.moveTo(x + size * 2 / 3, y + size / 2);
  ctx.lineTo(x + size, y + size / 2);
  ctx.stroke();
  ctx.setLineDash([]);
};

const drawDefaultIcon = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillText('?', x + size / 2, y + size / 2 + 5);
};