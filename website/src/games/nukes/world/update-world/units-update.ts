import { Unit } from '../world-state-types';
import { CITY_RADIUS, UNIT_MOVEMENT_SPEED, UNIT_SIZE } from '../world-state-constants';
import { IndexedWorldState } from '../world-state-index';
import { Battles, findBattles, isUnitInBattle, resolveBattles } from './unit-battles';
import { updateUnitOrders } from './unit-orders';

export function updateUnits(worldState: IndexedWorldState, deltaTime: number): void {
  // Find battles: two hostile state units are in the same sector
  const battles = findBattles(worldState);

  // Resolve battles: calculate damage, update unit quantity
  resolveBattles(worldState.units, battles, deltaTime);

  // Remove dead units (quantity = 0)
  // Update unit positions and movements
  updateUnitPositions(worldState, deltaTime, battles);

  // Update sector ownership
  updateSectorOwnership(worldState);

  // Update unit orders
  updateUnitOrders(worldState, battles);

  worldState.units = worldState.units.filter((unit) => unit.quantity > 0);
}

function updateUnitPositions(worldState: IndexedWorldState, deltaTime: number, battles: Battles): void {
  for (const unit of worldState.units) {
    if (
      unit.order.type !== 'move' ||
      (isUnitInBattle(unit, battles) && /* unit can pull back to safe sector */ !isMovingToSafeSector(unit, worldState))
    ) {
      continue;
    }

    const direction = {
      x: unit.order.targetPosition.x - unit.position.x,
      y: unit.order.targetPosition.y - unit.position.y,
    };
    const distance = Math.sqrt(direction.x ** 2 + direction.y ** 2);
    const movement = UNIT_MOVEMENT_SPEED * deltaTime;

    if (distance <= movement) {
      unit.position = unit.order.targetPosition;
      unit.order = { type: 'stay' };
    } else {
      const normalizedDirection = {
        x: direction.x / distance,
        y: direction.y / distance,
      };
      unit.position = {
        x: unit.position.x + normalizedDirection.x * movement,
        y: unit.position.y + normalizedDirection.y * movement,
      };
    }
    unit.rect = {
      left: unit.position.x - UNIT_SIZE / 2,
      top: unit.position.y - UNIT_SIZE / 2,
      right: unit.position.x + UNIT_SIZE / 2,
      bottom: unit.position.y + UNIT_SIZE / 2,
    };
  }
}

function updateSectorOwnership(worldState: IndexedWorldState) {
  worldState.units.forEach((unit) => {
    const sector = worldState.searchSector.byRadius(unit.position, 1)[0];
    if (!sector || sector.stateId === unit.stateId) {
      return;
    }

    const sectorUnits = worldState.searchUnit.byRect(sector.rect);
    const sameState =
      Object.values(sectorUnits.reduce((r, unit) => ((r[unit.stateId] = true), r), { [unit.stateId]: true })).length ===
      1;
    if (sameState) {
      // take over the sector
      sector.stateId = unit.stateId;

      // if sector is a city sector, check if all sectors of the city belong to new state
      if (sector.cityId) {
        const city = worldState.cities.find((c) => c.id === sector.cityId);
        if (city && city.stateId !== unit.stateId) {
          const citySectors = worldState.searchSector
            .byRadius(city.position, CITY_RADIUS)
            .filter((sector) => sector.cityId === city.id && sector.population > 0);
          const allCitySectorsBelongToNewState = citySectors.every((s) => s.stateId === unit.stateId);
          if (allCitySectorsBelongToNewState) {
            // change state of the city
            city.stateId = unit.stateId;
          }
        }
      }

      // if there is launch site on the sector, the launch site changes owner as well
      const launchSite = worldState.searchLaunchSite
        .byRect(sector.rect)
        .filter((site) => site.stateId !== unit.stateId)[0];
      if (launchSite) {
        launchSite.stateId = unit.stateId;
      }
    }
  });
}

function isMovingToSafeSector(unit: Unit, worldState: IndexedWorldState): boolean {
  if (unit.order.type !== 'move') {
    return false;
  }

  // Find the target sector
  const targetSector = worldState.searchSector.byRadius(unit.order.targetPosition, 1)[0];
  if (!targetSector) {
    return false;
  }

  // Check if the sector belongs to the unit's state
  if (targetSector.stateId !== unit.stateId) {
    return false;
  }

  // Find all units in the target sector
  const unitsInTargetSector = worldState.searchUnit.byRect(targetSector.rect);

  // Check if there are any hostile units in the target sector
  for (const otherUnit of unitsInTargetSector) {
    if (otherUnit.stateId !== unit.stateId) {
      return false;
    }
  }

  // If we've made it this far, the sector is safe
  return true;
}
