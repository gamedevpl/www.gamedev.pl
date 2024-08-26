import { Obstacle, Player } from '../gameplay-types';
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
  isInvisible = false,
  obstacles: Obstacle[] = [],
  isMonster = false,
  hasBlaster = false,
  isClimbing = false,
) => {
  const { position, previousPosition, moveTimestamp, teleportTimestamp, isVanishing, isVictorious } = player;
  const isTeleporting = teleportTimestamp && Date.now() - teleportTimestamp < TELEPORT_ANIMATION_DURATION;

  const interpolatedPosition = isTeleporting
    ? interpolateTeleportPosition(position, previousPosition, teleportTimestamp)
    : interpolatePosition(position, previousPosition, moveTimestamp);
  let { x: isoX, y: isoY } = toIsometric(interpolatedPosition.x, interpolatedPosition.y);

  if (isVictorious) {
    isoY -= calculateVictoryJump(Date.now() - moveTimestamp);
  }

  const isOnObstacle = obstacles.some(
    (obstacle) =>
      obstacle.position.x === Math.round(interpolatedPosition.x) &&
      obstacle.position.y === Math.round(interpolatedPosition.y),
  );
  if (isClimbing || isOnObstacle) {
    if (isOnObstacle) {
      isoY -= cellSize * 0.5;
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
    bodyColor: isClimbing ? '#FFA500' : isMonster ? '#800080' : '#00FF00',
    headColor: isClimbing ? '#FFD700' : isMonster ? '#9932CC' : '#32CD32',
    eyeColor: isMonster ? '#FF0000' : '#FFFFFF',
    pupilColor: '#000000',
    isInvisible,
  };

  if (isVanishing) {
    ctx.globalAlpha = calculateVanishingOpacity(Date.now() - moveTimestamp);
  } else if (isTeleporting) {
    ctx.globalAlpha = calculateTeleportingOpacity(Date.now() - teleportTimestamp);
  }

  const { bounceOffset } = renderEntity(playerRenderParams);

  ctx.globalAlpha = 1;

  if (isVictorious) {
    drawVictoryEffects(ctx, isoX, isoY, cellSize);
  }

  if (isClimbing) {
    drawRopeEffect(ctx, isoX, isoY, cellSize);
  }

  if (isMonster) {
    drawMonsterEffects(ctx, isoX, isoY, cellSize);
  }

  if (hasBlaster) {
    drawGlowEffect(ctx, isoX, isoY, cellSize, bounceOffset);
  }

  if (isTeleporting) {
    drawTeleportationEffect(ctx, isoX, isoY, cellSize, Date.now() - teleportTimestamp);
  }
};

const drawVictoryEffects = (ctx: CanvasRenderingContext2D, x: number, y: number, cellSize: number) => {
  ctx.save();
  ctx.translate(x, y);
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

const drawRopeEffect = (ctx: CanvasRenderingContext2D, x: number, y: number, cellSize: number) => {
  ctx.save();
  ctx.strokeStyle = '#8B4513';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - cellSize * 0.5);
  ctx.lineTo(x, y + cellSize * 0.5);
  ctx.stroke();
  ctx.restore();
};

const drawMonsterEffects = (ctx: CanvasRenderingContext2D, x: number, y: number, cellSize: number) => {
  ctx.save();
  ctx.translate(x, y);
  for (let i = 0; i < 20; i++) {
    const angle = (Math.PI * 2 * i) / 20 + Date.now() / 1000;
    const radius = cellSize * 0.8 * (0.5 + Math.sin(Date.now() / 500 + i) * 0.2);
    const particleX = Math.cos(angle) * radius;
    const particleY = Math.sin(angle) * radius;
    ctx.beginPath();
    ctx.arc(particleX, particleY, cellSize * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = `#800080${Math.floor(128 + Math.sin(Date.now() / 200 + i) * 127).toString(16).padStart(2, '0')}`;
    ctx.fill();
  }
  ctx.restore();
};

const drawGlowEffect = (ctx: CanvasRenderingContext2D, x: number, y: number, cellSize: number, bounceOffset: number) => {
  ctx.save();
  ctx.translate(x, y - bounceOffset);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, cellSize * 0.6);
  gradient.addColorStop(0, '#FFFF00');
  gradient.addColorStop(1, '#FFFF0000');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, cellSize * 0.6, 0, Math.PI * 2);
  ctx.fill();
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
  const radius = maxRadius * (progress < 0.5 ? progress * 2 : (1 - progress) * 2);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  gradient.addColorStop(0, '#00FFFF00');
  gradient.addColorStop(0.7, '#00FFFFB3');
  gradient.addColorStop(1, '#00FFFF00');
  ctx.fillStyle = gradient;
  ctx.fill();
  for (let i = 0; i < 10; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    const particleX = Math.cos(angle) * distance;
    const particleY = Math.sin(angle) * distance;
    const particleSize = cellSize * 0.05 * (progress < 0.5 ? 1 - progress * 2 : (progress - 0.5) * 2);
    ctx.beginPath();
    ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
    ctx.fillStyle = `#00FFFF${Math.floor((progress < 0.5 ? 1 - progress * 2 : (progress - 0.5) * 2) * 255).toString(16).padStart(2, '0')}`;
    ctx.fill();
  }
  ctx.restore();
};