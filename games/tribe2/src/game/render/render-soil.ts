/**
 * Renders depleted soil patches on the game world using 2D metaballs
 * for organic, merged shapes when adjacent sectors are depleted.
 */

import { GameWorldState } from '../world-types';
import { Vector2D } from '../utils/math-types';
import { getDepletedSectorsForRendering } from '../soil-depletion-update';
import {
  SOIL_SECTOR_SIZE,
  SOIL_DEPLETED_COLOR,
  SOIL_DEPLETED_OPACITY_MAX,
  SOIL_DEPLETED_RENDER_THRESHOLD,
  METABALL_THRESHOLD,
  METABALL_RENDER_RESOLUTION,
} from '../soil-depletion-consts';

// Constants for metaball calculations
const MIN_DISTANCE_SQUARED = 0.0001; // Minimum distance squared to avoid division by zero
const CENTER_FIELD_MULTIPLIER = 100; // Field value multiplier when very close to metaball center
const MAX_ALPHA = 255; // Maximum alpha value for pixel rendering

interface MetaballSource {
  x: number;
  y: number;
  radius: number;
  strength: number; // Based on depletion level
}

// Cache for offscreen canvas to avoid creating new canvas every frame
let cachedOffscreenCanvas: HTMLCanvasElement | null = null;
let cachedCanvasWidth = 0;
let cachedCanvasHeight = 0;

/**
 * Gets or creates a cached offscreen canvas for metaball rendering.
 */
function getOffscreenCanvas(width: number, height: number): HTMLCanvasElement {
  if (!cachedOffscreenCanvas || cachedCanvasWidth !== width || cachedCanvasHeight !== height) {
    cachedOffscreenCanvas = document.createElement('canvas');
    cachedOffscreenCanvas.width = width;
    cachedOffscreenCanvas.height = height;
    cachedCanvasWidth = width;
    cachedCanvasHeight = height;
  }
  return cachedOffscreenCanvas;
}

/**
 * Renders all depleted soil sectors using metaballs for organic shapes.
 */
export function renderDepletedSoil(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  viewportCenter: Vector2D,
  canvasDimensions: { width: number; height: number },
): void {
  const depletedSectors = getDepletedSectorsForRendering(
    gameState.soilDepletion,
    SOIL_DEPLETED_RENDER_THRESHOLD,
  );

  if (depletedSectors.length === 0) {
    return;
  }

  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const halfCanvasWidth = canvasDimensions.width / 2;
  const halfCanvasHeight = canvasDimensions.height / 2;

  // Calculate visible world bounds (with padding for metaball influence)
  const padding = SOIL_SECTOR_SIZE * 4;
  const visibleLeft = viewportCenter.x - halfCanvasWidth - padding;
  const visibleRight = viewportCenter.x + halfCanvasWidth + padding;
  const visibleTop = viewportCenter.y - halfCanvasHeight - padding;
  const visibleBottom = viewportCenter.y + halfCanvasHeight + padding;

  // Convert depleted sectors to metaball sources
  const metaballs: MetaballSource[] = [];

  for (const sector of depletedSectors) {
    const sectorWorldX = sector.gridX * SOIL_SECTOR_SIZE + SOIL_SECTOR_SIZE / 2;
    const sectorWorldY = sector.gridY * SOIL_SECTOR_SIZE + SOIL_SECTOR_SIZE / 2;

    // Get all visible wrapped positions for this sector
    const wrappedPositions = getVisibleWrappedPositions(
      sectorWorldX,
      sectorWorldY,
      worldWidth,
      worldHeight,
      visibleLeft,
      visibleRight,
      visibleTop,
      visibleBottom,
    );

    // Calculate strength based on depletion level (0 to 1)
    const depletionRatio = 1 - sector.health / SOIL_DEPLETED_RENDER_THRESHOLD;
    const strength = Math.max(0.1, Math.min(1, depletionRatio));

    for (const pos of wrappedPositions) {
      metaballs.push({
        x: pos.x,
        y: pos.y,
        radius: SOIL_SECTOR_SIZE * 1.2,
        strength: strength,
      });
    }
  }

  if (metaballs.length === 0) {
    return;
  }

  // Render metaballs using pixel-based approach for smooth organic shapes
  renderMetaballs(ctx, metaballs, viewportCenter, canvasDimensions);
}

/**
 * Gets wrapped positions that are within the visible bounds.
 */
