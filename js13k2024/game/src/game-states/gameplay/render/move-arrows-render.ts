import { Position, Direction } from '../gameplay-types';
import { toIsometric } from './isometric-utils';
import { getNewPosition, getOrthogonalDirection } from '../move-utils';

// Updated function to draw move arrows

export const drawMoveArrows = (
  ctx: CanvasRenderingContext2D,
  validMoves: { position: Position; direction: Direction }[],
  gridSize: number,
  cellSize: number,
) => {
  ctx.save();
  ctx.translate(ctx.canvas.width / 2, 100); // Center the isometric view

  validMoves.forEach(({ direction }) => {
    const shape = getArrowShape(gridSize, cellSize, direction);

    // Draw the curved arrow
    ctx.beginPath();
    ctx.moveTo(shape[0].x, shape[0].y);
    ctx.lineTo(shape[1].x, shape[1].y);
    ctx.lineTo(shape[2].x, shape[2].y);
    ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
    ctx.fill();
  });

  ctx.restore();
};

export function getArrowShape(gridSize: number, cellSize: number, direction: Direction) {
  const arrowSize = gridSize / 3;
  const c = getNewPosition({ x: gridSize / 2, y: gridSize / 2 }, direction, gridSize / 1.5);
  const l = getNewPosition(c, getOrthogonalDirection(direction, -1), arrowSize);
  const r = getNewPosition(c, getOrthogonalDirection(direction, 1), arrowSize);
  const cIso = toIsometric(c.x, c.y);
  const startL = toIsometric(l.x, l.y);
  const startR = toIsometric(r.x, r.y);
  const end = getNewPosition(c, direction, arrowSize);
  const endIso = toIsometric(end.x, end.y);
  const angle = Math.atan2(endIso.y - cIso.y, endIso.x - cIso.x);
  const dx = Math.cos(angle) * cellSize;
  const dy = Math.sin(angle) * cellSize;

  return [
    { x: endIso.x + dx, y: endIso.y + dy },
    { x: startL.x + dx, y: startL.y + dy },
    { x: startR.x + dx, y: startR.y + dy },
  ];
}
