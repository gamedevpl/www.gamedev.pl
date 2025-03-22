import { Asset } from '../../../generator-core/src/assets-types';

/**
 * Helper function to generate a deterministic value based on position
 * This creates consistent variations without using random
 */
const getPositionalVariation = (x: number, y: number, seed: number = 1): number => {
  // Use a simple but effective hash function
  const hash = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return hash - Math.floor(hash);
};

/**
 * Get a color variation based on position
 * Returns a slightly different shade of the base color
 */
const getColorVariation = (x: number, y: number, baseColor: string, variationAmount: number = 0.1): string => {
  // Parse the base color
  const r = parseInt(baseColor.slice(1, 3), 16);
  const g = parseInt(baseColor.slice(3, 5), 16);
  const b = parseInt(baseColor.slice(5, 7), 16);

  // Get variation values
  const v1 = getPositionalVariation(x, y, 1);
  const v2 = getPositionalVariation(x, y, 2);
  const v3 = getPositionalVariation(x, y, 3);

  // Apply variations
  const rVar = Math.max(0, Math.min(255, Math.round(r + (v1 - 0.5) * 2 * variationAmount * r)));
  const gVar = Math.max(0, Math.min(255, Math.round(g + (v2 - 0.5) * 2 * variationAmount * g)));
  const bVar = Math.max(0, Math.min(255, Math.round(b + (v3 - 0.5) * 2 * variationAmount * b)));

  // Convert back to hex
  return `#${rVar.toString(16).padStart(2, '0')}${gVar.toString(16).padStart(2, '0')}${bVar
    .toString(16)
    .padStart(2, '0')}`;
};

/**
 * Draw a crack/detail on the ground based on position
 */
const drawGroundDetail = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  detailColor: string,
): void => {
  const v1 = getPositionalVariation(x, y, 4);
  const v2 = getPositionalVariation(x, y, 5);

  // Only draw details sometimes based on positional variation
  if (v1 > 0.7) {
    const startX = x + width * (0.2 + v1 * 0.6);
    const startY = y + height * (0.2 + v2 * 0.6);
    const length = Math.min(width, height) * (0.1 + v2 * 0.2);
    const angle = v1 * Math.PI * 2;

    ctx.save();
    ctx.strokeStyle = detailColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + Math.cos(angle) * length, startY + Math.sin(angle) * length);
    ctx.stroke();
    ctx.restore();
  }
};
/**
 * Draw edge highlights for the ground tile
 */
const drawEdgeHighlights = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  highlightColor: string,
): void => {
  const edgeWidth = Math.max(1, Math.min(width, height) * 0.03);

  // Top edge highlight (lighter)
  const topGradient = ctx.createLinearGradient(x, y, x, y + edgeWidth * 3);
  topGradient.addColorStop(0, highlightColor);
  topGradient.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = topGradient;
  ctx.fillRect(x, y, width, edgeWidth * 3);

  // Left edge highlight (lighter)
  const leftGradient = ctx.createLinearGradient(x, y, x + edgeWidth * 3, y);
  leftGradient.addColorStop(0, highlightColor);
  leftGradient.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = leftGradient;
  ctx.fillRect(x, y, edgeWidth * 3, height);

  // Bottom and right edges (darker shadow)
  const shadowColor = 'rgba(0,0,0,0.2)';

  // Bottom edge
  const bottomGradient = ctx.createLinearGradient(x, y + height - edgeWidth * 3, x, y + height);
  bottomGradient.addColorStop(0, 'rgba(0,0,0,0)');
  bottomGradient.addColorStop(1, shadowColor);

  ctx.fillStyle = bottomGradient;
  ctx.fillRect(x, y + height - edgeWidth * 3, width, edgeWidth * 3);

  // Right edge
  const rightGradient = ctx.createLinearGradient(x + width - edgeWidth * 3, y, x + width, y);
  rightGradient.addColorStop(0, 'rgba(0,0,0,0)');
  rightGradient.addColorStop(1, shadowColor);

  ctx.fillStyle = rightGradient;
  ctx.fillRect(x + width - edgeWidth * 3, y, edgeWidth * 3, height);
};

/**
 * Draw small stones/pebbles on the ground
 */
