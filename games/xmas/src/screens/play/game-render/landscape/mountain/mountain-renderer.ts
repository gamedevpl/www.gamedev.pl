import { Mountain, MOUNTAIN_COLORS } from './mountain-types';

/**
 * Render a single mountain using pixel art style
 */
function renderMountain(ctx: CanvasRenderingContext2D, mountain: Mountain): void {
  // Begin mountain path
  ctx.beginPath();
  ctx.moveTo(Math.round(mountain.points[0].x), Math.round(mountain.points[0].y));

  // Draw mountain outline with pixel-perfect coordinates
  for (let i = 1; i < mountain.points.length; i++) {
    ctx.lineTo(Math.round(mountain.points[i].x), Math.round(mountain.points[i].y));
  }

  // Close and fill the path
  ctx.closePath();
  ctx.fill();
}

/**
 * Render mountains by layer
 */
export function renderMountains(ctx: CanvasRenderingContext2D, mountains: Mountain[]): void {
  // Sort mountains by layer (back to front)
  const sortedMountains = [...mountains].sort((a, b) => a.layer - b.layer);

  // Group mountains by layer
  const mountainsByLayer = sortedMountains.reduce((acc, mountain) => {
    acc[mountain.layer] = acc[mountain.layer] || [];
    acc[mountain.layer].push(mountain);
    return acc;
  }, {} as Record<number, Mountain[]>);

  // Render each layer with its color
  Object.entries(mountainsByLayer).forEach(([layer, layerMountains]) => {
    const color = Object.values(MOUNTAIN_COLORS)[Number(layer)];
    ctx.fillStyle = color;

    // Render all mountains in this layer
    layerMountains.forEach((mountain) => renderMountain(ctx, mountain));
  });
}