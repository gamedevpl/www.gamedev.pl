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

  if ('targetTimestamp' in projectile) {
    // It's a Missile
    if (projectile.targetTimestamp < worldTimestamp) {
      return;
    }
    renderMissileChemtrail(ctx, projectile, worldTimestamp);
  } else {
    // It's an Interceptor
    renderInterceptorChemtrail(ctx, projectile, worldTimestamp);
  }
}

function renderMissileChemtrail(ctx: CanvasRenderingContext2D, missile: Missile, worldTimestamp: number) {
  const elapsedTime = Math.min(
    Math.max(worldTimestamp - 5, missile.launchTimestamp) - missile.launchTimestamp,
    missile.targetTimestamp - missile.launchTimestamp,
  );
  const missileTravelTime = missile.targetTimestamp - missile.launchTimestamp;
  const progress = missileTravelTime > 0 ? elapsedTime / missileTravelTime : 0;

  const startX = missile.launch.x + (missile.position.x - missile.launch.x) * progress;
  const startY = missile.launch.y + (missile.position.y - missile.launch.y) * progress;
  const startPosition = { x: startX, y: startY };

  const gradient = ctx.createLinearGradient(startPosition.x, startPosition.y, missile.position.x, missile.position.y);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0.5)');

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(startPosition.x, startPosition.y);
  ctx.lineTo(missile.position.x, missile.position.y);
  ctx.stroke();
}

function renderInterceptorChemtrail(ctx: CanvasRenderingContext2D, interceptor: Interceptor, worldTimestamp: number) {
  const tailDuration = 5; // Show 5 seconds of tail
  const tailStartTime = Math.max(worldTimestamp - tailDuration, interceptor.launchTimestamp);

  // Filter tail points within the last 5 seconds
  const relevantTail = interceptor.tail.filter((point) => point.timestamp >= tailStartTime);

  if (relevantTail.length < 2) {
    return;
  }

  ctx.beginPath();
  ctx.moveTo(relevantTail[0].position.x, relevantTail[0].position.y);

  for (let i = 1; i < relevantTail.length; i++) {
    ctx.lineTo(relevantTail[i].position.x, relevantTail[i].position.y);
  }

  // Add the current position to the path
  ctx.lineTo(interceptor.position.x, interceptor.position.y);

  const gradient = ctx.createLinearGradient(
    relevantTail[0].position.x,
    relevantTail[0].position.y,
    interceptor.position.x,
    interceptor.position.y,
  );
  gradient.addColorStop(0, 'rgba(0, 255, 0, 0)');
  gradient.addColorStop(1, 'rgba(0, 255, 0, 0.5)');
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1;
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
