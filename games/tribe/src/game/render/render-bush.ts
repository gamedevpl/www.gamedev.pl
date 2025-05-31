import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';

const BUSH_RADIUS = 10;
const BERRY_RADIUS = 3;
const BERRY_OFFSET_DISTANCE = BUSH_RADIUS * 0.7;

export function renderBerryBush(ctx: CanvasRenderingContext2D, bush: BerryBushEntity): void {
  const { position, currentBerries, maxBerries } = bush;

  // Draw the main bush circle
  ctx.beginPath();
  ctx.arc(position.x, position.y, BUSH_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#228B22'; // Forest Green
  ctx.fill();
  ctx.strokeStyle = '#006400'; // Dark Green
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw berries around the bush
  if (currentBerries > 0) {
    const angleStep = (Math.PI * 2) / Math.min(currentBerries, maxBerries); // Distribute berries evenly
    for (let i = 0; i < currentBerries; i++) {
      const angle = i * angleStep;
      const berryX = position.x + BERRY_OFFSET_DISTANCE * Math.cos(angle);
      const berryY = position.y + BERRY_OFFSET_DISTANCE * Math.sin(angle);

      ctx.beginPath();
      ctx.arc(berryX, berryY, BERRY_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#FF0000'; // Red
      ctx.fill();
    }
  }

  // Optional: Display age or lifespan for debugging
  // ctx.fillStyle = 'white';
  // ctx.font = '10px Arial';
  // ctx.textAlign = 'center';
  // ctx.fillText(`Age: ${bush.age.toFixed(0)}/${bush.lifespan}`, position.x, position.y - BUSH_RADIUS - 5);
}
