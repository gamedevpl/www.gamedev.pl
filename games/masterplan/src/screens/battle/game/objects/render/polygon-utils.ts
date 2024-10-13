// polygon-utils.ts

import { Canvas } from '../../../util/canvas';

export interface Point2D {
  x: number;
  y: number;
}

export function drawPolygon(x: number, y: number, canvas: Canvas, points: Point2D[], fill: boolean = true) {
  const ctx = canvas.getCtx();
  ctx.beginPath();
  ctx.moveTo(points[0].x + x, points[0].y + y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x + x, points[i].y + y);
  }
  ctx.closePath();
  if (fill) {
    ctx.fill();
  }
}
