import { Position, BonusType, getBonusDescription } from './gameplay-types';
import { toIsometric } from './isometric-utils';

// Updated function to draw tooltip as a speech bubble with adjusted dimensions and font sizes
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
