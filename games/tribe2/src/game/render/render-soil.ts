/**
 * Renders depleted soil patches on the game world.
 * Depleted soil is shown as brown/tan patches on the ground.
 */

import { GameWorldState } from '../world-types';
import { Vector2D } from '../utils/math-types';
import { getDepletedSectorsForRendering } from '../soil-depletion-update';
import {
  SOIL_SECTOR_SIZE,
  SOIL_DEPLETED_COLOR,
  SOIL_DEPLETED_OPACITY_MAX,
  SOIL_DEPLETED_RENDER_THRESHOLD,
  SOIL_HEALTH_MIN,
} from '../soil-depletion-consts';

/**
 * Renders all depleted soil sectors that are visible in the viewport.
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

  // Calculate visible world bounds (with some padding for smooth transitions)
  const padding = SOIL_SECTOR_SIZE * 2;
  const visibleLeft = viewportCenter.x - halfCanvasWidth - padding;
  const visibleRight = viewportCenter.x + halfCanvasWidth + padding;
  const visibleTop = viewportCenter.y - halfCanvasHeight - padding;
  const visibleBottom = viewportCenter.y + halfCanvasHeight + padding;

  ctx.save();

  for (const sector of depletedSectors) {
    // Calculate world position of sector center
    const sectorWorldX = sector.gridX * SOIL_SECTOR_SIZE + SOIL_SECTOR_SIZE / 2;
    const sectorWorldY = sector.gridY * SOIL_SECTOR_SIZE + SOIL_SECTOR_SIZE / 2;

    // Check if sector is visible (accounting for world wrapping)
    const isVisible = isSectorVisible(
      sectorWorldX,
      sectorWorldY,
      visibleLeft,
      visibleRight,
      visibleTop,
      visibleBottom,
      worldWidth,
      worldHeight,
    );

    if (!isVisible) {
      continue;
    }

    // Calculate opacity based on depletion level
    // Lower health = more visible (higher opacity)
    const depletionRatio = 1 - (sector.health / SOIL_DEPLETED_RENDER_THRESHOLD);
    const opacity = Math.min(SOIL_DEPLETED_OPACITY_MAX, depletionRatio * SOIL_DEPLETED_OPACITY_MAX);

    // Render the sector (with world wrapping support)
    renderSectorWithWrapping(
      ctx,
      sectorWorldX,
      sectorWorldY,
      sector.health,
      opacity,
      worldWidth,
      worldHeight,
      viewportCenter,
      halfCanvasWidth,
      halfCanvasHeight,
    );
  }

  ctx.restore();
}

/**
 * Checks if a sector is visible in the viewport (with world wrapping support).
 */
function isSectorVisible(
  sectorX: number,
  sectorY: number,
  visibleLeft: number,
  visibleRight: number,
  visibleTop: number,
  visibleBottom: number,
  worldWidth: number,
  worldHeight: number,
): boolean {
  // Check if sector is visible at its primary position or any wrapped position
  const positions = [
    { x: sectorX, y: sectorY },
    { x: sectorX - worldWidth, y: sectorY },
    { x: sectorX + worldWidth, y: sectorY },
    { x: sectorX, y: sectorY - worldHeight },
    { x: sectorX, y: sectorY + worldHeight },
    { x: sectorX - worldWidth, y: sectorY - worldHeight },
    { x: sectorX + worldWidth, y: sectorY - worldHeight },
    { x: sectorX - worldWidth, y: sectorY + worldHeight },
    { x: sectorX + worldWidth, y: sectorY + worldHeight },
  ];

  for (const pos of positions) {
    if (
      pos.x + SOIL_SECTOR_SIZE / 2 >= visibleLeft &&
      pos.x - SOIL_SECTOR_SIZE / 2 <= visibleRight &&
      pos.y + SOIL_SECTOR_SIZE / 2 >= visibleTop &&
      pos.y - SOIL_SECTOR_SIZE / 2 <= visibleBottom
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Renders a single depleted soil sector with world wrapping support.
 */
function renderSectorWithWrapping(
  ctx: CanvasRenderingContext2D,
  worldX: number,
  worldY: number,
  health: number,
  opacity: number,
  worldWidth: number,
  worldHeight: number,
  viewportCenter: Vector2D,
  halfCanvasWidth: number,
  halfCanvasHeight: number,
): void {
  // Determine which wrapped positions are visible and render there
  const wrappedPositions = getVisibleWrappedPositions(
    worldX,
    worldY,
    worldWidth,
    worldHeight,
    viewportCenter,
    halfCanvasWidth,
    halfCanvasHeight,
  );

  for (const pos of wrappedPositions) {
    renderDepletedSector(ctx, pos.x, pos.y, health, opacity);
  }
}

/**
 * Gets the wrapped positions that are visible for a given world position.
 */
function getVisibleWrappedPositions(
  worldX: number,
  worldY: number,
  worldWidth: number,
  worldHeight: number,
  viewportCenter: Vector2D,
  halfCanvasWidth: number,
  halfCanvasHeight: number,
): Vector2D[] {
  const result: Vector2D[] = [];
  const padding = SOIL_SECTOR_SIZE;

  // Check primary position and all 8 wrapped variations
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

    // Check if this position is within the visible area
    if (
      x >= viewportCenter.x - halfCanvasWidth - padding &&
      x <= viewportCenter.x + halfCanvasWidth + padding &&
      y >= viewportCenter.y - halfCanvasHeight - padding &&
      y <= viewportCenter.y + halfCanvasHeight + padding
    ) {
      result.push({ x, y });
    }
  }

  return result;
}

/**
 * Renders a single depleted soil sector at the given position.
 */
function renderDepletedSector(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  health: number,
  opacity: number,
): void {
  ctx.globalAlpha = opacity;
  
  // Draw the base depleted soil patch
  const halfSize = SOIL_SECTOR_SIZE / 2;
  
  // Create a gradient for more natural look
  const gradient = ctx.createRadialGradient(
    x, y, 0,
    x, y, halfSize * 1.2,
  );
  
  // Use base color for the depleted soil patch
  const baseColor = SOIL_DEPLETED_COLOR;
  
  gradient.addColorStop(0, baseColor);
  gradient.addColorStop(0.6, baseColor);
  gradient.addColorStop(1, 'transparent');
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, halfSize * 1.2, 0, Math.PI * 2);
  ctx.fill();
  
  // Add some visual texture for heavily depleted areas
  if (health < SOIL_HEALTH_MIN + 10) {
    // Draw cracks for severely depleted soil
    ctx.strokeStyle = '#6B5344';
    ctx.lineWidth = 1;
    ctx.globalAlpha = opacity * 0.5;
    
    // Draw simple crack pattern
    const crackLength = halfSize * 0.5;
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + (health % 1) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(
        x + Math.cos(angle) * crackLength,
        y + Math.sin(angle) * crackLength,
      );
      ctx.stroke();
    }
  }
  
  ctx.globalAlpha = 1;
}
