import { State, Unit, Sector, StateId } from '../world-state-types';
import { findBorderSectors } from '../world-state-utils';

export function dislocateStateUnits(sectors: Sector[], state: State, totalQuantity: number): Unit[] {
  const units: Unit[] = [];

  const borderSectors = findBorderSectors(sectors, state);

  const stateBorderLength: Record<StateId, number> = {};
  // Calculate the border length for each neighboring state
  borderSectors.forEach((sector) => {
    if (sector.stateId && sector.stateId !== state.id) {
      stateBorderLength[sector.stateId] = (stateBorderLength[sector.stateId] || 0) + 1;
    }
  });

  const totalBorderLength = Object.values(stateBorderLength).reduce((acc, length) => acc + length, 0);

  // Distribute units proportionally to the length of the border with other states
  borderSectors.forEach((sector) => {
    if (sector.stateId && sector.stateId !== state.id) {
      const borderRatio = stateBorderLength[sector.stateId] / totalBorderLength;
      const unitsInSector = Math.round(totalQuantity * borderRatio) / stateBorderLength[sector.stateId];
      if (unitsInSector > 0) {
        units.push({
          quantity: unitsInSector,
          stateId: state.id,
          order: { type: 'stay' },
        });
      }
    }
  });

  return units;
}
