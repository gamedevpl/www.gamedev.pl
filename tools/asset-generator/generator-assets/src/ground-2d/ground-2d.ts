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
 * Returns a slightly different shade of the base color with increased contrast
 */
const getColorVariation = (x: number, y: number, baseColor: string, variationAmount: number = 0.15): string => {
  // Parse the base color
  const r = parseInt(baseColor.slice(1, 3), 16);
  const g = parseInt(baseColor.slice(3, 5), 16);
  const b = parseInt(baseColor.slice(5, 7), 16);

  // Get variation values with increased range for more pronounced variation
  const v1 = getPositionalVariation(x, y, 1);
  const v2 = getPositionalVariation(x, y, 2);
  const v3 = getPositionalVariation(x, y, 3);

  // Apply variations with higher contrast
  const rVar = Math.max(0, Math.min(255, Math.round(r + (v1 - 0.5) * 2 * variationAmount * r)));
  const gVar = Math.max(0, Math.min(255, Math.round(g + (v2 - 0.5) * 2 * variationAmount * g)));
  const bVar = Math.max(0, Math.min(255, Math.round(b + (v3 - 0.5) * 2 * variationAmount * b)));

  // Convert back to hex
  return `#${rVar.toString(16).padStart(2, '0')}${gVar.toString(16).padStart(2, '0')}${bVar
    .toString(16)
    .padStart(2, '0')}`;
};
/**
 * Draw cracks in the dry ground based on position
 * More prominent to simulate dry, cracked earth
 */
