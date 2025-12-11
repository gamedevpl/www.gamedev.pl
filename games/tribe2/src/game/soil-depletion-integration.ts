/**
 * Integration module for soil depletion system.
 * Handles interactions between soil depletion and other game systems.
 */

import { BuildingType } from './building-consts';
import { startBuildingDestruction } from './utils/building-placement-utils';
import { getDepletedSectorsInArea } from './soil-depletion-update';
import { IndexedWorldState } from './world-index/world-index-types';

/**
 * Checks all planting zones and marks them for destruction if they're on depleted soil.
 */
export function updatePlantingZonesForDepletedSoil(gameState: IndexedWorldState): void {
  const plantingZones = gameState.search.building.byProperty('buildingType', BuildingType.PlantingZone);
  
  for (const zone of plantingZones) {
    // Skip zones already being destroyed
    if (zone.isBeingDestroyed) {
      continue;
    }
    
    // Check if any part of the zone is on depleted soil
    const depletedSectors = getDepletedSectorsInArea(
      gameState.soilDepletion,
      zone.position,
      zone.width,
      zone.height,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    
    if (depletedSectors.length > 0) {
      // Zone has depleted soil - mark for destruction
      startBuildingDestruction(zone.id, gameState);
    }
  }
}

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
