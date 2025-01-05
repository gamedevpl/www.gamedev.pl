import { Environment, GrassSector, isGrassSector, isWaterSector, WaterSector } from '../game-world/environment-types';

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
  ctx.fillStyle = 'green';
  ctx.fillRect(sector.rect.x, sector.rect.y, sector.rect.width, sector.rect.height);
}

function renderWaterSector(ctx: CanvasRenderingContext2D, sector: WaterSector): void {
  ctx.fillStyle = 'blue';
  ctx.fillRect(sector.rect.x, sector.rect.y, sector.rect.width, sector.rect.height);
}
