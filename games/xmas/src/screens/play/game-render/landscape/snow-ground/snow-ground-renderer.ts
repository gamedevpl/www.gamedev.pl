import { GAME_WORLD_HEIGHT } from '../../../game-world/game-world-consts';
import { SnowGround, SNOW_GROUND } from './snow-ground-types';

/**
 * Render a single snow ground piece using pixel art style
 */
function renderSnowGround(ctx: CanvasRenderingContext2D, ground: SnowGround): void {
  // Calculate screen position
  const screenX = Math.round(ground.x);
  const screenY = Math.round(GAME_WORLD_HEIGHT);

  // Calculate dimensions
  const width = Math.round(ground.width);
  const height = Math.round(GAME_WORLD_HEIGHT * SNOW_GROUND.HEIGHT_RATIO);

  // Draw rectangular snow ground piece
  ctx.beginPath();
  ctx.rect(screenX, screenY - height, width, height);
  ctx.fill();
}

/**
 * Render all snow grounds with uniform appearance
 */
export function renderSnowGrounds(ctx: CanvasRenderingContext2D, grounds: SnowGround[]): void {
  // Save current context state
  ctx.save();

  // Set snow ground color
  ctx.fillStyle = SNOW_GROUND.COLOR;

  // Render all snow ground pieces
  grounds.forEach((ground) => renderSnowGround(ctx, ground));

  // Restore context state
  ctx.restore();
}
