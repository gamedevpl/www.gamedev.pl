import { PreyState } from '../game-world/prey-types';

export function renderPrey(ctx: CanvasRenderingContext2D, prey: PreyState) {
  ctx.save();
  ctx.translate(prey.position.x, prey.position.y);

  ctx.beginPath();
  ctx.rect(-15, -15, 30, 30);
  ctx.fillStyle = prey.state === 'fleeing' ? 'red' : 'green';
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}
