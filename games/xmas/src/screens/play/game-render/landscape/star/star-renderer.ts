import { Star, STARS } from './star-types';

/**
 * Render twinkling stars
 */
export function renderStars(ctx: CanvasRenderingContext2D, stars: Star[]): void {
  ctx.fillStyle = STARS.COLOR;

  for (const star of stars) {
    // Calculate star brightness based on twinkle phase
    const brightness = STARS.MIN_BRIGHTNESS + 
      Math.sin(star.twinkle * Math.PI * 2) * 
      (STARS.MAX_BRIGHTNESS - STARS.MIN_BRIGHTNESS);
    ctx.globalAlpha = brightness;

    // Round positions to nearest pixel for crisp rendering
    const x = Math.round(star.x);
    const y = Math.round(star.y);
    const size = Math.round(star.size);

    // Draw star as a small rectangle for pixel art style
    ctx.fillRect(x, y, size, size);
  }

  // Reset global alpha
  ctx.globalAlpha = 1;
}