const drawStones = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  stoneBaseColor: string,
): void => {
  // Generate a few stones based on position
  const stoneCount = Math.floor(getPositionalVariation(x, y, 6) * 4) + 1;

  for (let i = 0; i < stoneCount; i++) {
    const stoneX = x + width * getPositionalVariation(x + i, y, 7);
    const stoneY = y + height * getPositionalVariation(x, y + i, 8);
    const stoneSize = Math.min(width, height) * (0.01 + getPositionalVariation(x + i, y + i, 9) * 0.02);

    // Vary stone color slightly
    const stoneColor = getColorVariation(stoneX, stoneY, stoneBaseColor, 0.15);

    ctx.fillStyle = stoneColor;
    ctx.beginPath();
    ctx.arc(stoneX, stoneY, stoneSize, 0, Math.PI * 2);
    ctx.fill();

    // Add a small highlight to the stone
    const highlightSize = stoneSize * 0.4;
    const highlightX = stoneX - stoneSize * 0.3;
    const highlightY = stoneY - stoneSize * 0.3;

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(highlightX, highlightY, highlightSize, 0, Math.PI * 2);
    ctx.fill();
  }
};
/**
 * Draw texture pattern on the ground
 */
const drawTexturePattern = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  baseColor: string,
): void => {
  // Create a subtle texture using small dots/specs
  const dotDensity = Math.min(width, height) * 0.15;
  const dotSize = Math.max(1, Math.min(width, height) * 0.005);

  ctx.fillStyle = 'rgba(0,0,0,0.05)';

  for (let i = 0; i < dotDensity; i++) {
    for (let j = 0; j < dotDensity; j++) {
      // Use positional variation to determine if we draw a dot here
      const drawDot = getPositionalVariation(x + i, y + j, 10) > 0.7;

      if (drawDot) {
        const dotX = x + (width / dotDensity) * i + getPositionalVariation(x + i, y, 11) * (width / dotDensity);
        const dotY = y + (height / dotDensity) * j + getPositionalVariation(x, y + j, 12) * (height / dotDensity);

        ctx.beginPath();
        ctx.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
};

/**
 * Ground 2D tile asset implementation
 */
export const Ground2D: Asset = {
  name: 'Ground2D',

  description: `## Ground 2D tile

A simple 2D ground asset.

Pixel art style ground with a flat perspective, pseudo isometric.

The asset is rendered as a tile and is visible from the top.

Rendering can be procedural with variations in texture, details, and edge highlights based on the x, y, width, and height.

It must be simple and efficient to render in a 2D game engine, because it will called many times to fill the ground.

Cannot use random functions, because the asset must be consistent when called multiple times.

There should be no border around the tile, so it can be seamlessly tiled with other tiles.

### Style

Ground in africa when there is no rain, no grass, just a flat ground.

### Stances

- **default**: Default stance, just a ground, not animated.
  `,

  stances: ['default'],

  render: (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    progress: number,
    stance: string,
    direction: 'left' | 'right',
  ): void => {
    // Base colors for African dry ground
    const baseColor = '#c2a378'; // Sandy brown base
    const detailColor = '#a08561'; // Darker brown for cracks and details
    const highlightColor = 'rgba(255,248,220,0.2)'; // Light cream highlight
    const stoneBaseColor = '#8c7354'; // Darker brown for stones

    // Draw base ground color with slight variation based on position
    const tileBaseColor = getColorVariation(x, y, baseColor, 0.05);
    ctx.fillStyle = tileBaseColor;
    ctx.fillRect(x, y, width, height);

    // Add texture pattern
    drawTexturePattern(ctx, x, y, width, height, baseColor);

    // Add some ground details (cracks)
    // Use positional variation to determine details
    const detailDensity = 3 + Math.floor(getPositionalVariation(x, y, 13) * 3);

    for (let i = 0; i < detailDensity; i++) {
      drawGroundDetail(ctx, x, y, width, height, getColorVariation(x + i, y + i, detailColor, 0.1));
    }

    // Add small stones/pebbles
    drawStones(ctx, x, y, width, height, stoneBaseColor);

    // Add edge highlights for subtle depth
    drawEdgeHighlights(ctx, x, y, width, height, highlightColor);
  },
};
