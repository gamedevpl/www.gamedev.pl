import { GameWorldState, LION_WIDTH, Vector2D } from '../game-world/game-world-types';
import { RenderState } from './render-state';
import { drawGround } from './ground-renderer';
import { renderPrey } from './prey-renderer';

export const renderGame = (ctx: CanvasRenderingContext2D, world: GameWorldState, renderState: RenderState) => {
  const { viewport } = renderState;
  const { lion, prey } = world;

  ctx.save();
  ctx.translate(viewport.x, viewport.y);

  // Draw the ground
  drawGround(ctx, renderState);

  if (lion.targetPosition) {
    drawTarget(ctx, lion.targetPosition);
  }

  drawLion(ctx, lion.position, lion.movement.direction, lion.movement.isMoving);

  // Render all prey entities
  prey.forEach((p) => renderPrey(ctx, p));

  ctx.restore();
};

function drawLion(ctx: CanvasRenderingContext2D, position: Vector2D, direction: Vector2D, isMoving: boolean) {
  const width = LION_WIDTH;
  const height = LION_WIDTH;

  ctx.save();
  ctx.translate(position.x, position.y);

  if (isMoving && (direction.x !== 0 || direction.y !== 0)) {
    const angle = Math.atan2(direction.y, direction.x);
    ctx.rotate(angle);
  }

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

function drawTarget(ctx: CanvasRenderingContext2D, position: Vector2D) {
  ctx.save();

  ctx.beginPath();
  ctx.arc(position.x, position.y, 5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const crosshairSize = 10;
  ctx.beginPath();
  ctx.moveTo(position.x - crosshairSize, position.y);
  ctx.lineTo(position.x + crosshairSize, position.y);
  ctx.moveTo(position.x, position.y - crosshairSize);
  ctx.lineTo(position.x, position.y + crosshairSize);
  ctx.stroke();

  ctx.restore();
}
