import { SECTOR_SIZE, UNIT_SIZE } from '../world-state-constants';
import { IndexedWorldState } from '../world-state-index';
import { Unit, Sector, Position, SectorType, LaunchSite } from '../world-state-types';
import { Battles, isUnitInBattle } from './unit-battles';

export function updateUnitOrders(worldState: IndexedWorldState, battles: Battles): void {
  for (const unit of worldState.units) {
    if (unit.lastOrderTimestamp && worldState.timestamp - unit.lastOrderTimestamp < 10) {
      return; // Don't update orders too frequently
    }

    const currentSector = worldState.searchSector.byRadius(unit.position, 1)[0];
    if (!currentSector) {
      return;
    }

    // Higher priority decision: if there is a nearby (very close) hostile unit, and it is smaller, move towards it
    const nearbyHostileUnit = findNearbyHostileUnit(unit, worldState);
    if (nearbyHostileUnit) {
      unit.order = {
        type: 'move',
        targetPosition: nearbyHostileUnit.position,
      };
      unit.lastOrderTimestamp = worldState.timestamp;
      continue;
    }

    // Priority decision: if you are participating in a battle, and you are losing, move away from the battle, towards your own sector
    if (isUnitInBattle(unit, battles)) {
      const battle = battles.find((b) => b.units.includes(unit));
      if (battle && isUnitLosing(unit, battle)) {
        const safeSector = findNearestFriendlySector(unit, worldState);
        if (safeSector) {
          unit.order = {
            type: 'move',
            targetPosition: getSectorCenter(safeSector),
          };
          unit.lastOrderTimestamp = worldState.timestamp;
          continue;
        }
      }
    }

    const adjacentSectors = worldState.searchSector
      .byRect({
        left: currentSector.rect.left - SECTOR_SIZE,
        top: currentSector.rect.top - SECTOR_SIZE,
        right: currentSector.rect.right + SECTOR_SIZE,
        bottom: currentSector.rect.bottom + SECTOR_SIZE,
      })
      // units dont move on water
      .filter((sector) => sector.type === SectorType.GROUND);

    const hostileSectors = adjacentSectors.filter((sector) => sector.stateId !== unit.stateId);

    if (hostileSectors.length > 0) {
      // New logic: calculate how many hostile sectors would be left behind if we move towards a sector
      const targetSector = selectBestHostileSector(unit, hostileSectors, adjacentSectors, worldState);
      unit.order = {
        type: 'move',
        targetPosition: getSectorCenter(targetSector),
      };
    } else {
      // High-level decision: find nearest hostile populated sector or launch site
      const nearestTarget = findNearestHostileTarget(
        unit,
        worldState,
        worldState.searchSector
          .byRadius(unit.position, SECTOR_SIZE * 5)
          // units dont move on water
          .filter((sector) => sector.type === SectorType.GROUND),
      );
      if (nearestTarget) {
        unit.order = {
          type: 'move',
          targetPosition: nearestTarget.position,
        };
      } else {
        unit.order = { type: 'stay' };
      }
    }

    unit.lastOrderTimestamp = worldState.timestamp;
  }
}

function findNearbyHostileUnit(unit: Unit, worldState: IndexedWorldState): Unit | undefined {
  const nearbyUnits = worldState.searchUnit.byRadius(unit.position, UNIT_SIZE * 2);
  return nearbyUnits.find((otherUnit) => otherUnit.stateId !== unit.stateId && otherUnit.quantity < unit.quantity);
}

function isUnitLosing(unit: Unit, battle: { units: Unit[] }): boolean {
  const totalUnits = battle.units.reduce((sum, u) => sum + u.quantity, 0);
  const unitStrength = unit.quantity / totalUnits;
  return unitStrength < 0.4; // Assuming a unit is losing if it represents less than 40% of the total force
}

