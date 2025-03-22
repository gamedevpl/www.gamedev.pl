import { HUNGER_CRITICAL_THRESHOLD } from '../entity-renderers/lion-renderer';

/**
 * Draws a hunger warning bubble above the lion
 * @param ctx Canvas rendering context
 * @param x X position of the lion
 * @param y Y position of the lion
 * @param hungerLevel Current hunger level of the lion
 */
export function drawHungerWarningBubble(ctx: CanvasRenderingContext2D, x: number, y: number, hungerLevel: number) {
  // Calculate bubble position (above the lion)
  const bubbleX = x;
  const bubbleY = y - 50; // Position above the lion

  // Determine message and color based on hunger level
  let message = 'Hungry!';
  let baseColor = 'rgba(255, 255, 0, '; // Yellow for warning

  if (hungerLevel < HUNGER_CRITICAL_THRESHOLD) {
    message = 'Starving!';
    baseColor = 'rgba(255, 0, 0, '; // Red for critical
  }

  // Create flashing effect using sine wave
  const time = Date.now() / 500; // Control flash speed
  const alpha = 0.5 + 0.5 * Math.sin(time); // Alpha varies between 0.5 and 1
  const color = baseColor + alpha + ')';

  // Draw speech bubble
  ctx.save();

  // Draw bubble
  ctx.fillStyle = color;
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;

  // Bubble shape
  const bubbleWidth = 80;
  const bubbleHeight = 30;
  const bubbleRadius = 10;

  // Rounded rectangle for bubble
  ctx.beginPath();
  ctx.moveTo(bubbleX - bubbleWidth / 2 + bubbleRadius, bubbleY - bubbleHeight / 2);
  ctx.lineTo(bubbleX + bubbleWidth / 2 - bubbleRadius, bubbleY - bubbleHeight / 2);
  ctx.quadraticCurveTo(
    bubbleX + bubbleWidth / 2,
    bubbleY - bubbleHeight / 2,
    bubbleX + bubbleWidth / 2,
    bubbleY - bubbleHeight / 2 + bubbleRadius,
  );
  ctx.lineTo(bubbleX + bubbleWidth / 2, bubbleY + bubbleHeight / 2 - bubbleRadius);
  ctx.quadraticCurveTo(
    bubbleX + bubbleWidth / 2,
    bubbleY + bubbleHeight / 2,
    bubbleX + bubbleWidth / 2 - bubbleRadius,
    bubbleY + bubbleHeight / 2,
  );
  ctx.lineTo(bubbleX - bubbleWidth / 2 + bubbleRadius, bubbleY + bubbleHeight / 2);
  ctx.quadraticCurveTo(
    bubbleX - bubbleWidth / 2,
    bubbleY + bubbleHeight / 2,
    bubbleX - bubbleWidth / 2,
    bubbleY + bubbleHeight / 2 - bubbleRadius,
  );
  ctx.lineTo(bubbleX - bubbleWidth / 2, bubbleY - bubbleHeight / 2 + bubbleRadius);
  ctx.quadraticCurveTo(
    bubbleX - bubbleWidth / 2,
    bubbleY - bubbleHeight / 2,
    bubbleX - bubbleWidth / 2 + bubbleRadius,
    bubbleY - bubbleHeight / 2,
  );
  ctx.closePath();

  // Draw pointer to lion
  ctx.moveTo(bubbleX - 10, bubbleY + bubbleHeight / 2);
  ctx.lineTo(bubbleX, bubbleY + bubbleHeight / 2 + 10);
  ctx.lineTo(bubbleX + 10, bubbleY + bubbleHeight / 2);

  ctx.fill();
  ctx.stroke();

  // Draw text
  ctx.fillStyle = 'black';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, bubbleX, bubbleY);

  ctx.restore();
}
