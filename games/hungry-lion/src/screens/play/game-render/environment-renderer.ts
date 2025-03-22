import { Water2D } from '../../../../../../tools/asset-generator/generator-assets/src/water-2d/water-2d';
import { Grass2d } from '../../../../../../tools/asset-generator/generator-assets/src/grass-2d/grass-2d';

import {
  Environment,
  GrassSector,
  isGrassSector,
  isWaterSector,
  WaterSector,
} from '../game-world/environment/environment-types';

export function renderEnvironment(ctx: CanvasRenderingContext2D, environment: Environment): void {
  environment.sectors.forEach((sector) => {
    if (isGrassSector(sector)) {
      renderGrassSector(ctx, sector);
    } else if (isWaterSector(sector)) {
      renderWaterSector(ctx, sector);
    }
  });
}

function renderGrassSector(ctx: CanvasRenderingContext2D, sector: GrassSector): void {
  Grass2d.render(
    ctx,
    sector.rect.x,
    sector.rect.y,
    sector.rect.width,
    sector.rect.height,
    (Date.now() % 1000) / 1000,
    'windy',
    'right',
  );
}

function renderWaterSector(ctx: CanvasRenderingContext2D, sector: WaterSector): void {
  Water2D.render(
    ctx,
    sector.rect.x,
    sector.rect.y,
    sector.rect.width,
    sector.rect.height,
    (Date.now() % 1000) / 1000,
    'default',
    'right',
  );
}
