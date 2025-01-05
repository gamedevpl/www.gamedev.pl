import { LionEntity } from '../../game-world/entities-types';
import { LION_WIDTH } from '../../game-world/game-world-consts';
import { vectorLength } from '../../game-world/math-utils';

export function drawLion(ctx: CanvasRenderingContext2D, lion: LionEntity) {
  const width = LION_WIDTH;
  const height = LION_WIDTH;

  const position = lion.position;
  const isMoving = vectorLength(lion.velocity) > 0;

  ctx.save();
  ctx.translate(position.x, position.y);

  ctx.rotate(lion.direction);

  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(-width / 2, -height / 2);
  ctx.lineTo(-width / 2, height / 2);
  ctx.closePath();

  const intensity = isMoving ? '255' : '200';
  ctx.fillStyle = `rgb(${intensity}, ${intensity}, 0)`;
  ctx.fill();

  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}
