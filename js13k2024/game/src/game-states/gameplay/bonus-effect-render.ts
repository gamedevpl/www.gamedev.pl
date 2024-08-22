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
  if (Date.now() - shot.shotTimestamp > BLASTER_SHOT_DURATION) {
    return;
  }

  const pos = interpolatePosition(shot.endPosition, shot.startPosition, shot.shotTimestamp, BLASTER_SHOT_DURATION);
  const { x: isoX, y: isoY } = toIsometric(pos.x, pos.y);

  ctx.save();

  // Create a glow effect
  ctx.shadowColor = 'rgba(255, 0, 0, 0.8)';
  ctx.shadowBlur = cellSize * 0.2;

  // Set the main color to red
  ctx.fillStyle = 'red';
  ctx.strokeStyle = 'rgba(255, 100, 100, 0.8)';
  ctx.lineWidth = 2;

  const shotLength = cellSize * 0.6; // Elongated shape
  const shotWidth = cellSize * 0.1;

  // Rotate the context based on the shot direction
  ctx.translate(isoX, isoY);
  switch (shot.direction) {
    case Direction.Up:
      ctx.rotate(-Math.PI / 4);
      break;
    case Direction.Down:
      ctx.rotate(Math.PI / 4);
      break;
    case Direction.Left:
      ctx.rotate((-3 * Math.PI) / 4);
      break;
    case Direction.Right:
      ctx.rotate((3 * Math.PI) / 4);
      break;
  }

  // Draw the elongated laser blast
  ctx.beginPath();
  ctx.ellipse(0, 0, shotLength / 2, shotWidth / 2, 0, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();

  // Add a trail effect
  ctx.globalAlpha = 0.5;
  for (let i = 1; i <= 3; i++) {
    ctx.globalAlpha *= 0.5;
    ctx.beginPath();
    ctx.ellipse(-i * shotLength * 0.2, 0, shotLength / (2 + i), shotWidth / (2 + i), 0, 0, 2 * Math.PI);
    ctx.fill();
  }

  ctx.restore();
};
