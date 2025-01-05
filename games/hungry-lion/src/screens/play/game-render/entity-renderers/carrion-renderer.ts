import { CarrionEntity } from '../../game-world/entities/entities-types';

export function drawCarrion(ctx: CanvasRenderingContext2D, carrion: CarrionEntity) {
  const width = 30,
    height = 30;

  // Calculate transparency based on remaining food
  const transparency = carrion.food / 100;

  ctx.save();
  ctx.translate(carrion.position.x, carrion.position.y);
  ctx.rotate(carrion.direction);

  // Draw body
  ctx.beginPath();
  ctx.rect(-15, -15, 30, 30);
  ctx.closePath();

  ctx.fillStyle = `rgba(128, 128, 128, ${transparency})`; // Gray color with transparency
  ctx.fill();

  ctx.strokeStyle = `rgba(0, 0, 0, ${transparency})`;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw crosses
  ctx.beginPath();
  ctx.moveTo(-width / 4, -height / 4);
  ctx.lineTo(width / 4, height / 4);
  ctx.moveTo(-width / 4, height / 4);
  ctx.lineTo(width / 4, -height / 4);
  ctx.strokeStyle = `rgba(0, 0, 0, ${transparency})`;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}
