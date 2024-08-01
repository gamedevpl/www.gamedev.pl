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

  const startPosition = missile.launch;
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