function getVisibleWrappedPositions(
  worldX: number,
  worldY: number,
  worldWidth: number,
  worldHeight: number,
  visibleLeft: number,
  visibleRight: number,
  visibleTop: number,
  visibleBottom: number,
): Vector2D[] {
  const result: Vector2D[] = [];
  const checkRadius = SOIL_SECTOR_SIZE * 2;

  const offsets = [
    { dx: 0, dy: 0 },
    { dx: -worldWidth, dy: 0 },
    { dx: worldWidth, dy: 0 },
    { dx: 0, dy: -worldHeight },
    { dx: 0, dy: worldHeight },
    { dx: -worldWidth, dy: -worldHeight },
    { dx: worldWidth, dy: -worldHeight },
    { dx: -worldWidth, dy: worldHeight },
    { dx: worldWidth, dy: worldHeight },
  ];

  for (const offset of offsets) {
    const x = worldX + offset.dx;
    const y = worldY + offset.dy;

    if (
      x + checkRadius >= visibleLeft &&
      x - checkRadius <= visibleRight &&
      y + checkRadius >= visibleTop &&
      y - checkRadius <= visibleBottom
    ) {
      result.push({ x, y });
    }
  }

  return result;
}

/**
 * Calculate the metaball field value at a given point.
 * Uses the classic metaball equation: sum of (radius^2 / distance^2)
 */
function calculateMetaballField(x: number, y: number, metaballs: MetaballSource[]): number {
  let fieldValue = 0;

  for (const ball of metaballs) {
    const dx = x - ball.x;
    const dy = y - ball.y;
    const distSquared = dx * dx + dy * dy;

    if (distSquared < MIN_DISTANCE_SQUARED) {
      // Very close to center, use maximum field contribution to avoid division issues
      fieldValue += ball.strength * CENTER_FIELD_MULTIPLIER;
    } else {
      // Classic metaball formula with strength modifier
      const radiusSquared = ball.radius * ball.radius;
      fieldValue += (ball.strength * radiusSquared) / distSquared;
    }
  }

  return fieldValue;
}

/**
 * Get the average strength of metaballs influencing a point (for opacity calculation).
 */
function getAverageStrength(x: number, y: number, metaballs: MetaballSource[]): number {
  let totalWeight = 0;
  let weightedStrength = 0;

  for (const ball of metaballs) {
    const dx = x - ball.x;
    const dy = y - ball.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const influence = Math.max(0, 1 - dist / (ball.radius * 2));

    if (influence > 0) {
      weightedStrength += ball.strength * influence;
      totalWeight += influence;
    }
  }

  return totalWeight > 0 ? weightedStrength / totalWeight : 0;
}

/**
 * Calculate the alpha value for a pixel based on metaball field value and strength.
 */
function calculatePixelAlpha(fieldValue: number, avgStrength: number): number {
  // Smooth falloff near the edge of the metaball field
  const edgeFactor = Math.min(1, (fieldValue - METABALL_THRESHOLD) / METABALL_THRESHOLD);
  return Math.min(MAX_ALPHA, Math.floor(avgStrength * SOIL_DEPLETED_OPACITY_MAX * edgeFactor * MAX_ALPHA));
}

/**
 * Renders metaballs using a pixel-based approach for smooth organic shapes.
 */
function renderMetaballs(
  ctx: CanvasRenderingContext2D,
  metaballs: MetaballSource[],
  viewportCenter: Vector2D,
  canvasDimensions: { width: number; height: number },
): void {
  const { width, height } = canvasDimensions;
  const resolution = METABALL_RENDER_RESOLUTION;

  const canvasWidth = Math.ceil(width / resolution);
  const canvasHeight = Math.ceil(height / resolution);

  // Get cached offscreen canvas for metaball rendering
  const offscreenCanvas = getOffscreenCanvas(canvasWidth, canvasHeight);
  const offCtx = offscreenCanvas.getContext('2d');

  if (!offCtx) return;

  // Get image data for direct pixel manipulation
  const imageData = offCtx.createImageData(canvasWidth, canvasHeight);
  const data = imageData.data;

  // Parse the depleted color
  const colorMatch = SOIL_DEPLETED_COLOR.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  const r = colorMatch ? parseInt(colorMatch[1], 16) : 139;
  const g = colorMatch ? parseInt(colorMatch[2], 16) : 115;
  const b = colorMatch ? parseInt(colorMatch[3], 16) : 85;

  // Calculate world coordinates for each pixel
  const startWorldX = viewportCenter.x - width / 2;
  const startWorldY = viewportCenter.y - height / 2;

  // Render each pixel
  for (let py = 0; py < canvasHeight; py++) {
    for (let px = 0; px < canvasWidth; px++) {
      const worldX = startWorldX + px * resolution;
      const worldY = startWorldY + py * resolution;

      const fieldValue = calculateMetaballField(worldX, worldY, metaballs);

      if (fieldValue >= METABALL_THRESHOLD) {
        const avgStrength = getAverageStrength(worldX, worldY, metaballs);
        const alpha = calculatePixelAlpha(fieldValue, avgStrength);

        const idx = (py * canvasWidth + px) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = alpha;
      }
    }
  }

  // Put the image data back
  offCtx.putImageData(imageData, 0, 0);

  // Draw the offscreen canvas to the main context, scaled up
  ctx.save();
  
  // Reset transform to draw in screen space
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  
  // Draw with smoothing for softer edges
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(offscreenCanvas, 0, 0, width, height);
  
  ctx.restore();
}
