import { calculateElectricalDischarge } from './animation-utils';
import { GridSize } from './gameplay-types';
import { toIsometric } from './isometric-utils';

// New function to draw electrical discharges
export const drawElectricalDischarges = (
  ctx: CanvasRenderingContext2D,
  gridSize: GridSize,
  spawnSteps: number,
  lastMoveTime: number,
  cellSize: number,
) => {
  const discharges = calculateElectricalDischarge(
    Math.max(gridSize.width, gridSize.height),
    spawnSteps,
    lastMoveTime,
    Date.now(),
  );

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 2;

  for (const discharge of discharges) {
    const start = toIsometric(discharge.position.x, discharge.position.y);
    const end = {
      x: start.x + (Math.random() - 0.5) * cellSize,
      y: start.y + (Math.random() - 0.5) * cellSize,
    };

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
};
