import { State, Unit, Sector, StateId } from '../world-state-types';
import { findBorderSectors } from '../world-state-utils';

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
      const unitsInSector = Math.round(totalQuantity * borderRatio) / accBorderLength;
      if (unitsInSector > 0) {
        units.push({
          quantity: unitsInSector,
          position: sector.position,
          stateId: state.id,
          order: { type: 'stay' },
        });
      }
    }
  });

  return units;
}
