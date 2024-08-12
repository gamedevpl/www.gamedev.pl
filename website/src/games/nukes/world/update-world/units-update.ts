import { Sector, Unit, Strategy, StateId } from '../world-state-types';
import { UNIT_MOVEMENT_SPEED, SECTOR_SIZE } from '../world-state-constants';
import { IndexedWorldState } from '../world-state-index';

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

function findBattles(worldState: IndexedWorldState): Record<string, Unit[]> {
  const battles = {} as Record<string, Unit[]>;

  for (const sector of worldState.sectors.filter((sector) => sector.stateId)) {
    const unitsInSector = worldState.searchUnit.byRect(sector.rect);
    const hostileUnits = unitsInSector.filter(
      (unit) =>
        worldState.states.find((state) => state.id === unit.stateId)?.strategies[sector.stateId!] === Strategy.HOSTILE,
    );
    const stateUnits = unitsInSector.filter((unit) => unit.stateId === sector.stateId);

    if (hostileUnits.length > 0 && stateUnits.length > 0) {
      battles[sector.id] = [...hostileUnits, ...stateUnits];
    }
  }

  return battles;
}

function resolveBattles(units: Unit[], battles: Record<string, Unit[]>, deltaTime: number): Unit[] {
  for (const [, battleUnits] of Object.entries(battles)) {
    const quantities = battleUnits.reduce(
      (acc, unit) => ((acc[unit.stateId] = (acc[unit.stateId] ?? 0) + unit.quantity), acc),
      {} as Record<StateId, number>,
    );
    const totalQuantity = Object.values(quantities).reduce((acc, quantity) => (acc = acc + quantity), 0);
    if (!totalQuantity) {
      continue;
    }

    battleUnits.forEach((unit) => {
      unit.quantity -= (quantities[unit.stateId] / totalQuantity) * deltaTime;
    });
  }

  return units;
}

function updateUnitPositions(units: Unit[], deltaTime: number, battles: Record<string, Unit[]>): Unit[] {
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
    }
    return unit;
  });
}

function isUnitInBattle(unit: Unit, battles: Record<string, Unit[]>): boolean {
  for (const [, battleUnits] of Object.entries(battles)) {
    if (battleUnits.find((u) => u.id === unit.id)) {
      return true;
    }
  }
  return false;
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

function updateUnitOrders(worldState: IndexedWorldState) {
  worldState.units.forEach((unit) => {
    if (unit.lastOrderTimestamp && worldState.timestamp - unit.lastOrderTimestamp < 5) {
      return unit; // Don't update orders too frequently
    }

    const currentSector = worldState.searchSector.byRadius(unit.position, 1)[0];
    if (!currentSector) {
      return unit;
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
    return unit;
  });
}

function findNearestHostilePopulatedSector(unit: Unit, sectors: Sector[]): Sector | undefined {
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
