import { Mountain, MOUNTAIN_COLORS } from './mountain-types';
import { ViewportState } from '../../render-state';

/**
 * Apply parallax translation to a point based on viewport position and parallax factor
 * Returns pixel-perfect coordinates for smooth rendering
 */
function applyParallaxTranslation(
  x: number,
  y: number,
  viewport: ViewportState,
  parallaxFactor: number
): { x: number; y: number } {
  return {
    x: Math.round(x + viewport.x * parallaxFactor),
    y: Math.round(y + viewport.y * parallaxFactor)
  };
}

/**
 * Get color for specific mountain layer
 */
function getLayerColor(layer: number): string {
  return layer === 0 
    ? MOUNTAIN_COLORS.DISTANT 
    : layer === 1 
      ? MOUNTAIN_COLORS.MIDDLE 
      : MOUNTAIN_COLORS.NEAR;
}

/**
 * Render a single mountain using pixel art style with parallax effect
 */
function renderMountain(
  ctx: CanvasRenderingContext2D,
  mountain: Mountain,
  viewport: ViewportState
): void {
  // Begin mountain path
  ctx.beginPath();

  // Apply parallax to first point
  const firstPoint = applyParallaxTranslation(
    mountain.points[0].x,
    mountain.points[0].y,
    viewport,
    mountain.parallaxFactor
  );
  ctx.moveTo(firstPoint.x, firstPoint.y);

  // Draw mountain outline with pixel-perfect coordinates and parallax
  for (let i = 1; i < mountain.points.length; i++) {
    const point = applyParallaxTranslation(
      mountain.points[i].x,
      mountain.points[i].y,
      viewport,
      mountain.parallaxFactor
    );
    ctx.lineTo(point.x, point.y);
  }

  // Close and fill the path
  ctx.closePath();
  ctx.fill();
}

/**
 * Render mountains by layer with parallax effect
 */
export function renderMountains(
  ctx: CanvasRenderingContext2D,
  mountains: Mountain[],
  viewport: ViewportState
): void {
  // Sort mountains by layer (back to front)
  const sortedMountains = [...mountains].sort((a, b) => a.layer - b.layer);

  // Group mountains by layer for efficient rendering
  const mountainsByLayer = sortedMountains.reduce((acc, mountain) => {
    acc[mountain.layer] = acc[mountain.layer] || [];
    acc[mountain.layer].push(mountain);
    return acc;
  }, {} as Record<number, Mountain[]>);

  // Save current context state
  ctx.save();

  // Render each layer with its color
  Object.entries(mountainsByLayer).forEach(([layer, layerMountains]) => {
    // Set layer-specific color
    ctx.fillStyle = getLayerColor(Number(layer));

    // Render all mountains in this layer
    layerMountains.forEach((mountain) => renderMountain(ctx, mountain, viewport));
  });

  // Restore context state
  ctx.restore();
}