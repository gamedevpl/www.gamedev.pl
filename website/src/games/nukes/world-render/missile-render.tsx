import { Missile } from '../world/world-state-types';

export function renderMissile(ctx: CanvasRenderingContext2D, missile: Missile, worldTimestamp: number) {
  if (missile.launchTimestamp > worldTimestamp || missile.targetTimestamp < worldTimestamp) {
    return;
  }

  ctx.fillStyle = 'rgb(0, 255, 0)';
  ctx.beginPath();
  ctx.arc(missile.position.x, missile.position.y, 1, 0, 2 * Math.PI);
  ctx.fill();
}

export function renderChemtrail(ctx: CanvasRenderingContext2D, missile: Missile, worldTimestamp: number) {
  if (missile.launchTimestamp > worldTimestamp || missile.targetTimestamp < worldTimestamp) {
    return;
  }

  // Calculate the start position of the chemtrail as the missile's position 5 seconds ago
  const elapsedTime = Math.min(
    Math.max(worldTimestamp - 5, missile.launchTimestamp) - missile.launchTimestamp,
    missile.targetTimestamp - missile.launchTimestamp,
  );
  const missileTravelTime = missile.targetTimestamp - missile.launchTimestamp;
  const progress = elapsedTime / missileTravelTime;

  const startX = missile.launch.x + (missile.target.x - missile.launch.x) * progress;
  const startY = missile.launch.y + (missile.target.y - missile.launch.y) * progress;
  const startPosition = { x: startX, y: startY };

  const endPosition = missile.position;

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
