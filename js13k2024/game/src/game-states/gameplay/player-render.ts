import { Obstacle, Player } from './gameplay-types';
import { toIsometric } from './isometric-utils';
import {
  interpolatePosition,
  calculateVanishingOpacity,
  calculateVictoryJump,
  TELEPORT_ANIMATION_DURATION,
  calculateTeleportingOpacity,
  interpolateTeleportPosition,
} from './animation-utils';
import { renderEntity } from './entity-render';
import { EntityRenderParams } from './entity-render-utils';

export const drawPlayer = (
  ctx: CanvasRenderingContext2D,
  player: Player,
  cellSize: number,
  isInvisible: boolean = false,
  obstacles: Obstacle[] = [],
) => {
  const { position, previousPosition, moveTimestamp, teleportTimestamp, isVanishing, isVictorious, isClimbing } =
    player;
  const isTeleporting = teleportTimestamp && Date.now() - teleportTimestamp < TELEPORT_ANIMATION_DURATION;

  const interpolatedPosition = isTeleporting
    ? interpolateTeleportPosition(position, previousPosition, teleportTimestamp)
    : interpolatePosition(position, previousPosition, moveTimestamp);
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
    ctx.globalAlpha = calculateVanishingOpacity(Date.now() - moveTimestamp);
  } else if (isTeleporting) {
    ctx.globalAlpha = calculateTeleportingOpacity(Date.now() - teleportTimestamp);
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

  // Add teleportation effect if the player has just teleported
  if (isTeleporting) {
    drawTeleportationEffect(ctx, isoX, isoY, cellSize, Date.now() - teleportTimestamp);
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

const drawTeleportationEffect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cellSize: number,
  elapsedTime: number,
) => {
  ctx.save();
  ctx.translate(x, y);

  const maxRadius = cellSize * 1.5;
  const progress = elapsedTime / TELEPORT_ANIMATION_DURATION;

  // Vanishing effect (first half of the animation)
  if (progress < 0.5) {
    const vanishProgress = progress * 2; // 0 to 1 over 250ms
    const radius = maxRadius * vanishProgress;

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, 'rgba(0, 255, 255, 0)');
    gradient.addColorStop(0.7, 'rgba(0, 255, 255, 0.7)');
    gradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw particles
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * radius;
      const particleX = Math.cos(angle) * distance;
      const particleY = Math.sin(angle) * distance;
      const particleSize = cellSize * 0.05 * (1 - vanishProgress);

      ctx.beginPath();
      ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 255, 255, ' + (1 - vanishProgress) + ')';
      ctx.fill();
    }
  }
  // Reappearing effect (second half of the animation)
  else {
    const reappearProgress = (progress - 0.5) * 2; // 0 to 1 over 250ms
    const radius = maxRadius * (1 - reappearProgress);

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, 'rgba(0, 255, 255, 0.7)');
    gradient.addColorStop(0.7, 'rgba(0, 255, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw particles
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * maxRadius;
      const particleX = Math.cos(angle) * distance;
      const particleY = Math.sin(angle) * distance;
      const particleSize = cellSize * 0.05 * reappearProgress;

      ctx.beginPath();
      ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 255, 255, ' + reappearProgress + ')';
      ctx.fill();
    }
  }

  ctx.restore();
};
