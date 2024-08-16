import { Explosion } from './gameplay-types';

export const drawExplosions = (ctx: CanvasRenderingContext2D, explosions: Explosion[], cellSize: number) => {
  ctx.fillStyle = 'rgba(255, 165, 0, 0.7)'; // Semi-transparent orange

  for (const { position } of explosions) {
    const x = position.x * cellSize;
    const y = position.y * cellSize;

    ctx.fillRect(x - cellSize, y - cellSize, cellSize * 3, cellSize * 3);

    // Draw explosion lines
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(x + cellSize / 2, y + cellSize / 2);
      const angle = (Math.PI / 4) * i;
      ctx.lineTo(x + cellSize / 2 + Math.cos(angle) * cellSize, y + cellSize / 2 + Math.sin(angle) * cellSize);
      ctx.stroke();
    }
  }
};