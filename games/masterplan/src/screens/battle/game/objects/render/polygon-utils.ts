// polygon-utils.ts

import { Canvas } from '../../../util/canvas';

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Draws a polygon on the canvas.
 * @param canvas The Canvas object to draw on.
 * @param points An array of 2D points representing the polygon vertices.
 * @param fill Whether to fill the polygon (true) or just stroke its outline (false).
 * @param strokeColor The color to use for the polygon's outline (optional).
 */
export function drawPolygon(canvas: Canvas, points: Point2D[], fill: boolean = true, strokeColor?: string) {
  const ctx = canvas.getCtx();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  if (fill) {
    ctx.fill();
  }
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
  }
}
