import { SECTOR_SIZE } from '../world-state-constants';
import { IndexedWorldState } from '../world-state-index';
import { Unit, Sector } from '../world-state-types';

export function updateUnitOrders(worldState: IndexedWorldState): void {
  for (const unit of worldState.units) {
    if (unit.lastOrderTimestamp && worldState.timestamp - unit.lastOrderTimestamp < 10) {
      return; // Don't update orders too frequently
    }

    const currentSector = worldState.searchSector.byRadius(unit.position, 1)[0];
    if (!currentSector) {
      return;
    }

    const adjacentSectors = worldState.searchSector.byRect({
      left: currentSector.rect.left - SECTOR_SIZE,
      top: currentSector.rect.top - SECTOR_SIZE,
      right: currentSector.rect.right + SECTOR_SIZE,
      bottom: currentSector.rect.bottom + SECTOR_SIZE,
    });

    const hostileSectors = adjacentSectors.filter((sector) => sector.stateId !== unit.stateId);

    if (hostileSectors.length > 0) {
      // Low-level decision: attack adjacent hostile sector
      const targetSector = hostileSectors[Math.floor(Math.random() * hostileSectors.length)];
      unit.order = {
        type: 'move',
        targetPosition: {
          x: (targetSector.rect.left + targetSector.rect.right) / 2,
          y: (targetSector.rect.top + targetSector.rect.bottom) / 2,
        },
      };
    } else {
      // High-level decision: find nearest hostile populated sector
      const nearestHostileSector = findNearestHostilePopulatedSector(unit, worldState.sectors);
      if (nearestHostileSector) {
        unit.order = {
          type: 'move',
          targetPosition: {
            x: (nearestHostileSector.rect.left + nearestHostileSector.rect.right) / 2,
            y: (nearestHostileSector.rect.top + nearestHostileSector.rect.bottom) / 2,
          },
        };
      } else {
        unit.order = { type: 'stay' };
      }
    }

    unit.lastOrderTimestamp = worldState.timestamp;
  }
}

export function findNearestHostilePopulatedSector(unit: Unit, sectors: Sector[]): Sector | undefined {
  return sectors
    .filter((sector) => sector.stateId !== unit.stateId && sector.population > 0)
    .reduce(
      (nearest, sector) => {
        const distance = Math.sqrt(
          (unit.position.x - sector.position.x) ** 2 + (unit.position.y - sector.position.y) ** 2,
        );
        return nearest && nearest.distance < distance ? nearest : { sector, distance };
      },
      undefined as { sector: Sector; distance: number } | undefined,
    )?.sector;
}
