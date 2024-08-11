import { Missile, Interceptor } from '../world/world-state-types';
import { INTERCEPTOR_MAX_RANGE } from '../world/world-state-constants';

export function renderMissile(ctx: CanvasRenderingContext2D, missile: Missile, worldTimestamp: number) {
  if (missile.launchTimestamp > worldTimestamp || missile.targetTimestamp < worldTimestamp) {
    return;
  }

  ctx.fillStyle = 'rgb(255, 0, 0)';
  ctx.beginPath();
  ctx.arc(missile.position.x, missile.position.y, 2, 0, 2 * Math.PI);
  ctx.fill();
}

export function renderInterceptor(ctx: CanvasRenderingContext2D, interceptor: Interceptor) {
  ctx.fillStyle = 'rgb(0, 255, 0)';
  ctx.beginPath();
  ctx.arc(interceptor.position.x, interceptor.position.y, 1, 0, 2 * Math.PI);
  ctx.fill();
}

export function renderChemtrail(
  ctx: CanvasRenderingContext2D,
  projectile: Missile | Interceptor,
  worldTimestamp: number,
) {
  if (projectile.launchTimestamp > worldTimestamp) {
    return;
  }

  let endPosition: { x: number; y: number };

  if ('targetTimestamp' in projectile) {
    // It's a Missile
    if (projectile.targetTimestamp < worldTimestamp) {
      return;
    }
    endPosition = projectile.position;
  } else {
    // It's an Interceptor
    endPosition = projectile.position;
  }

  // Calculate the start position of the chemtrail as the projectile's position 5 seconds ago
  const elapsedTime = Math.min(
    Math.max(worldTimestamp - 5, projectile.launchTimestamp) - projectile.launchTimestamp,
    'targetTimestamp' in projectile ? projectile.targetTimestamp - projectile.launchTimestamp : Infinity,
  );
  const projectileTravelTime =
    'targetTimestamp' in projectile
      ? projectile.targetTimestamp - projectile.launchTimestamp
      : worldTimestamp - projectile.launchTimestamp;
  const progress = projectileTravelTime > 0 ? elapsedTime / projectileTravelTime : 0;

  const startX = projectile.launch.x + (endPosition.x - projectile.launch.x) * progress;
  const startY = projectile.launch.y + (endPosition.y - projectile.launch.y) * progress;
  const startPosition = { x: startX, y: startY };

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

export function renderInterceptorDisintegration(ctx: CanvasRenderingContext2D, interceptor: Interceptor) {
  const distanceTraveled = Math.sqrt(
    Math.pow(interceptor.position.x - interceptor.launch.x, 2) +
      Math.pow(interceptor.position.y - interceptor.launch.y, 2),
  );

  if (distanceTraveled > INTERCEPTOR_MAX_RANGE) {
    const particleCount = 5;
    const particleSize = 1;
    const particleSpread = 3;

    for (let i = 0; i < particleCount; i++) {
      const angle = ((Math.PI * 2) / particleCount) * i;
      const x = interceptor.position.x + Math.cos(angle) * particleSpread;
      const y = interceptor.position.y + Math.sin(angle) * particleSpread;

      ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(x, y, particleSize, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
}
