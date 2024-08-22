import { PLATFORM_HEIGHT } from '../game-render';
import { TILE_HEIGHT, TILE_WIDTH, toIsometric } from './isometric-utils';
import { GameState } from '../gameplay-types';

export const drawPlatform = (ctx: CanvasRenderingContext2D, gridSize: number) => {
  const topLeft = toIsometric(0, 0);
  const topRight = toIsometric(gridSize, 0);
  const bottomLeft = toIsometric(0, gridSize);
  const bottomRight = toIsometric(gridSize, gridSize);

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

export const drawGrid = (ctx: CanvasRenderingContext2D, gridSize: number, gameState: GameState) => {
  ctx.strokeStyle = '#4a4a4a'; // Updated to a darker gray for better visibility
  ctx.lineWidth = 1;

  for (let y = 0; y <= gridSize; y++) {
    for (let x = 0; x <= gridSize; x++) {
      const { x: isoX, y: isoY } = toIsometric(x, y);

      // Draw horizontal line
      if (x < gridSize) {
        ctx.beginPath();
        ctx.moveTo(isoX, isoY);
        ctx.lineTo(isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
        ctx.stroke();
      }

      // Draw vertical line
      if (y < gridSize) {
        ctx.beginPath();
        ctx.moveTo(isoX, isoY);
        ctx.lineTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
        ctx.stroke();
      }

      // Draw Tsunami effect
      if (gameState.tsunamiLevel > 0) {
        drawTsunamiTile(ctx, x, y, gameState.tsunamiLevel);
      }

      // Draw Slide effect if active
      if (gameState.isSliding) {
        drawSlideTile(ctx, x, y);
      }
    }
  }
};

const drawTsunamiTile = (ctx: CanvasRenderingContext2D, x: number, y: number, tsunamiLevel: number) => {
  const { x: isoX, y: isoY } = toIsometric(x, y);
  const waterHeight = (tsunamiLevel / 13) * TILE_HEIGHT * 0.5; // Max water height is half of tile height

  ctx.fillStyle = `rgba(0, 100, 255, ${tsunamiLevel / 26})`; // Increasing opacity as tsunami level increases
  ctx.beginPath();
  ctx.moveTo(isoX, isoY - waterHeight);
  ctx.lineTo(isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2 - waterHeight);
  ctx.lineTo(isoX, isoY + TILE_HEIGHT - waterHeight);
  ctx.lineTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2 - waterHeight);
  ctx.closePath();
  ctx.fill();

  // Add wave effect
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2 - waterHeight + Math.sin(Date.now() / 200 + x * 0.5) * 3);
  ctx.lineTo(
    isoX + TILE_WIDTH / 2,
    isoY + TILE_HEIGHT / 2 - waterHeight + Math.sin(Date.now() / 200 + (x + 1) * 0.5) * 3,
  );
  ctx.stroke();
};

const drawSlideTile = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  const { x: isoX, y: isoY } = toIsometric(x, y);

  // Draw a subtle ice-like effect
  const gradient = ctx.createLinearGradient(isoX - TILE_WIDTH / 2, isoY, isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT);
  gradient.addColorStop(0, 'rgba(200, 200, 255, 0.2)');
  gradient.addColorStop(0.5, 'rgba(220, 220, 255, 0.3)');
  gradient.addColorStop(1, 'rgba(200, 200, 255, 0.2)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(isoX, isoY);
  ctx.lineTo(isoX + TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
  ctx.lineTo(isoX, isoY + TILE_HEIGHT);
  ctx.lineTo(isoX - TILE_WIDTH / 2, isoY + TILE_HEIGHT / 2);
  ctx.closePath();
  ctx.fill();

  // Add some sparkle effects
  for (let i = 0; i < 3; i++) {
    const sparkleX = isoX + (Math.random() - 0.5) * TILE_WIDTH;
    const sparkleY = isoY + (Math.random() - 0.5) * TILE_HEIGHT;
    const sparkleSize = Math.random() * 2 + 1;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
    ctx.fill();
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
