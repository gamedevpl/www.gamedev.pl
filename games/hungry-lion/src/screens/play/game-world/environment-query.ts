import { Entity } from './entities-types';
import { Environment, Sector, SectorType } from './environment-types';
import { Rect2D } from './math-types';
import { vectorDistance } from './math-utils';

export function getOverlappingSectors(environment: Environment, rect: Rect2D): Sector[] {
  return environment.sectors.filter((sector) => {
    return (
      rect.x < sector.rect.x + sector.rect.width &&
      rect.x + rect.width > sector.rect.x &&
      rect.y < sector.rect.y + sector.rect.height &&
      rect.y + rect.height > sector.rect.y
    );
  });
}

export function getSectorAtEntity<T = Sector>(
  environment: Environment,
  entity: Entity,
  type: SectorType,
): T | undefined {
  const entityRect = {
    x: entity.position.x,
    y: entity.position.y,
    width: 30,
    height: 30,
  };

  const sectors = getOverlappingSectors(environment, entityRect).filter((sector) => sector.type === type);
  return sectors[0] as T | undefined;
}

export function findClosestSector<T = Sector>(
  environment: Environment,
  entity: Entity,
  type: SectorType,
): [sector: T | undefined, distance: number] {
  const sectors = environment.sectors.filter((sector) => sector.type === type);
  let closestSector = null;
  let closestDistance = Infinity;

  for (const sector of sectors) {
    const distance = vectorDistance(entity.position, {
      x: sector.rect.x + sector.rect.width / 2,
      y: sector.rect.y + sector.rect.height / 2,
    });
    if (distance < closestDistance) {
      closestSector = sector;
      closestDistance = distance;
    }
  }

  return [closestSector as T | undefined, closestDistance];
}
