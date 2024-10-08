import { SECTOR_SIZE, UNIT_SIZE, UNIT_ORDER_COOLDOWN } from '../world-state-constants';
import { IndexedWorldState } from '../world-state-index';
import { Battles, Unit, Sector, Position, SectorType, Strategy, State } from '../world-state-types';
import { isUnitInBattle } from './unit-battles';
import { countUnitsInSector, evaluateStrategicValue, MAX_UNITS_PER_SECTOR } from './unit-strategic-evaluation';

export function updateUnitOrders(worldState: IndexedWorldState, battles: Battles): void {
  for (const unit of worldState.units) {
    if (unit.lastOrderTimestamp && worldState.timestamp - unit.lastOrderTimestamp < UNIT_ORDER_COOLDOWN) {
      continue;
    }

    if (unit.order.type === 'move' && unit.order.isFallback) {
      continue;
    }

    const currentSector = worldState.searchSector.byRadius(unit.position, 1)[0];
    if (!currentSector) {
      continue;
    }

    const unitState = worldState.states.find((state) => state.id === unit.stateId);
    if (!unitState) {
      continue;
    }

    // Priority decision: if you are participating in a battle, and you are losing, move away from the battle, towards your own sector
    if (isUnitInBattle(unit, battles)) {
      const battle = battles.find((b) => b.units.includes(unit));
      if (battle && isUnitLosing(unit, battle)) {
        const safeSector = findNearestFriendlySector(unit, worldState, battles);
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

    // Higher priority decision: if there is a nearby (very close) hostile unit, and it is smaller, move towards it
    const nearbyHostileUnit = findNearbyHostileUnit(unit, unitState, worldState);
    if (nearbyHostileUnit) {
      unit.order = {
        type: 'move',
        targetPosition: nearbyHostileUnit.position,
      };
      unit.lastOrderTimestamp = worldState.timestamp;
      continue;
    }

    const adjacentSectors = worldState.searchSector
      .byRect({
        left: currentSector.rect.left - SECTOR_SIZE,
        top: currentSector.rect.top - SECTOR_SIZE,
        right: currentSector.rect.right + SECTOR_SIZE,
        bottom: currentSector.rect.bottom + SECTOR_SIZE,
      })
      // units dont move on water
      .filter((sector) => sector.type === SectorType.GROUND && sector.stateId);

    const hostileSectors = adjacentSectors.filter(
      (sector) => sector.stateId !== unit.stateId && unitState.strategies[sector.stateId!] === Strategy.HOSTILE,
    );

    if (hostileSectors.length > 0) {
      // New logic: evaluate strategic value of sectors and choose the best one
      const targetSector = selectBestStrategicSector(unit, hostileSectors, adjacentSectors, worldState, unitState);
      unit.order = {
        type: 'move',
        targetPosition: getSectorCenter(targetSector),
      };
    } else {
      // Implement spreading behavior when not in battle
      const overcrowdedSector = isOvercrowded(currentSector, worldState);
      if (overcrowdedSector) {
        const spreadTarget = findSpreadTarget(unit, unitState, adjacentSectors, worldState);
        if (spreadTarget) {
          unit.order = {
            type: 'move',
            targetPosition: getSectorCenter(spreadTarget),
          };
        } else {
          unit.order = { type: 'stay' };
        }
      } else {
        // High-level decision: find nearest strategic target
        const nearestTarget = findNearestStrategicTarget(
          unit,
          unitState,
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
    }

    unit.lastOrderTimestamp = worldState.timestamp;
  }
}

function findNearbyHostileUnit(unit: Unit, unitState: State, worldState: IndexedWorldState): Unit | undefined {
  const nearbyUnits = worldState.searchUnit.byRadius(unit.position, UNIT_SIZE * 2);
  return nearbyUnits.find(
    (otherUnit) =>
      otherUnit.stateId !== unit.stateId &&
      unitState.strategies[otherUnit.stateId] === Strategy.HOSTILE &&
      otherUnit.quantity < unit.quantity,
  );
}

function isUnitLosing(unit: Unit, battle: { units: Unit[] }): boolean {
  const totalUnits = battle.units.reduce((sum, u) => sum + u.quantity, 0);
  const unitStrength = unit.quantity / totalUnits;
  return unitStrength < 0.4; // Assuming a unit is losing if it represents less than 40% of the total force
}

function findNearestFriendlySector(unit: Unit, worldState: IndexedWorldState, battles: Battles): Sector | undefined {
  const friendlySectors = worldState.searchSector
    .byRadius(unit.position, SECTOR_SIZE * 5)
    .filter((sector) => sector.stateId === unit.stateId && sector.type === SectorType.GROUND);

  return friendlySectors.reduce(
    (nearest, sector) => {
      const distance = Math.sqrt(
        (unit.position.x - sector.position.x) ** 2 + (unit.position.y - sector.position.y) ** 2,
      );

      // Check if there are no enemy units in the sector
      const unitsInSector = worldState.searchUnit.byRect(sector.rect);
      const hasEnemyUnits = unitsInSector.some((u) => u.stateId !== unit.stateId);

      // Check if there is no ongoing battle in the sector
      const hasBattle = battles.some((battle) =>
        battle.units.some(
          (u) =>
            u.rect.left < sector.rect.right &&
            u.rect.right > sector.rect.left &&
            u.rect.top < sector.rect.bottom &&
            u.rect.bottom > sector.rect.top,
        ),
      );

      if (!hasEnemyUnits && !hasBattle && (!nearest || distance < nearest.distance)) {
        return { sector, distance };
      }
      return nearest;
    },
    undefined as { sector: Sector; distance: number } | undefined,
  )?.sector;
}

function selectBestStrategicSector(
  unit: Unit,
  hostileSectors: Sector[],
  allSectors: Sector[],
  worldState: IndexedWorldState,
  unitState: State,
): Sector {
  let bestSector = hostileSectors[0];
  let highestStrategicValue = -Infinity;

  for (const sector of hostileSectors) {
    const strategicValue = evaluateStrategicValue(sector, unit, allSectors, worldState);
    // Add bonus for sectors in the current defence line
    const defenceLineBonus = unitState.defenceLines[unitState.currentDefenceLineIndex].sectors.includes(sector)
      ? 50
      : 0;
    const totalValue = strategicValue + defenceLineBonus;

    if (totalValue > highestStrategicValue) {
      highestStrategicValue = totalValue;
      bestSector = sector;
    }
  }

  return bestSector;
}

function getSectorCenter(sector: Sector): Position {
  return {
    x: (sector.rect.left + sector.rect.right) / 2,
    y: (sector.rect.top + sector.rect.bottom) / 2,
  };
}

function findNearestStrategicTarget(
  unit: Unit,
  unitState: State,
  worldState: IndexedWorldState,
  sectors: Sector[],
): { position: Position; type: 'sector' | 'launchSite' } | undefined {
  const hostileSectors = sectors.filter(
    (sector) =>
      sector.stateId !== unit.stateId && sector.stateId && unitState.strategies[sector.stateId] === Strategy.HOSTILE,
  );

  // Evaluate all hostile sectors
  const evaluatedSectors = hostileSectors.map((sector) => ({
    sector,
    value: evaluateStrategicValue(sector, unit, sectors, worldState),
    distance: Math.sqrt((unit.position.x - sector.position.x) ** 2 + (unit.position.y - sector.position.y) ** 2),
  }));

  // Sort by strategic value (descending) and then by distance (ascending)
  evaluatedSectors.sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    return a.distance - b.distance;
  });

  const bestTarget = evaluatedSectors[0];
  if (bestTarget) {
    return { position: getSectorCenter(bestTarget.sector), type: 'sector' as const };
  }

  return undefined;
}

function isOvercrowded(sector: Sector, worldState: IndexedWorldState): boolean {
  return countUnitsInSector(sector, worldState) + countUnitsMovingIntoSector(sector, worldState) > MAX_UNITS_PER_SECTOR;
}

function countUnitsMovingIntoSector(sector: Sector, worldState: IndexedWorldState): number {
  return worldState.units.filter(
    (unit) => unit.order.type === 'move' && isPositionInSector(unit.order.targetPosition, sector),
  ).length;
}

function isPositionInSector(position: Position, sector: Sector): boolean {
  return (
    position.x >= sector.rect.left &&
    position.x <= sector.rect.right &&
    position.y >= sector.rect.top &&
    position.y <= sector.rect.bottom
  );
}

function findSpreadTarget(
  unit: Unit,
  unitState: State,
  adjacentSectors: Sector[],
  worldState: IndexedWorldState,
): Sector | undefined {
  const friendlySectors = adjacentSectors.filter(
    (sector) =>
      sector.stateId === unit.stateId || (sector.stateId && unitState.strategies[sector.stateId] === Strategy.FRIENDLY),
  );

  // Sort sectors by total unit count (current + moving in), ascending
  friendlySectors.sort((a, b) => {
    const totalUnitsA = countUnitsInSector(a, worldState) + countUnitsMovingIntoSector(a, worldState);
    const totalUnitsB = countUnitsInSector(b, worldState) + countUnitsMovingIntoSector(b, worldState);
    return totalUnitsA - totalUnitsB;
  });

  // Prioritize sectors in the current defence line
  const currentDefenceLineSectors = unitState.defenceLines[unitState.currentDefenceLineIndex].sectors;
  const defenceLineSector = friendlySectors.find(
    (sector) =>
      currentDefenceLineSectors.includes(sector) &&
      !isOvercrowded(sector, worldState) &&
      !hasNeutralUnits(sector, unitState, worldState),
  );

  if (defenceLineSector) {
    return defenceLineSector;
  }

  // If no suitable sector in the defence line, fall back to the previous logic
  return friendlySectors.find(
    (sector) => !isOvercrowded(sector, worldState) && !hasNeutralUnits(sector, unitState, worldState),
  );
}

function hasNeutralUnits(sector: Sector, unitState: State, worldState: IndexedWorldState): boolean {
  const unitsInSector = worldState.searchUnit.byRect(sector.rect);
  return unitsInSector.some(
    (unit) => unit.stateId !== sector.stateId && unitState.strategies[unit.stateId] === Strategy.NEUTRAL,
  );
}
