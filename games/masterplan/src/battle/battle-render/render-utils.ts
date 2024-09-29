// Utility functions for rendering

import { Position, Unit } from '../battle-state/battle-state-types';

// Function to convert 2D logical grid coordinates to isometric coordinates
export function toIsometric(x: number, y: number): { isoX: number; isoY: number } {
    const isoX = (x - y);
    const isoY = (x + y) / 2;
    return { isoX, isoY };
}

// Function to calculate unit rotation based on movement or target direction
export function calculateRotation(unit: Unit): number {
    // For this example, we'll use a simple calculation based on the unit's position
    // In a real game, you might want to store and use the unit's actual direction or velocity
    const angle = Math.atan2(unit.position.y, unit.position.x);
    return angle;
}

// Function to determine if a position is within the visible area of the canvas
export function isPositionVisible(position: Position, canvas: HTMLCanvasElement): boolean {
    const { isoX, isoY } = toIsometric(position.x, position.y);
    const buffer = 50; // Add a small buffer to render units just off-screen

    return (
        isoX >= -buffer &&
        isoX <= canvas.width + buffer &&
        isoY >= -buffer &&
        isoY <= canvas.height + buffer
    );
}

// Helper function for drawing rounded rectangles
export function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}