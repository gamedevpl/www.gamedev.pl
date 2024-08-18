import { PLATFORM_HEIGHT } from './game-render';
import { GridSize } from './gameplay-types';
import { TILE_HEIGHT, TILE_WIDTH, toIsometric } from './isometric-utils';

export const drawPlatform = (ctx: CanvasRenderingContext2D, gridSize: GridSize) => {
  const { width, height } = gridSize;
  const topLeft = toIsometric(0, 0);
  const topRight = toIsometric(width, 0);
  const bottomLeft = toIsometric(0, height);
  const bottomRight = toIsometric(width, height);

  // Draw top surface
  ctx.fillStyle = '#c2b280'; // Updated to match the beige color in the image
  ctx.beginPath();
  ctx.moveTo(topLeft.x, topLeft.y);
  ctx.lineTo(topRight.x, topRight.y);
  ctx.lineTo(bottomRight.x, bottomRight.y);
  ctx.lineTo(bottomLeft.x, bottomLeft.y);
  ctx.closePath();
  ctx.fill();

  // Draw right side
  ctx.fillStyle = '#5d4037'; // Updated to match the darkest brown color in the image
  ctx.beginPath();
  ctx.moveTo(bottomRight.x, bottomRight.y);
  ctx.lineTo(bottomRight.x, bottomRight.y + PLATFORM_HEIGHT);
  ctx.lineTo(bottomLeft.x, bottomLeft.y + PLATFORM_HEIGHT);
  ctx.lineTo(bottomLeft.x, bottomLeft.y);
  ctx.closePath();
  ctx.fill();

  // Draw front side
  ctx.fillStyle = '#8d6e63'; // Updated to match the darker brown color in the image
  ctx.beginPath();
  ctx.moveTo(bottomRight.x, bottomRight.y);
  ctx.lineTo(bottomRight.x, bottomRight.y + PLATFORM_HEIGHT);
  ctx.lineTo(topRight.x, topRight.y + PLATFORM_HEIGHT);
  ctx.lineTo(topRight.x, topRight.y);
  ctx.closePath();
  ctx.fill();
};

export const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  ctx.strokeStyle = '#4a4a4a'; // Updated to a darker gray for better visibility
  ctx.lineWidth = 1;

  for (let y = 0; y <= height; y++) {
    for (let x = 0; x <= width; x++) {
      const { x: isoX, y: isoY } = toIsometric(x, y);

      // Draw horizontal line
      if (x < width) {
        ctx.beginPath();
        ctx.moveTo(isoX, isoY);
        ctx.lineTo(isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
        ctx.stroke();
      }

      // Draw vertical line
      if (y < height) {
        ctx.beginPath();
        ctx.moveTo(isoX, isoY);
        ctx.lineTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
        ctx.stroke();
      }
    }
  }
};

// Helper function to draw shadows
export const drawShadow = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
  const SHADOW_OFFSET = 5;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height / 2 + SHADOW_OFFSET, width / 2, height / 4, 0, 0, Math.PI * 2);
  ctx.fill();
};
