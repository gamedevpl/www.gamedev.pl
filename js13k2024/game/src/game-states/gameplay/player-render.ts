import { Obstacle, Player } from './gameplay-types';
import { toIsometric } from './isometric-utils';
import { interpolatePosition, calculateVanishingOpacity, calculateVictoryJump } from './animation-utils';
import { renderEntity } from './entity-render';
import { EntityRenderParams } from './entity-render-utils';

export const drawPlayer = (
  ctx: CanvasRenderingContext2D,
  player: Player,
  cellSize: number,
  isInvisible: boolean = false,
  obstacles: Obstacle[] = [],
) => {
  const { position, previousPosition, moveTimestamp, isVanishing, isVictorious, isClimbing } = player;
  const interpolatedPosition = interpolatePosition(position, previousPosition, moveTimestamp);
  // eslint-disable-next-line prefer-const
  let { x: isoX, y: isoY } = toIsometric(interpolatedPosition.x, interpolatedPosition.y);

  // Apply victory jump if player is victorious
  if (isVictorious) {
    const jumpOffset = calculateVictoryJump(Date.now() - moveTimestamp);
    isoY -= jumpOffset;
  }

  // Adjust rendering position if the player is climbing
  if (isClimbing) {
    const isOnObstacle = obstacles.some(
      (obstacle) =>
        obstacle.position.x === Math.round(interpolatedPosition.x) &&
        obstacle.position.y === Math.round(interpolatedPosition.y),
    );
    if (isOnObstacle) {
      isoY -= cellSize * 0.5; // Lift the player up by half a cell when on an obstacle
    }
  }

  const playerRenderParams: EntityRenderParams = {
    ctx,
    isoX,
    isoY,
    cellSize,
    baseHeight: 0.8,
    widthFactor: 0.6,
    heightAnimationFactor: 0.2,
    bodyColor: isClimbing ? '#FFA500' : '#00FF00', // Orange when climbing, bright green otherwise
    headColor: isClimbing ? '#FFD700' : '#32CD32', // Gold when climbing, lime green otherwise
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

  // Add visual indicator for climbing ability
  if (isClimbing) {
    drawClimbingIndicator(ctx, isoX, isoY, cellSize);
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

const drawClimbingIndicator = (ctx: CanvasRenderingContext2D, x: number, y: number, cellSize: number) => {
  ctx.save();
  ctx.translate(x, y - cellSize * 0.6); // Position the indicator above the player

  // Draw a small climbing icon or indicator
  const iconSize = cellSize * 0.3;
  ctx.strokeStyle = '#FFD700'; // Gold color
  ctx.lineWidth = 2;

  // Draw a simple ladder icon
  ctx.beginPath();
  ctx.moveTo(-iconSize / 2, -iconSize / 2);
  ctx.lineTo(-iconSize / 2, iconSize / 2);
  ctx.moveTo(iconSize / 2, -iconSize / 2);
  ctx.lineTo(iconSize / 2, iconSize / 2);

  // Draw rungs
  for (let i = 0; i < 3; i++) {
    const y = -iconSize / 2 + (i + 1) * (iconSize / 3);
    ctx.moveTo(-iconSize / 2, y);
    ctx.lineTo(iconSize / 2, y);
  }

  ctx.stroke();

  // Draw a glowing effect
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 5;
  ctx.stroke();

  // Add animation to the climbing indicator
  const bounceOffset = Math.sin(Date.now() / 200) * cellSize * 0.05;
  ctx.translate(0, bounceOffset);
  ctx.stroke();

  ctx.restore();
};