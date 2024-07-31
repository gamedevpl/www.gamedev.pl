import { Missile } from '../world/world-state-types';

export function calculateMissilePosition(missile: Missile, worldTimestamp: number): { x: number; y: number } | null {
  if (missile.launchTimestamp > worldTimestamp || missile.targetTimestamp < worldTimestamp) {
    return null;
  }

  const progress = Math.min(
    Math.max(0, (worldTimestamp - missile.launchTimestamp) / (missile.targetTimestamp - missile.launchTimestamp)),
    1,
  );

  const x = missile.launch.x + (missile.target.x - missile.launch.x) * progress;
  const y = missile.launch.y + (missile.target.y - missile.launch.y) * progress;

  return { x, y };
}

export function renderMissile(ctx: CanvasRenderingContext2D, missile: Missile, worldTimestamp: number) {
  const position = calculateMissilePosition(missile, worldTimestamp);
  if (!position) return;

  ctx.fillStyle = 'rgb(0, 255, 0)';
  ctx.beginPath();
  ctx.arc(position.x, position.y, 1, 0, 2 * Math.PI);
  ctx.fill();
}

export function renderChemtrail(ctx: CanvasRenderingContext2D, missile: Missile, worldTimestamp: number) {
  const startPosition = calculateMissilePosition(missile, missile.launchTimestamp);
  const endPosition = calculateMissilePosition(missile, worldTimestamp);
  if (!startPosition || !endPosition) return;

  const gradient = ctx.createLinearGradient(startPosition.x, startPosition.y, endPosition.x, endPosition.y);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0.5)');

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(startPosition.x, startPosition.y);
  ctx.lineTo(endPosition.x, endPosition.y);
  ctx.stroke();
}
