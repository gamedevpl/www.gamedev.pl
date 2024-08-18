import { Position, Direction } from './gameplay-types';
import { toIsometric } from './isometric-utils';

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
