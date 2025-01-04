import { GameWorldState } from '../game-world/game-world-types';
import { RenderState } from './render-state';
import { drawGround } from './ground-renderer';
import { renderPrey } from './prey-renderer';
import { renderDebugInfo } from './debug-renderer';
import { getLions, getPrey } from '../game-world/game-world-query';
import { LionEntity } from '../game-world/entities-types';
import { vectorLength } from '../game-world/math-utils';
import { LION_WIDTH } from '../game-world/game-world-consts';

export const renderGame = (ctx: CanvasRenderingContext2D, world: GameWorldState, renderState: RenderState) => {
  const { viewport } = renderState;

  ctx.save();
  ctx.translate(viewport.x, viewport.y);

  // Draw the ground
  drawGround(ctx, renderState);

  // if (lion.targetPosition) {
  //   drawTarget(ctx, lion.targetPosition);
  // }

  getLions(world).forEach((lion) => drawLion(ctx, lion));

  // Render all prey entities
  getPrey(world).forEach((p) => renderPrey(ctx, p));

  // Render debug information
  renderDebugInfo(ctx, world);

  // Reset the translation
  ctx.restore();
  ctx.save();

  // Render hunger bar
  // renderHungerBar(ctx, world);

  // Render starvation warning if needed
  // if (lion.hunger.isStarving) {
  //   renderStarvationWarning(ctx);
  // }

  ctx.restore();
};

function drawLion(ctx: CanvasRenderingContext2D, lion: LionEntity) {
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

// function drawTarget(ctx: CanvasRenderingContext2D, position: Vector2D) {
//   ctx.save();

//   ctx.beginPath();
//   ctx.arc(position.x, position.y, 5, 0, Math.PI * 2);
//   ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
//   ctx.lineWidth = 2;
//   ctx.stroke();

//   const crosshairSize = 10;
//   ctx.beginPath();
//   ctx.moveTo(position.x - crosshairSize, position.y);
//   ctx.lineTo(position.x + crosshairSize, position.y);
//   ctx.moveTo(position.x, position.y - crosshairSize);
//   ctx.lineTo(position.x, position.y + crosshairSize);
//   ctx.stroke();

//   ctx.restore();
// }

// function renderHungerBar(ctx: CanvasRenderingContext2D, world: GameWorldState) {
//   const { lion } = world;
//   const barWidth = 300;
//   const barHeight = 20;
//   const barX = (ctx.canvas.width - barWidth) / 2;
//   const barY = 20;

//   // Draw background bar
//   ctx.fillStyle = '#444';
//   ctx.fillRect(barX, barY, barWidth, barHeight);

//   // Draw hunger level
//   const hungerWidth = (lion.hunger.level / 100) * barWidth;
//   ctx.fillStyle = lion.hunger.isStarving ? '#ff4444' : '#44ff44';
//   ctx.fillRect(barX, barY, hungerWidth, barHeight);

//   // Draw border
//   ctx.strokeStyle = '#000';
//   ctx.lineWidth = 2;
//   ctx.strokeRect(barX, barY, barWidth, barHeight);

//   // Draw labels
//   ctx.fillStyle = '#fff';
//   ctx.font = '14px Arial';
//   ctx.textAlign = 'center';
//   ctx.fillText('Starving', barX - 40, barY + barHeight / 2 + 5);
//   ctx.fillText('Gluttonous', barX + barWidth + 50, barY + barHeight / 2 + 5);
//   ctx.fillText('Full', barX + barWidth / 2, barY + barHeight / 2 + 5);
// }

// function renderStarvationWarning(ctx: CanvasRenderingContext2D) {
//   const warningText = 'WARNING: Starvation Imminent!';
//   const textX = ctx.canvas.width / 2;
//   const textY = 60;

//   // Draw flashing background
//   const flashIntensity = Math.sin(Date.now() / 200) * 127 + 128;
//   ctx.fillStyle = `rgba(255, 0, 0, ${flashIntensity / 255})`;
//   ctx.fillRect(0, 50, ctx.canvas.width, 30);

//   // Draw warning text
//   ctx.fillStyle = '#fff';
//   ctx.font = 'bold 20px Arial';
//   ctx.textAlign = 'center';
//   ctx.fillText(warningText, textX, textY);
// }
