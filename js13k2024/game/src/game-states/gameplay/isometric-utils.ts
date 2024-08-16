import { Position } from './gameplay-types';

// Constants for isometric tile dimensions
export const TILE_WIDTH = 60;
export const TILE_HEIGHT = 30;

/**
 * Convert grid coordinates to isometric screen coordinates
 * @param x Grid x-coordinate
 * @param y Grid y-coordinate
 * @returns Isometric screen coordinates
 */
export function toIsometric(x: number, y: number): Position {
    return {
        x: (x - y) * TILE_WIDTH / 2,
        y: (x + y) * TILE_HEIGHT / 2
    };
}

/**
 * Convert isometric screen coordinates to grid coordinates
 * @param screenX Isometric screen x-coordinate
 * @param screenY Isometric screen y-coordinate
 * @returns Grid coordinates
 */
export function toGrid(screenX: number, screenY: number): Position {
    const x = (screenX / (TILE_WIDTH / 2) + screenY / (TILE_HEIGHT / 2)) / 2;
    const y = (screenY / (TILE_HEIGHT / 2) - screenX / (TILE_WIDTH / 2)) / 2;
    return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Draw an isometric rectangle
 * @param ctx Canvas rendering context
 * @param x Top-left corner x-coordinate (in grid coordinates)
 * @param y Top-left corner y-coordinate (in grid coordinates)
 * @param width Width of the rectangle (in grid units)
 * @param height Height of the rectangle (in grid units)
 */
export function drawIsometricRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
): void {
    const topLeft = toIsometric(x, y);
    const topRight = toIsometric(x + width, y);
    const bottomRight = toIsometric(x + width, y + height);
    const bottomLeft = toIsometric(x, y + height);

    ctx.beginPath();
    ctx.moveTo(topLeft.x, topLeft.y);
    ctx.lineTo(topRight.x, topRight.y);
    ctx.lineTo(bottomRight.x, bottomRight.y);
    ctx.lineTo(bottomLeft.x, bottomLeft.y);
    ctx.closePath();
}

/**
 * Draw an isometric cube
 * @param ctx Canvas rendering context
 * @param x Base x-coordinate (in grid coordinates)
 * @param y Base y-coordinate (in grid coordinates)
 * @param width Width of the cube (in grid units)
 * @param height Height of the cube (in grid units)
 * @param depth Depth of the cube (in pixels)
 */
export function drawIsometricCube(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number
): void {
    const base = toIsometric(x, y);
    const top = { x: base.x, y: base.y - depth };
    const right = toIsometric(x + width, y);
    const back = toIsometric(x, y + height);

    // Draw top face
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(top.x + (right.x - base.x), top.y + (right.y - base.y));
    ctx.lineTo(top.x + (right.x - base.x) + (back.x - base.x), top.y + (right.y - base.y) + (back.y - base.y));
    ctx.lineTo(top.x + (back.x - base.x), top.y + (back.y - base.y));
    ctx.closePath();

    // Draw right face
    ctx.beginPath();
    ctx.moveTo(right.x, right.y);
    ctx.lineTo(right.x, right.y + depth);
    ctx.lineTo(right.x + (back.x - base.x), right.y + depth + (back.y - base.y));
    ctx.lineTo(right.x + (back.x - base.x), right.y + (back.y - base.y));
    ctx.closePath();

    // Draw left face
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(base.x, base.y - depth);
    ctx.lineTo(base.x + (back.x - base.x), base.y - depth + (back.y - base.y));
    ctx.lineTo(back.x, back.y);
    ctx.closePath();
}

/**
 * Calculate the drawing order for isometric objects
 * @param objects Array of objects with x and y properties
 * @returns Sorted array of objects in the correct drawing order
 */
export function calculateDrawingOrder<T extends Position>(objects: T[]): T[] {
    return objects.sort((a, b) => (a.x + a.y) - (b.x + b.y));
}