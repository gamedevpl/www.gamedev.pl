import { GameWorldState } from '../world-types';
import { FlagEntity } from '../entities/flag/flag-types';

const FLAG_POLE_WIDTH = 4;
const FLAG_POLE_COLOR = '#8B4513'; // SaddleBrown
const FLAG_WIDTH = 30;
const FLAG_HEIGHT = 20;
const FLAG_COLOR = '#FFFFFF'; // White
const FLAG_BADGE_SIZE = 16;

export function renderFlag(ctx: CanvasRenderingContext2D, flag: FlagEntity, _gameState: GameWorldState): void {
  const { position, tribeBadge } = flag;

  // Draw flag pole
  ctx.save();
  ctx.fillStyle = FLAG_POLE_COLOR;
  ctx.fillRect(position.x - FLAG_POLE_WIDTH / 2, position.y - flag.radius, FLAG_POLE_WIDTH, flag.radius * 2);

  // Draw flag cloth
  ctx.fillStyle = FLAG_COLOR;
  ctx.fillRect(position.x + FLAG_POLE_WIDTH / 2, position.y - flag.radius, FLAG_WIDTH, FLAG_HEIGHT);

  // Draw tribe badge on the flag
  ctx.font = `${FLAG_BADGE_SIZE}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000000'; // Black
  ctx.fillText(
    tribeBadge,
    position.x + FLAG_POLE_WIDTH / 2 + FLAG_WIDTH / 2,
    position.y - flag.radius + FLAG_HEIGHT / 2,
  );

  ctx.restore();
}
