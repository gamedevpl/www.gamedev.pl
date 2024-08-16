import { Explosion } from './gameplay-types';
import { toIsometric, TILE_WIDTH, TILE_HEIGHT } from './isometric-utils';

export const drawExplosions = (ctx: CanvasRenderingContext2D, explosions: Explosion[]) => {
  ctx.save();
  ctx.globalAlpha = 0.7;

  for (const { position } of explosions) {
    const center = toIsometric(position.x + 0.5, position.y + 0.5);
    const leftTop = toIsometric(position.x - 1, position.y - 1);
    const topRight = toIsometric(position.x + 1 * 2, position.y - 1);
    const bottomRight = toIsometric(position.x + 1 * 2, position.y + 1 * 2);
    const bottomLeft = toIsometric(position.x - 1, position.y + 1 * 2);

    // Draw explosion base
    ctx.fillStyle = '#FF6600';
    ctx.beginPath();
    ctx.moveTo(leftTop.x, leftTop.y);
    ctx.lineTo(topRight.x, topRight.y);
    ctx.lineTo(bottomRight.x, bottomRight.y);
    ctx.lineTo(bottomLeft.x, bottomLeft.y);
    ctx.closePath();
    ctx.fill();

    // Draw explosion particles
    const particleCount = 32;
    const radius = TILE_WIDTH;
    for (let i = 0; i < particleCount; i++) {
      const angle = ((Math.PI * 2) / particleCount) * i;
      const randius = radius * Math.random();
      const particleX = center.x + Math.cos(angle) * randius;
      const particleY = center.y + (Math.sin(angle) * randius) / 2; // Flatten Y to maintain isometric look

      ctx.fillStyle = i % 2 === 0 ? '#FF9933' : '#FF3300';
      ctx.beginPath();
      ctx.arc(
        particleX,
        particleY - Math.random() * TILE_HEIGHT * Math.pow(i / particleCount, 0.5),
        TILE_WIDTH / 16,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Draw central glow
    const gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, TILE_WIDTH * 2);
    gradient.addColorStop(0, 'rgba(255, 255, 0, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 165, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, TILE_WIDTH, TILE_HEIGHT, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};
