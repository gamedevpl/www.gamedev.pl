/**
 * Integration module for soil depletion system.
 * Handles interactions between soil depletion and other game systems.
 */

import { getDepletedSectorsInArea } from './soil-depletion-update';
import { IndexedWorldState } from './world-index/world-index-types';

/**
 * Checks if a planting zone can be placed at a position (soil must be viable).
 */
export function canPlacePlantingZoneAtPosition(
  position: { x: number; y: number },
  width: number,
  height: number,
  gameState: IndexedWorldState,
): boolean {
  const depletedSectors = getDepletedSectorsInArea(
    gameState.soilDepletion,
    position,
    width,
    height,
    gameState.mapDimensions.width,
    gameState.mapDimensions.height,
  );

  return depletedSectors.length === 0;
}
