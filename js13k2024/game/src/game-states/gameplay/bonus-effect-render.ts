import { BLASTER_SHOT_DURATION, interpolatePosition } from './animation-utils';
import { BlasterShot, Direction, GameState, Position } from './gameplay-types';
import { toIsometric } from './isometric-utils';

export const drawTsunamiEffect = (
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  gridSize: number,
  cellSize: number,
) => {
  const { tsunamiLevel } = gameState;
  const maxWaterHeight = cellSize * 0.8; // Maximum water height when tsunamiLevel reaches 13

  ctx.save();
  ctx.globalAlpha = 0.6; // Make the water slightly transparent

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const { x: isoX, y: isoY } = toIsometric(x, y);
      const waterHeight = (tsunamiLevel / 13) * maxWaterHeight;

      ctx.fillStyle = `rgba(0, 100, 255, ${tsunamiLevel / 13})`; // Blue color with increasing opacity
      ctx.beginPath();
      ctx.moveTo(isoX, isoY);
      ctx.lineTo(isoX + cellSize / 2, isoY + cellSize / 4);
      ctx.lineTo(isoX, isoY + cellSize / 2);
      ctx.lineTo(isoX - cellSize / 2, isoY + cellSize / 4);
      ctx.closePath();
      ctx.fill();

      // Add wave effect
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(isoX - cellSize / 2, isoY + cellSize / 4 - waterHeight + Math.sin(Date.now() / 200 + x * 0.5) * 5);
      ctx.lineTo(
        isoX + cellSize / 2,
        isoY + cellSize / 4 - waterHeight + Math.sin(Date.now() / 200 + (x + 1) * 0.5) * 5,
      );
      ctx.stroke();
    }
  }

  ctx.restore();
};

export const drawSlideTrail = (ctx: CanvasRenderingContext2D, start: Position, end: Position) => {
  const { x: startX, y: startY } = toIsometric(start.x, start.y);
  const { x: endX, y: endY } = toIsometric(end.x, end.y);

  ctx.save();
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)'; // Cyan color with transparency
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 5]); // Create a dashed line effect

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  ctx.restore();
};

export const drawBlasterShot = (ctx: CanvasRenderingContext2D, shot: BlasterShot, cellSize: number) => {
  const pos = interpolatePosition(shot.endPosition, shot.startPosition, shot.shotTimestamp, BLASTER_SHOT_DURATION);
  const { x: isoX, y: isoY } = toIsometric(pos.x, pos.y);

  ctx.save();
  ctx.fillStyle = 'yellow';
  ctx.strokeStyle = 'orange';
  ctx.lineWidth = 2;

  const shotSize = cellSize * 0.2;

  ctx.beginPath();
  ctx.arc(isoX, isoY, shotSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Add a directional indicator
  const arrowSize = cellSize * 0.3;
  ctx.beginPath();
  switch (shot.direction) {
    case Direction.Up:
      ctx.moveTo(isoX, isoY - arrowSize);
      ctx.lineTo(isoX - arrowSize / 2, isoY);
      ctx.lineTo(isoX + arrowSize / 2, isoY);
      break;
    case Direction.Down:
      ctx.moveTo(isoX, isoY + arrowSize);
      ctx.lineTo(isoX - arrowSize / 2, isoY);
      ctx.lineTo(isoX + arrowSize / 2, isoY);
      break;
    case Direction.Left:
      ctx.moveTo(isoX - arrowSize, isoY);
      ctx.lineTo(isoX, isoY - arrowSize / 2);
      ctx.lineTo(isoX, isoY + arrowSize / 2);
      break;
    case Direction.Right:
      ctx.moveTo(isoX + arrowSize, isoY);
      ctx.lineTo(isoX, isoY - arrowSize / 2);
      ctx.lineTo(isoX, isoY + arrowSize / 2);
      break;
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
};
