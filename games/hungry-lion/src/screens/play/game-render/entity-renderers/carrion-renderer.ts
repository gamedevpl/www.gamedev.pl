import { CarrionEntity } from '../../game-world/entities-types';

export function drawCarrion(ctx: CanvasRenderingContext2D, carrion: CarrionEntity) {
  const width = 30,
    height = 30;

  ctx.save();
  ctx.translate(carrion.position.x, carrion.position.y);
  ctx.rotate(carrion.direction);

  // Draw body
  ctx.beginPath();
  ctx.rect(-15, -15, 30, 30);
  ctx.closePath();

  ctx.fillStyle = '#808080'; // Gray color
  ctx.fill();

  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw crosses
  ctx.beginPath();
  ctx.moveTo(-width / 4, -height / 4);
  ctx.lineTo(width / 4, height / 4);
  ctx.moveTo(-width / 4, height / 4);
  ctx.lineTo(width / 4, -height / 4);
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}
