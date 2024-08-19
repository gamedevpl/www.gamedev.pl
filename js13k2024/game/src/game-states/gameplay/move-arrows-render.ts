import { Position, Direction } from './gameplay-types';
import { toIsometric } from './isometric-utils';
import { getNewPosition, getOrthogonalDirection } from './move-utils';

// Updated function to draw move arrows

export const drawMoveArrows = (
  ctx: CanvasRenderingContext2D,
  validMoves: { position: Position; direction: Direction }[],
  playerPosition: Position,
  cellSize: number,
) => {
  ctx.save();
  ctx.translate(ctx.canvas.width / 2, 100); // Center the isometric view

  validMoves.forEach(({ position: move, direction }) => {
    const shape = getArrowShape(playerPosition, direction, move, cellSize);

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

export function getArrowShape(playerPosition: Position, direction: Direction, move: Position, cellSize: number) {
  const c = { x: playerPosition.x + 0.5, y: playerPosition.y + 0.5 };
  const l = getNewPosition(c, getOrthogonalDirection(direction, -1));
  const r = getNewPosition(c, getOrthogonalDirection(direction, 1));
  const cIso = toIsometric(c.x, c.y);
  const startL = toIsometric(l.x, l.y);
  const startR = toIsometric(r.x, r.y);
  const end = toIsometric(move.x + 0.5, move.y + 0.5);
  const angle = Math.atan2(end.y - cIso.y, end.x - cIso.x);
  const dx = Math.cos(angle) * cellSize;
  const dy = Math.sin(angle) * cellSize;

  return [
    { x: end.x + dx, y: end.y + dy },
    { x: startL.x + dx, y: startL.y + dy },
    { x: startR.x + dx, y: startR.y + dy },
  ];
}
