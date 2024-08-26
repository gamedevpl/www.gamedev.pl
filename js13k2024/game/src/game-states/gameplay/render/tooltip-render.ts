import { Position, BonusType, getBonusDescription } from '../gameplay-types';
import { toIsometric } from './isometric-utils';

export const drawTooltip = (
  ctx: CanvasRenderingContext2D,
  playerPosition: Position,
  activeBonus: { type: BonusType; duration: number },
  cellSize: number,
) => {
  ctx.save();
  ctx.globalAlpha = activeBonus.duration === 12 ? 1 : 0.5;
  ctx.font = 'bold 16px Arial';

  const { x, y } = toIsometric(playerPosition.x, playerPosition.y);
  const description = getBonusDescription(activeBonus.type);
  const tooltipWidth = ctx.measureText(description).width + 20;
  const tooltipHeight = 90;
  const arrowSize = 15;
  const cornerRadius = 10;

  const tooltipX = x - tooltipWidth / 2;
  const tooltipY = y - cellSize - tooltipHeight - arrowSize;

  // Draw speech bubble
  ctx.fillStyle = '#000000E6';
  ctx.beginPath();
  ctx.moveTo(tooltipX + cornerRadius, tooltipY);
  ctx.lineTo(tooltipX + tooltipWidth - cornerRadius, tooltipY);
  ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY, tooltipX + tooltipWidth, tooltipY + cornerRadius);
  ctx.lineTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight - cornerRadius);
  ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight, tooltipX + tooltipWidth - cornerRadius, tooltipY + tooltipHeight);
  ctx.lineTo(tooltipX + tooltipWidth / 2 + arrowSize, tooltipY + tooltipHeight);
  ctx.lineTo(tooltipX + tooltipWidth / 2, tooltipY + tooltipHeight + arrowSize);
  ctx.lineTo(tooltipX + tooltipWidth / 2 - arrowSize, tooltipY + tooltipHeight);
  ctx.lineTo(tooltipX + cornerRadius, tooltipY + tooltipHeight);
  ctx.quadraticCurveTo(tooltipX, tooltipY + tooltipHeight, tooltipX, tooltipY + tooltipHeight - cornerRadius);
  ctx.lineTo(tooltipX, tooltipY + cornerRadius);
  ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX + cornerRadius, tooltipY);
  ctx.closePath();
  ctx.fill();

  // Draw border
  ctx.strokeStyle = '#FFFFFF80';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw text
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText(description, tooltipX + tooltipWidth / 2, tooltipY + 30);

  ctx.font = '14px Arial';
  ctx.fillText(`${activeBonus.duration} steps left`, tooltipX + tooltipWidth / 2, tooltipY + 55);

  ctx.restore();
};