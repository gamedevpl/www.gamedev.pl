import { SKY_COLORS, SKY_GRADIENT_STOPS } from './sky-types';

/**
 * Render gradient night sky
 */
export function renderSky(ctx: CanvasRenderingContext2D, height: number): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  
  // Add color stops for smooth gradient transition
  gradient.addColorStop(SKY_GRADIENT_STOPS.TOP, SKY_COLORS.TOP);
  gradient.addColorStop(SKY_GRADIENT_STOPS.MIDDLE, SKY_COLORS.MIDDLE);
  gradient.addColorStop(SKY_GRADIENT_STOPS.BOTTOM, SKY_COLORS.BOTTOM);

  // Fill the entire canvas with the gradient
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, ctx.canvas.width, height);
}