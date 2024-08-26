import { Explosion } from '../gameplay-types';
import { toIsometric, TILE_WIDTH, TILE_HEIGHT } from './isometric-utils';

export const drawExplosions = (ctx: CanvasRenderingContext2D, explosions: Explosion[]) => {
  ctx.save();
  ctx.globalAlpha = 0.7;

  for (const { position, startTime, duration } of explosions) {
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > duration) continue;

    const progress = elapsedTime / duration;
    const center = toIsometric(position.x + 0.5, position.y + 0.5);
    const radius = TILE_WIDTH * (1 - progress);

    // Draw explosion base
    ctx.fillStyle = '#FF6600';
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Draw explosion particles
    const particleCount = 16;
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const distance = radius * (0.5 + Math.random() * 0.5);
      const particleX = center.x + Math.cos(angle) * distance;
      const particleY = center.y + (Math.sin(angle) * distance) / 2;

      ctx.fillStyle = i % 2 === 0 ? '#FF9933' : '#FF3300';
      ctx.beginPath();
      ctx.arc(
        particleX,
        particleY - Math.random() * TILE_HEIGHT * Math.sqrt(progress),
        TILE_WIDTH / 16 * (1 - progress),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Draw central glow
    const gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius);
    gradient.addColorStop(0, '#FFFF00CC');
    gradient.addColorStop(1, '#FFA50000');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, radius, radius / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};