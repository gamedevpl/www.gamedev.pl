import { ArrowEntity } from '../entities/arrow/arrow-types';

/**
 * Renders an arrow entity on the canvas.
 * Flying arrows are rendered based on velocity, embedded arrows are static.
 */
export function renderArrow(ctx: CanvasRenderingContext2D, arrow: ArrowEntity): void {
  ctx.save();

  if (arrow.isEmbedded) {
    // Embedded arrow - draw as short static line
    renderEmbeddedArrow(ctx, arrow);
  } else {
    // Flying arrow - draw based on velocity
    renderFlyingArrow(ctx, arrow);
  }

  ctx.restore();
}

function renderEmbeddedArrow(ctx: CanvasRenderingContext2D, arrow: ArrowEntity): void {
  const shaftLength = 6;
  const arrowheadSize = 4;

  // Draw shaft
  ctx.beginPath();
  ctx.moveTo(arrow.position.x, arrow.position.y);
  ctx.lineTo(arrow.position.x - shaftLength, arrow.position.y);
  ctx.strokeStyle = '#8B4513'; // Dark brown
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw arrowhead
  ctx.beginPath();
  ctx.moveTo(arrow.position.x, arrow.position.y);
  ctx.lineTo(arrow.position.x - arrowheadSize, arrow.position.y - arrowheadSize / 2);
  ctx.lineTo(arrow.position.x - arrowheadSize, arrow.position.y + arrowheadSize / 2);
  ctx.closePath();
  ctx.fillStyle = '#654321';
  ctx.fill();
}

function renderFlyingArrow(ctx: CanvasRenderingContext2D, arrow: ArrowEntity): void {
  // Calculate angle from velocity
  const angle = Math.atan2(arrow.vy, arrow.vx);

  // Calculate line length based on speed
  const speed = Math.sqrt(arrow.vx * arrow.vx + arrow.vy * arrow.vy);
  const shaftLength = Math.max(8, Math.min(15, speed * 0.15));
  const arrowheadSize = 4;

  // Adjust opacity based on height (vz)
  const opacity = arrow.vz > 3 ? 0.7 : 1.0;

  // Draw shadow if arrow is high
  if (arrow.vz > 2) {
    const shadowOffset = Math.min(arrow.vz * 2, 10);
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.translate(arrow.position.x, arrow.position.y + shadowOffset);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(-shaftLength, 0);
    ctx.lineTo(0, 0);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  // Choose color based on height
  const color = arrow.vz > 3 ? '#A0522D' : '#654321';

  ctx.globalAlpha = opacity;
  ctx.translate(arrow.position.x, arrow.position.y);
  ctx.rotate(angle);

  // Draw shaft
  ctx.beginPath();
  ctx.moveTo(-shaftLength, 0);
  ctx.lineTo(0, 0);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw arrowhead
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-arrowheadSize, -arrowheadSize / 2);
  ctx.lineTo(-arrowheadSize, arrowheadSize / 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
