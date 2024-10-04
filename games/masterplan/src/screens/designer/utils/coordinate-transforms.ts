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

/**
 * Clamps a value between a minimum and maximum value.
 * @param value The value to clamp
 * @param min The minimum allowed value
 * @param max The maximum allowed value
 * @returns The clamped value
 */
export const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(value, max));
};

/**
 * Checks if two rectangles intersect.
 * @param rect1 The first rectangle {x, y, width, height}
 * @param rect2 The second rectangle {x, y, width, height}
 * @returns True if the rectangles intersect, false otherwise
 */
export const rectanglesIntersect = (
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number },
): boolean => {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
};

/**
 * Calculates the distance between two points.
 * @param x1 X-coordinate of the first point
 * @param y1 Y-coordinate of the first point
 * @param x2 X-coordinate of the second point
 * @param y2 Y-coordinate of the second point
 * @returns The distance between the two points
 */
export const calculateDistance = (x1: number, y1: number, x2: number, y2: number): number => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
};