const drawGroundCracks = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  crackColor: string,
): void => {
  const v1 = getPositionalVariation(x, y, 4);
  const v2 = getPositionalVariation(x, y, 5);

  // Increased probability of drawing cracks (0.5 instead of 0.7)
  // to make cracks more common in dry earth
  if (v1 > 0.5) {
    const startX = x + width * (0.2 + v1 * 0.6);
    const startY = y + height * (0.2 + v2 * 0.6);

    // Increased crack length for more prominent appearance
    const length = Math.min(width, height) * (0.15 + v2 * 0.25);
    const angle = v1 * Math.PI * 2;

    // Draw main crack
    ctx.save();
    ctx.strokeStyle = crackColor;
    ctx.lineWidth = 1.5; // Increased line width for visibility
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + Math.cos(angle) * length, startY + Math.sin(angle) * length);
    ctx.stroke();

    // Add small branching cracks for more realistic appearance
    if (v2 > 0.6) {
      const branchAngle1 = angle + (v1 - 0.5) * Math.PI * 0.5;
      const branchAngle2 = angle - (v1 - 0.5) * Math.PI * 0.5;
      const branchLength = length * 0.6;

      ctx.lineWidth = 1; // Thinner for branch cracks
      ctx.beginPath();
      ctx.moveTo(startX + Math.cos(angle) * (length * 0.5), startY + Math.sin(angle) * (length * 0.5));
      ctx.lineTo(
        startX + Math.cos(angle) * (length * 0.5) + Math.cos(branchAngle1) * branchLength,
        startY + Math.sin(angle) * (length * 0.5) + Math.sin(branchAngle1) * branchLength,
      );
      ctx.stroke();

      // Second branch only sometimes
      if (v1 > 0.7) {
        ctx.beginPath();
        ctx.moveTo(startX + Math.cos(angle) * (length * 0.3), startY + Math.sin(angle) * (length * 0.3));
        ctx.lineTo(
          startX + Math.cos(angle) * (length * 0.3) + Math.cos(branchAngle2) * (branchLength * 0.7),
          startY + Math.sin(angle) * (length * 0.3) + Math.sin(branchAngle2) * (branchLength * 0.7),
        );
        ctx.stroke();
      }
    }

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
 * Draw rocks on the ground instead of simple stones
 * More varied in shape and size to look like natural rocks in dry soil
 */
const drawRocks = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  rockBaseColor: string,
): void => {
  // Generate rocks based on position
  const rockCount = Math.floor(getPositionalVariation(x, y, 6) * 3) + 1;

  for (let i = 0; i < rockCount; i++) {
    const rockX = x + width * getPositionalVariation(x + i, y, 7);
    const rockY = y + height * getPositionalVariation(x, y + i, 8);

    // Vary rock size more significantly for natural appearance
    const rockSize = Math.min(width, height) * (0.015 + getPositionalVariation(x + i, y + i, 9) * 0.035);

    // Generate a rock color that varies more to simulate different minerals
    const rockColor = getColorVariation(rockX, rockY, rockBaseColor, 0.25);

    ctx.save();

    // Draw irregular rock shape instead of perfect circle
    ctx.fillStyle = rockColor;
    ctx.beginPath();

    // Create irregular polygon for rock
    const points = 5 + Math.floor(getPositionalVariation(rockX, rockY, 13) * 3);
    const startAngle = getPositionalVariation(rockX, rockY, 14) * Math.PI * 2;

    for (let p = 0; p < points; p++) {
      const angle = startAngle + (p * Math.PI * 2) / points;
      const pointRadius = rockSize * (0.8 + getPositionalVariation(rockX + p, rockY, 15) * 0.4);

      if (p === 0) {
        ctx.moveTo(rockX + Math.cos(angle) * pointRadius, rockY + Math.sin(angle) * pointRadius);
      } else {
        ctx.lineTo(rockX + Math.cos(angle) * pointRadius, rockY + Math.sin(angle) * pointRadius);
      }
    }

    ctx.closePath();
    ctx.fill();

    // Add subtle shading for 3D effect
    const shadingAngle = Math.PI * 0.75; // Light from top-left
    const shadingSide = ctx.createLinearGradient(
      rockX,
      rockY,
      rockX + Math.cos(shadingAngle) * rockSize * 2,
      rockY + Math.sin(shadingAngle) * rockSize * 2,
    );

    shadingSide.addColorStop(0, 'rgba(0,0,0,0.3)');
    shadingSide.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = shadingSide;
    ctx.fill();

    // Add a subtle highlight to the rock
    const highlightX = rockX - rockSize * 0.3;
    const highlightY = rockY - rockSize * 0.3;
    const highlightSize = rockSize * 0.3;

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.arc(highlightX, highlightY, highlightSize, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
};

/**
 * Draw texture pattern on the ground to simulate soil particles
 */
const drawTexturePattern = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  // Create a more varied texture for dry earth appearance
  const dotDensity = Math.min(width, height) * 0.2; // Increased density

  // Different sizes of soil particles
  const smallDotSize = Math.max(1, Math.min(width, height) * 0.003);
  const mediumDotSize = Math.max(1, Math.min(width, height) * 0.006);

  // Draw small dark specs (soil particles)
  ctx.fillStyle = 'rgba(0,0,0,0.07)';

  for (let i = 0; i < dotDensity; i++) {
    for (let j = 0; j < dotDensity; j++) {
      const dotX = x + (width / dotDensity) * i + getPositionalVariation(x + i, y, 11) * (width / dotDensity);
      const dotY = y + (height / dotDensity) * j + getPositionalVariation(x, y + j, 12) * (height / dotDensity);

      // Use positional variation to determine if we draw a dot here
      const drawDot = getPositionalVariation(x + i, y + j, 10) > 0.4; // Increased probability

      if (drawDot) {
        // Vary the dot size for more natural look
        const dotSize = getPositionalVariation(dotX, dotY, 16) > 0.7 ? mediumDotSize : smallDotSize;

        ctx.beginPath();
        ctx.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Add some lighter specs for sand/dust particles
  ctx.fillStyle = 'rgba(255,255,255,0.05)';

  for (let i = 0; i < dotDensity * 0.7; i++) {
    for (let j = 0; j < dotDensity * 0.7; j++) {
      const dotX =
        x + (width / (dotDensity * 0.7)) * i + getPositionalVariation(x + i + 100, y, 17) * (width / dotDensity);
      const dotY =
        y + (height / (dotDensity * 0.7)) * j + getPositionalVariation(x, y + j + 100, 18) * (height / dotDensity);

      // Less frequent light particles
      const drawLightDot = getPositionalVariation(x + i + 50, y + j + 50, 19) > 0.75;

      if (drawLightDot) {
        ctx.beginPath();
        ctx.arc(dotX, dotY, smallDotSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
};
/**
 * Create subtle height variations to simulate uneven ground
 */
const drawHeightVariation = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  // Create 2-3 subtle elevation changes per tile
  const variationCount = Math.floor(getPositionalVariation(x, y, 20) * 2) + 1;

  for (let i = 0; i < variationCount; i++) {
    // Position of the height variation
    const varX = x + width * getPositionalVariation(x + i * 10, y, 21);
    const varY = y + height * getPositionalVariation(x, y + i * 10, 22);

    // Size of the variation area
    const varSize = Math.min(width, height) * (0.2 + getPositionalVariation(x + i, y + i, 23) * 0.3);

    // Create a subtle gradient for height difference
    const gradient = ctx.createRadialGradient(varX, varY, 0, varX, varY, varSize);

    // Determine if this is a slight elevation or depression
    const isElevated = getPositionalVariation(varX, varY, 24) > 0.5;

    if (isElevated) {
      // Lighter area for slight elevation
      gradient.addColorStop(0, 'rgba(255,255,255,0.07)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      // Darker area for slight depression
      gradient.addColorStop(0, 'rgba(0,0,0,0.07)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(varX, varY, varSize, 0, Math.PI * 2);
    ctx.fill();
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

  render: (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void => {
    // Improved base colors for African dry ground - more reddish and varied
    const baseColor = '#b3865a'; // More reddish brown base for dry African soil
    const detailColor = '#8b5e3c'; // Darker brown for cracks and details
    const highlightColor = 'rgba(255,248,220,0.15)'; // Light cream highlight
    const rockBaseColor = '#6d4c33'; // Darker brown for rocks

    // Add slight soil color variations across the tile for more natural appearance
    const soilVariation = getPositionalVariation(x, y, 25);

    // Choose between different soil types based on position for more varied terrain
    let tileBaseColor;
    if (soilVariation < 0.3) {
      // More reddish soil
      tileBaseColor = getColorVariation(x, y, '#c27749', 0.1);
    } else if (soilVariation < 0.7) {
      // Standard brown soil
      tileBaseColor = getColorVariation(x, y, baseColor, 0.1);
    } else {
      // More grayish soil
      tileBaseColor = getColorVariation(x, y, '#a79078', 0.1);
    }

    // Draw base ground color
    ctx.fillStyle = tileBaseColor;
    ctx.fillRect(x, y, width, height);

    // Add subtle height variations
    drawHeightVariation(ctx, x, y, width, height);

    // Add texture pattern with improved soil appearance
    drawTexturePattern(ctx, x, y, width, height);

    // Add ground cracks - more prominent now for dry earth appearance
    // Use positional variation to determine details
    const crackDensity = 4 + Math.floor(getPositionalVariation(x, y, 13) * 4);

    for (let i = 0; i < crackDensity; i++) {
      // More pronounced cracks with darker color
      drawGroundCracks(ctx, x, y, width, height, getColorVariation(x + i, y + i, detailColor, 0.15));
    }

    // Add rocks instead of simple stones/pebbles
    drawRocks(ctx, x, y, width, height, rockBaseColor);

    // Add edge highlights for subtle depth
    drawEdgeHighlights(ctx, x, y, width, height, highlightColor);
  },
};
