import { SOLDIER_WIDTH, SOLDIER_HEIGHT, GRID_CENTER_X, GRID_CENTER_Y } from '../../battle/consts';

/**
 * Transforms grid coordinates to canvas coordinates.
 * @param col Column in the grid
 * @param row Row in the grid
 * @returns Canvas coordinates {x, y}
 */
export const transformCoordinates = (col: number, row: number): { x: number; y: number } => {
  return {
    x: (col + GRID_CENTER_X) * SOLDIER_WIDTH,
    y: (row + GRID_CENTER_Y) * SOLDIER_HEIGHT,
  };
};

/**
 * Transforms canvas coordinates to grid coordinates.
 * @param x X-coordinate on the canvas
 * @param y Y-coordinate on the canvas
 * @returns Grid coordinates {col, row}
 */
export const inverseTransformCoordinates = (x: number, y: number): { col: number; row: number } => {
  return {
    col: Math.floor(x / SOLDIER_WIDTH) - GRID_CENTER_X,
    row: Math.floor(y / SOLDIER_HEIGHT) - GRID_CENTER_Y,
  };
};
