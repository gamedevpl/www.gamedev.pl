import { Position } from './gameplay-types';
import { toIsometric, TILE_WIDTH, TILE_HEIGHT } from './isometric-utils';
import { drawShadow } from './game-render';

export const drawPlayer = (
  ctx: CanvasRenderingContext2D,
  position: Position,
  cellSize: number,
  isInvisible: boolean = false,
) => {
  const { x: isoX, y: isoY } = toIsometric(position.x, position.y);
  const playerHeight = cellSize * 0.8;
  const playerWidth = TILE_WIDTH * 0.6;

  // Draw shadow
  drawShadow(ctx, isoX - TILE_WIDTH / 2, isoY, TILE_WIDTH, TILE_HEIGHT);

  ctx.save();
  if (isInvisible) {
    ctx.globalAlpha = 0.5;
  }

  // Draw player body
  ctx.fillStyle = '#00FF00'; // Bright green
  ctx.beginPath();
  ctx.moveTo(isoX, isoY - playerHeight);
  ctx.lineTo(isoX + playerWidth / 2, isoY - playerHeight + TILE_HEIGHT / 4);
  ctx.lineTo(isoX, isoY + TILE_HEIGHT / 2);
  ctx.lineTo(isoX - playerWidth / 2, isoY - playerHeight + TILE_HEIGHT / 4);
  ctx.closePath();
  ctx.fill();

  // Draw player head
  const headRadius = cellSize * 0.2;
  ctx.fillStyle = '#32CD32'; // Lime green
  ctx.beginPath();
  ctx.arc(isoX, isoY - playerHeight - headRadius / 2, headRadius, 0, Math.PI * 2);
  ctx.fill();

  // Draw eyes
  const eyeRadius = headRadius * 0.3;
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(isoX - headRadius / 3, isoY - playerHeight - headRadius / 2, eyeRadius, 0, Math.PI * 2);
  ctx.arc(isoX + headRadius / 3, isoY - playerHeight - headRadius / 2, eyeRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'black';
  ctx.beginPath();
  ctx.arc(isoX - headRadius / 3, isoY - playerHeight - headRadius / 2, eyeRadius / 2, 0, Math.PI * 2);
  ctx.arc(isoX + headRadius / 3, isoY - playerHeight - headRadius / 2, eyeRadius / 2, 0, Math.PI * 2);
  ctx.fill();

  // Draw a simple smile
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(isoX, isoY - playerHeight - headRadius / 4, headRadius / 3, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();

  ctx.restore();
};
