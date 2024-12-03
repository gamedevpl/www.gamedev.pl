import { ViewportState } from '../../render-state';
import { Star, STARS } from './star-types';

/**
 * Render twinkling stars
 */
export function renderStars(ctx: CanvasRenderingContext2D, stars: Star[], viewport: ViewportState): void {
  ctx.fillStyle = STARS.COLOR;

  for (const star of stars) {
    // Calculate star brightness based on twinkle phase
    const brightness =
      STARS.MIN_BRIGHTNESS + Math.sin(star.twinkle * Math.PI * 2) * (STARS.MAX_BRIGHTNESS - STARS.MIN_BRIGHTNESS);
    ctx.globalAlpha = brightness;

    // Round positions to nearest pixel for crisp rendering
    const x = Math.round(star.x) - viewport.x + STARS.PARALLAX_FACTOR * viewport.x;
    const y = Math.round(star.y) - viewport.y + STARS.PARALLAX_FACTOR * viewport.y;
    const size = Math.round(star.size);

    // Set shadow properties to add glow effect, with blur increasing with star size
    ctx.shadowBlur = size * 2;
    ctx.shadowColor = STARS.COLOR;

    // Draw star with glow effect
    ctx.beginPath();
    const outerRadius = size;
    const innerRadius = size / 2;
    const numPoints = 5;
    for (let i = 0; i <= numPoints * 2; i++) {
      const angle = (i * Math.PI) / numPoints;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const sx = x + radius * Math.sin(angle);
      const sy = y - radius * Math.cos(angle);
      if (i === 0) {
        ctx.moveTo(sx, sy);
      } else {
        ctx.lineTo(sx, sy);
      }
    }
    ctx.closePath();
    ctx.fill();

    // Reset shadow properties after drawing
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  // Reset global alpha
  ctx.globalAlpha = 1;
}
