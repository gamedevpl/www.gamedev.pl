/**
 * Renders depleted soil patches on the game world.
 * Uses a grid-based approach with border rendering for organic shapes.
 */

import { GameWorldState } from '../world-types';
import { Vector2D } from '../utils/math-types';
import { getDepletedSectorsForRendering } from '../soil-depletion-update';
import {
  SOIL_SECTOR_SIZE,
  SOIL_DEPLETED_COLOR,
  SOIL_DEPLETED_BORDER_COLOR,
  SOIL_DEPLETED_OPACITY,
  SOIL_DEPLETED_RENDER_THRESHOLD,
  SOIL_VISIBLE_DEPLETION_THRESHOLD,
} from '../soil-depletion-consts';

// Cache for visible sectors to avoid recalculating every frame
let cachedSectorsHash = '';
let cachedSectorSet: Set<string> | null = null;

/**
 * Creates a hash key for a set of sectors
 */
function createSectorsHash(sectors: Array<{ gridX: number; gridY: number; health: number }>): string {
  return sectors.map(s => `${s.gridX},${s.gridY},${Math.floor(s.health)}`).join('|');
}

/**
 * Creates a set of sector keys for quick lookup
 */
function createSectorSet(sectors: Array<{ gridX: number; gridY: number }>): Set<string> {
  const set = new Set<string>();
  for (const s of sectors) {
    set.add(`${s.gridX},${s.gridY}`);
  }
  return set;
}

/**
 * Checks if a neighboring sector is also depleted
 */
function hasDepletedNeighbor(
  sectorSet: Set<string>,
  gridX: number,
  gridY: number,
  dx: number,
  dy: number,
  maxGridX: number,
  maxGridY: number,
): boolean {
  const nx = ((gridX + dx) % maxGridX + maxGridX) % maxGridX;
  const ny = ((gridY + dy) % maxGridY + maxGridY) % maxGridY;
  return sectorSet.has(`${nx},${ny}`);
}

/**
 * Renders all depleted soil sectors with clear borders.
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
  const maxGridX = Math.ceil(worldWidth / SOIL_SECTOR_SIZE);
  const maxGridY = Math.ceil(worldHeight / SOIL_SECTOR_SIZE);

  // Update sector set cache if needed
  const sectorsHash = createSectorsHash(depletedSectors);
  if (sectorsHash !== cachedSectorsHash) {
    cachedSectorsHash = sectorsHash;
    cachedSectorSet = createSectorSet(depletedSectors);
  }
  const sectorSet = cachedSectorSet!;

  // Calculate visible world bounds
  const padding = SOIL_SECTOR_SIZE * 2;
  const visibleLeft = viewportCenter.x - halfCanvasWidth - padding;
  const visibleRight = viewportCenter.x + halfCanvasWidth + padding;
  const visibleTop = viewportCenter.y - halfCanvasHeight - padding;
  const visibleBottom = viewportCenter.y + halfCanvasHeight + padding;

  ctx.save();

  // Render each visible depleted sector
  for (const sector of depletedSectors) {
    const sectorWorldX = sector.gridX * SOIL_SECTOR_SIZE;
    const sectorWorldY = sector.gridY * SOIL_SECTOR_SIZE;

    // Get visible positions (handling world wrapping)
    const visiblePositions = getVisiblePositions(
      sectorWorldX,
      sectorWorldY,
      worldWidth,
      worldHeight,
      visibleLeft,
      visibleRight,
      visibleTop,
      visibleBottom,
    );

    for (const pos of visiblePositions) {
      renderSector(
        ctx,
        pos.x,
        pos.y,
        sector.health,
        sector.gridX,
        sector.gridY,
        sectorSet,
        maxGridX,
        maxGridY,
      );
    }
  }

  ctx.restore();
}

/**
 * Gets positions where the sector should be rendered (handling world wrapping).
 */
function getVisiblePositions(
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
  const size = SOIL_SECTOR_SIZE;

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
      x + size >= visibleLeft &&
      x <= visibleRight &&
      y + size >= visibleTop &&
      y <= visibleBottom
    ) {
      result.push({ x, y });
    }
  }

  return result;
}

/**
 * Renders a single depleted sector with border effects.
 */
function renderSector(
  ctx: CanvasRenderingContext2D,
  worldX: number,
  worldY: number,
  health: number,
  gridX: number,
  gridY: number,
  sectorSet: Set<string>,
  maxGridX: number,
  maxGridY: number,
): void {
  // Convert world coordinates to screen coordinates (floor to avoid shaking)
  // Note: The context is already transformed by the viewport center, so we use world coordinates directly.
  const screenX = Math.floor(worldX);
  const screenY = Math.floor(worldY);
  const size = SOIL_SECTOR_SIZE;

  // Calculate opacity based on depletion level
  const depletionRatio = 1 - health / SOIL_DEPLETED_RENDER_THRESHOLD;
  const isFullyVisible = health < SOIL_VISIBLE_DEPLETION_THRESHOLD;
  const opacity = isFullyVisible ? SOIL_DEPLETED_OPACITY : SOIL_DEPLETED_OPACITY * depletionRatio;

  // Check which neighbors are NOT depleted (for border rendering)
  const hasTopBorder = !hasDepletedNeighbor(sectorSet, gridX, gridY, 0, -1, maxGridX, maxGridY);
  const hasBottomBorder = !hasDepletedNeighbor(sectorSet, gridX, gridY, 0, 1, maxGridX, maxGridY);
  const hasLeftBorder = !hasDepletedNeighbor(sectorSet, gridX, gridY, -1, 0, maxGridX, maxGridY);
  const hasRightBorder = !hasDepletedNeighbor(sectorSet, gridX, gridY, 1, 0, maxGridX, maxGridY);

  // Draw main fill
  ctx.globalAlpha = opacity;
  ctx.fillStyle = SOIL_DEPLETED_COLOR;
  ctx.fillRect(screenX, screenY, size, size);

  // Draw border/cliff effect on edges where there's no depleted neighbor
  const borderWidth = 3;
  ctx.fillStyle = SOIL_DEPLETED_BORDER_COLOR;
  ctx.globalAlpha = opacity * 1.2; // Slightly more opaque for border

  if (hasTopBorder) {
    ctx.fillRect(screenX, screenY, size, borderWidth);
  }
  if (hasBottomBorder) {
    ctx.fillRect(screenX, screenY + size - borderWidth, size, borderWidth);
  }
  if (hasLeftBorder) {
    ctx.fillRect(screenX, screenY, borderWidth, size);
  }
  if (hasRightBorder) {
    ctx.fillRect(screenX + size - borderWidth, screenY, borderWidth, size);
  }

  // Draw corner highlights for more depth
  ctx.globalAlpha = opacity * 0.5;
  const cornerSize = borderWidth + 1;
  
  // Top-left corner
  if (hasTopBorder && hasLeftBorder) {
    ctx.fillRect(screenX, screenY, cornerSize, cornerSize);
  }
  // Top-right corner
  if (hasTopBorder && hasRightBorder) {
    ctx.fillRect(screenX + size - cornerSize, screenY, cornerSize, cornerSize);
  }
  // Bottom-left corner
  if (hasBottomBorder && hasLeftBorder) {
    ctx.fillRect(screenX, screenY + size - cornerSize, cornerSize, cornerSize);
  }
  // Bottom-right corner
  if (hasBottomBorder && hasRightBorder) {
    ctx.fillRect(screenX + size - cornerSize, screenY + size - cornerSize, cornerSize, cornerSize);
  }

  ctx.globalAlpha = 1;
}