function findNearestFriendlySector(unit: Unit, worldState: IndexedWorldState): Sector | undefined {
  return worldState.searchSector
    .byRadius(unit.position, SECTOR_SIZE * 5)
    .filter((sector) => sector.stateId === unit.stateId && sector.type === SectorType.GROUND)
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

function selectBestHostileSector(
  unit: Unit,
  hostileSectors: Sector[],
  allSectors: Sector[],
  worldState: IndexedWorldState,
): Sector {
  let bestSector = hostileSectors[0];
  let highestPriority = -1;
  let leastHostilesLeft = Infinity;

  for (const sector of hostileSectors) {
    const hostilesLeft = countHostilesLeftBehind(unit, sector, allSectors);
    let priority = 0;

    // Check if the sector contains a launch site
    const launchSite = findLaunchSiteInSector(sector, worldState);
    if (launchSite) {
      priority += 3; // Highest priority for launch sites
    }

    // Check if the sector is a populated city sector
    if (sector.population > 0) {
      priority += 2; // High priority for populated sectors
    }

    // If priorities are equal, choose the sector with fewer hostiles left behind
    if (priority > highestPriority || (priority === highestPriority && hostilesLeft < leastHostilesLeft)) {
      highestPriority = priority;
      leastHostilesLeft = hostilesLeft;
      bestSector = sector;
    }
  }

  return bestSector;
}

function findLaunchSiteInSector(sector: Sector, worldState: IndexedWorldState): LaunchSite | undefined {
  return worldState.searchLaunchSite.byRect(sector.rect).filter((site) => site.stateId !== sector.stateId)[0];
}

function countHostilesLeftBehind(unit: Unit, targetSector: Sector, allSectors: Sector[]): number {
  const unitPosition = unit.position;
  const targetPosition = getSectorCenter(targetSector);
  const moveVector = {
    x: targetPosition.x - unitPosition.x,
    y: targetPosition.y - unitPosition.y,
  };

  return allSectors.filter((sector) => {
    if (sector.stateId === unit.stateId) return false;
    const sectorCenter = getSectorCenter(sector);
    const sectorVector = {
      x: sectorCenter.x - unitPosition.x,
      y: sectorCenter.y - unitPosition.y,
    };
    // Check if the sector is "behind" the movement vector using dot product
    return moveVector.x * sectorVector.x + moveVector.y * sectorVector.y < 0;
  }).length;
}

function getSectorCenter(sector: Sector): Position {
  return {
    x: (sector.rect.left + sector.rect.right) / 2,
    y: (sector.rect.top + sector.rect.bottom) / 2,
  };
}

function findNearestHostileTarget(
  unit: Unit,
  worldState: IndexedWorldState,
  sectors: Sector[],
): { position: Position; type: 'sector' | 'launchSite' } | undefined {
  const hostileLaunchSites = worldState.launchSites.filter((site) => site.stateId !== unit.stateId);

  if (hostileLaunchSites.length > 0) {
    // Select the closest launch site
    const closestLaunchSite = hostileLaunchSites.reduce(
      (closest, site) => {
        const distance = Math.sqrt((unit.position.x - site.position.x) ** 2 + (unit.position.y - site.position.y) ** 2);
        return closest.distance < distance ? closest : { site, distance };
      },
      { site: hostileLaunchSites[0], distance: Infinity },
    );

    return { position: closestLaunchSite.site.position, type: 'launchSite' as const };
  }

  const hostileSectors = sectors.filter((sector) => sector.stateId !== unit.stateId);
  // Find the closest populated hostile sector
  const closestPopulatedSector = hostileSectors.reduce(
    (closest, sector) => {
      if (sector.population > 0) {
        const distance = Math.sqrt(
          (unit.position.x - sector.position.x) ** 2 + (unit.position.y - sector.position.y) ** 2,
        );
        return closest.distance < distance ? closest : { sector, distance };
      }
      return closest;
    },
    { sector: null, distance: Infinity } as { sector: Sector | null; distance: number },
  );

  if (closestPopulatedSector.sector) {
    return { position: getSectorCenter(closestPopulatedSector.sector), type: 'sector' as const };
  }

  // If no populated sectors, fall back to the closest hostile sector
  const closestHostileSector = hostileSectors.reduce(
    (closest, sector) => {
      const distance = Math.sqrt(
        (unit.position.x - sector.position.x) ** 2 + (unit.position.y - sector.position.y) ** 2,
      );
      return closest.distance < distance ? closest : { sector, distance };
    },
    { sector: null, distance: Infinity } as { sector: Sector | null; distance: number },
  );

  return closestHostileSector.sector
    ? { position: getSectorCenter(closestHostileSector.sector), type: 'sector' as const }
    : undefined;
}
