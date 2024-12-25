import { GameWorldState, LION_WIDTH, Vector2D } from '../game-world/game-world-types';
import { RenderState } from './render-state';

function drawLion(
  ctx: CanvasRenderingContext2D,
  position: Vector2D,
  direction: Vector2D,
  isMoving: boolean
) {
  const width = LION_WIDTH;
  const height = LION_WIDTH;

  ctx.save();
  
  // Move to lion's position
  ctx.translate(position.x, position.y);

  // Rotate towards movement direction if moving
  if (isMoving && (direction.x !== 0 || direction.y !== 0)) {
    const angle = Math.atan2(direction.y, direction.x);
    ctx.rotate(angle);
  }

  // Draw the lion as a triangle
  ctx.beginPath();
  ctx.moveTo(width / 2, 0); // tip of the triangle
  ctx.lineTo(-width / 2, -height / 2); // bottom left
  ctx.lineTo(-width / 2, height / 2); // bottom right
  ctx.closePath();

  // Color based on movement state
  const intensity = isMoving ? '255' : '200';
  ctx.fillStyle = `rgb(${intensity}, ${intensity}, 0)`;
  ctx.fill();

  // Add outline
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

function drawTarget(ctx: CanvasRenderingContext2D, position: Vector2D) {
  ctx.save();
  
  // Draw target indicator
  ctx.beginPath();
  ctx.arc(position.x, position.y, 5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw crosshair
  const crosshairSize = 10;
  ctx.beginPath();
  ctx.moveTo(position.x - crosshairSize, position.y);
  ctx.lineTo(position.x + crosshairSize, position.y);
  ctx.moveTo(position.x, position.y - crosshairSize);
  ctx.lineTo(position.x, position.y + crosshairSize);
  ctx.stroke();

  ctx.restore();
}

export const renderGame = (
  ctx: CanvasRenderingContext2D,
  world: GameWorldState,
  renderState: RenderState
) => {
  const { viewport } = renderState;
  const { lion } = world;

  // Save the current context state
  ctx.save();

  // Apply viewport translation
  ctx.translate(viewport.x, viewport.y);

  // Draw target position if exists
  if (lion.targetPosition) {
    drawTarget(ctx, lion.targetPosition);
  }

  // Draw the lion
  drawLion(
    ctx,
    lion.position,
    lion.movement.direction,
    lion.movement.isMoving
  );

  // Restore the context state
  ctx.restore();
};