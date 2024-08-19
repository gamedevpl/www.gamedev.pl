import { Player } from './gameplay-types';
import { toIsometric } from './isometric-utils';
import { interpolatePosition, calculateVanishingOpacity, calculateVictoryJump } from './animation-utils';
import { renderEntity } from './entity-render';
import { EntityRenderParams } from './entity-render-utils';

export const drawPlayer = (
  ctx: CanvasRenderingContext2D,
  player: Player,
  cellSize: number,
  isInvisible: boolean = false,
) => {
  const { position, previousPosition, moveTimestamp, isVanishing, isVictorious } = player;
  const interpolatedPosition = interpolatePosition(position, previousPosition, moveTimestamp);
  let { x: isoX, y: isoY } = toIsometric(interpolatedPosition.x, interpolatedPosition.y);

  // Apply victory jump if player is victorious
  if (isVictorious) {
    const jumpOffset = calculateVictoryJump(Date.now() - moveTimestamp);
    isoY -= jumpOffset;
  }

  const playerRenderParams: EntityRenderParams = {
    ctx,
    isoX,
    isoY,
    cellSize,
    baseHeight: 0.8,
    widthFactor: 0.6,
    heightAnimationFactor: 0.2,
    bodyColor: '#00FF00', // Bright green
    headColor: '#32CD32', // Lime green
    eyeColor: 'white',
    pupilColor: 'black',
    isInvisible,
  };

  // Apply vanishing effect if player is vanishing
  if (isVanishing) {
    const opacity = calculateVanishingOpacity(Date.now() - moveTimestamp);
    ctx.globalAlpha = opacity;
  }

  renderEntity(playerRenderParams);

  // Reset global alpha
  ctx.globalAlpha = 1;

  // Add additional victory effects
  if (isVictorious) {
    drawVictoryEffects(ctx, isoX, isoY, cellSize);
  }
};

const drawVictoryEffects = (ctx: CanvasRenderingContext2D, x: number, y: number, cellSize: number) => {
  // Draw some celebratory particles or effects around the player
  ctx.save();
  ctx.translate(x, y);

  // Draw multiple particles
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI * 2 * i) / 10;
    const radius = cellSize * (0.5 + Math.sin(Date.now() / 200 + i) * 0.2);
    const particleX = Math.cos(angle) * radius;
    const particleY = Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.arc(particleX, particleY, cellSize * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${(Date.now() / 20 + i * 36) % 360}, 100%, 50%)`;
    ctx.fill();
  }

  ctx.restore();
};
