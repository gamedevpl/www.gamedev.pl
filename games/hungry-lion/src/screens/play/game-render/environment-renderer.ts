import { Water2D } from '../../../../../../tools/asset-generator/generator-assets/src/water-2d/water-2d';
import { Grass2d } from '../../../../../../tools/asset-generator/generator-assets/src/grass-2d/grass-2d';
import { RenderState } from './render-state';
import { GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT } from '../game-world/game-world-consts';
import {
  Environment,
  GrassSector,
  isGrassSector,
  isWaterSector,
  Sector,
  WaterSector,
} from '../game-world/environment/environment-types';

export function renderEnvironment(
  ctx: CanvasRenderingContext2D,
  environment: Environment,
  renderState: RenderState,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const { viewport } = renderState;

  // Define offsets for wrapping
  const offsetsX = [0, GAME_WORLD_WIDTH, -GAME_WORLD_WIDTH];
  const offsetsY = [0, GAME_WORLD_HEIGHT, -GAME_WORLD_HEIGHT];

  environment.sectors.forEach((sector: Sector) => {
    for (const ox of offsetsX) {
      for (const oy of offsetsY) {
        // Calculate the sector's potential top-left corner in world coordinates, adjusted by offset
        const sectorWorldX = sector.rect.x + ox;
        const sectorWorldY = sector.rect.y + oy;

        // Calculate the sector's position in canvas coordinates
        const canvasX = sectorWorldX + viewport.x;
        const canvasY = sectorWorldY + viewport.y;

        // Basic visibility check: Check if the sector's rectangle overlaps the canvas
        if (
          canvasX < canvasWidth &&
          canvasX + sector.rect.width > 0 &&
          canvasY < canvasHeight &&
          canvasY + sector.rect.height > 0
        ) {
          // Draw the sector at the offset world position
          // The context is already translated by the viewport, so we draw relative to that.
          if (isGrassSector(sector)) {
            renderGrassSector(ctx, sector, sectorWorldX, sectorWorldY);
          } else if (isWaterSector(sector)) {
            renderWaterSector(ctx, sector, sectorWorldX, sectorWorldY);
          }
        }
      }
    }
  });
}

// Updated to accept explicit x, y coordinates
function renderGrassSector(ctx: CanvasRenderingContext2D, sector: GrassSector, x: number, y: number): void {
  Grass2d.render(
    ctx,
    x, // Use passed x
    y, // Use passed y
    sector.rect.width,
    sector.rect.height,
    (Date.now() % 10000) / 10000,
    'windy',
    'right',
  );
}

// Updated to accept explicit x, y coordinates
function renderWaterSector(ctx: CanvasRenderingContext2D, sector: WaterSector, x: number, y: number): void {
  Water2D.render(
    ctx,
    x, // Use passed x
    y, // Use passed y
    sector.rect.width,
    sector.rect.height,
    (Date.now() % 10000) / 10000,
    'default',
    'right',
  );
}
