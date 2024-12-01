import { GAME_WORLD_HEIGHT } from '../../../game-world/game-world-consts';
import { SnowGround, SNOW_GROUND } from './snow-ground-types';
import { ViewportState } from '../../render-state';

/**
 * Apply parallax translation to a point based on viewport position and parallax factor
 * Returns pixel-perfect coordinates for smooth rendering
 */
function applyParallaxTranslation(
  x: number,
  y: number,
  viewport: ViewportState,
  parallaxFactor: number,
): { x: number; y: number } {
  return {
    x: Math.round(x + viewport.x * parallaxFactor),
    y: Math.round(y + viewport.y * parallaxFactor),
  };
}

/**
 * Get color for specific snow ground layer
 */
function getLayerColor(layer: number): string {
  return layer === 0 ? SNOW_GROUND.COLORS.DISTANT : layer === 1 ? SNOW_GROUND.COLORS.MIDDLE : SNOW_GROUND.COLORS.NEAR;
}

/**
 * Render a single snow ground piece using pixel art style with parallax effect
 */
function renderSnowGround(ctx: CanvasRenderingContext2D, ground: SnowGround, viewport: ViewportState): void {
  // Calculate base position with parallax
  const basePosition = applyParallaxTranslation(ground.x, GAME_WORLD_HEIGHT, viewport, ground.parallaxFactor);

  // Calculate dimensions
  const width = Math.round(ground.width);
  const height = Math.round(GAME_WORLD_HEIGHT * 0.025); // 10% of world height for snow ground

  // Draw rectangular snow ground piece
  ctx.beginPath();
  ctx.rect(basePosition.x, basePosition.y - height, width, height);
  ctx.fill();
}

/**
 * Render snow grounds by layer with parallax effect
 */
export function renderSnowGrounds(ctx: CanvasRenderingContext2D, grounds: SnowGround[], viewport: ViewportState): void {
  // Sort grounds by layer (back to front)
  const sortedGrounds = [...grounds].sort((a, b) => a.layer - b.layer);

  // Group grounds by layer for efficient rendering
  const groundsByLayer = sortedGrounds.reduce((acc, ground) => {
    acc[ground.layer] = acc[ground.layer] || [];
    acc[ground.layer].push(ground);
    return acc;
  }, {} as Record<number, SnowGround[]>);

  // Save current context state
  ctx.save();

  // Render each layer with its color
  Object.entries(groundsByLayer).forEach(([layer, layerGrounds]) => {
    // Set layer-specific color
    ctx.fillStyle = getLayerColor(Number(layer));

    // Render all grounds in this layer
    layerGrounds.forEach((ground) => renderSnowGround(ctx, ground, viewport));
  });

  // Restore context state
  ctx.restore();
}
