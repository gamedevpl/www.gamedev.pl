import { Explosion } from '../world/world-state-types';

export function renderExplosion(ctx: CanvasRenderingContext2D, explosion: Explosion, worldTimestamp: number) {
  if (explosion.startTimestamp > worldTimestamp || explosion.endTimestamp < worldTimestamp) {
    return;
  }

  const progress = Math.pow(
    Math.min(
      Math.max(0, (worldTimestamp - explosion.startTimestamp) / (explosion.endTimestamp - explosion.startTimestamp)),
      1,
    ),
    0.15,
  );

  ctx.fillStyle = `rgb(${255 * progress}, ${255 * (1 - progress)}, 0)`;
  ctx.beginPath();
  ctx.arc(explosion.position.x, explosion.position.y, explosion.radius * progress, 0, 2 * Math.PI);
  ctx.fill();
}
