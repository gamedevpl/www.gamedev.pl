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

/**
 * Applies a transformation matrix to a set of 2D points.
 * @param points The array of 2D points to transform.
 * @param matrix A 3x3 transformation matrix represented as a flat array.
 * @returns An array of transformed 2D points.
 */
export function applyTransformationMatrix(points: Point2D[], matrix: number[]): Point2D[] {
  return points.map((point) => ({
    x: point.x * matrix[0] + point.y * matrix[1] + matrix[2],
    y: point.x * matrix[3] + point.y * matrix[4] + matrix[5],
  }));
}

/**
 * Creates a rotation matrix for 2D transformations.
 * @param angle The rotation angle in radians.
 * @returns A 3x3 rotation matrix represented as a flat array.
 */
export function createRotationMatrix(angle: number): number[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [cos, -sin, 0, sin, cos, 0, 0, 0, 1];
}

/**
 * Creates a scaling matrix for 2D transformations.
 * @param scaleX The scaling factor in the x direction.
 * @param scaleY The scaling factor in the y direction.
 * @returns A 3x3 scaling matrix represented as a flat array.
 */
export function createScalingMatrix(scaleX: number, scaleY: number): number[] {
  return [scaleX, 0, 0, 0, scaleY, 0, 0, 0, 1];
}

/**
 * Creates a translation matrix for 2D transformations.
 * @param dx The translation in the x direction.
 * @param dy The translation in the y direction.
 * @returns A 3x3 translation matrix represented as a flat array.
 */
export function createTranslationMatrix(dx: number, dy: number): number[] {
  return [1, 0, dx, 0, 1, dy, 0, 0, 1];
}

/**
 * Multiplies two 3x3 matrices.
 * @param a The first matrix, represented as a flat array.
 * @param b The second matrix, represented as a flat array.
 * @returns The resulting 3x3 matrix, represented as a flat array.
 */
export function multiplyMatrices(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

/**
 * Applies multiple transformations to a set of 2D points.
 * @param points The array of 2D points to transform.
 * @param transformations An array of transformation matrices.
 * @returns An array of transformed 2D points.
 */
export function applyTransformations(points: Point2D[], transformations: number[][]): Point2D[] {
  const combinedMatrix = transformations.reduce(multiplyMatrices);
  return applyTransformationMatrix(points, combinedMatrix);
}
