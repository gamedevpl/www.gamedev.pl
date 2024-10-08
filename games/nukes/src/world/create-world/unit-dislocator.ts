import { State, Unit, Sector, StateId } from '../world-state-types';
import { findBorderSectors } from '../world-state-utils';
import { SECTOR_SIZE } from '../world-state-constants';

let unitIdCounter = 0;

export function dislocateStateUnits(sectors: Sector[], state: State, totalQuantity: number): Unit[] {
  const units: Unit[] = [];

  const borderSectors = findBorderSectors(sectors, state);

  const stateBorderLength: Record<StateId, number> = {};
  // Calculate the border length for each neighboring state
  borderSectors.forEach((sector) => {
    for (const adjacentStateId of sector.adjacentStateIds) {
      stateBorderLength[adjacentStateId] = (stateBorderLength[adjacentStateId] || 0) + 1;
    }
  });

  const totalBorderLength = Object.values(stateBorderLength).reduce((acc, length) => acc + length, 0);

  // Distribute units proportionally to the length of the border with other states
  borderSectors.forEach((sector) => {
    if (sector.stateId && sector.stateId === state.id) {
      const accBorderLength = Array.from(sector.adjacentStateIds).reduce(
        (acc, stateId) => acc + stateBorderLength[stateId],
        0,
      );
      const borderRatio = accBorderLength / totalBorderLength;
      const unitsInSector = (Math.round(totalQuantity * borderRatio) / accBorderLength) * (Math.random() * 0.1 + 0.9);
      if (unitsInSector > 0) {
        units.push({
          id: String(unitIdCounter++),
          quantity: unitsInSector,
          position: { x: sector.position.x + SECTOR_SIZE / 2, y: sector.position.y + SECTOR_SIZE / 2 },
          rect: {
            left: sector.position.x - SECTOR_SIZE / 2,
            top: sector.position.y - SECTOR_SIZE / 2,
            right: sector.position.x + SECTOR_SIZE / 2,
            bottom: sector.position.y + SECTOR_SIZE / 2,
          },
          stateId: state.id,
          order: { type: 'stay' },
        });
      }
    }
  });

  return units;
}
