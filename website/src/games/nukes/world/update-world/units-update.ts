import { Unit } from '../world-state-types';
import { UNIT_MOVEMENT_SPEED, UNIT_SIZE } from '../world-state-constants';
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
  updateUnitPositions(worldState.units, deltaTime, battles);

  // Update sector ownership
  updateSectorOwnership(worldState);

  // Update unit orders
  updateUnitOrders(worldState);

  worldState.units = worldState.units.filter((unit) => unit.quantity > 0);
}

function updateUnitPositions(units: Unit[], deltaTime: number, battles: Battles): Unit[] {
  return units.map((unit) => {
    if (unit.order.type === 'move' && !isUnitInBattle(unit, battles)) {
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
    return unit;
  });
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
      sector.stateId = unit.stateId;
    }
  });
}
