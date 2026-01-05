import { UpdateContext } from '../../world-types';
import { BuildingEntity } from './building-types';
import { getBuildingConstructionTime, getBuildingDestructionTime, BuildingType } from './building-consts.ts';
import { removeEntity } from '../entities-update';
import { HOURS_PER_GAME_DAY, GAME_DAY_IN_REAL_SECONDS } from '../../game-consts.ts';
import { paintTerrainOwnership } from '../tribe/territory-utils';
import { TERRITORY_BUILDING_RADIUS } from '../tribe/territory-consts';
import { updatePlantingZoneConnections } from '../../utils/planting-zone-connections-utils';
import {
  BONFIRE_FUEL_CONSUMPTION_PER_HOUR,
  BONFIRE_REFUEL_THRESHOLD,
  BONFIRE_FUEL_PER_WOOD,
} from '../../temperature/temperature-consts';
import { ItemType } from '../item-types';
import { prepareBuildingTaskAI } from '../../ai/task/buildings/building-task-update';
import { updateNavigationGridSector } from '../../utils/navigation-utils';

/**
 * Updates the state of a building entity.
 * Handles construction and destruction progress.
 * @param building The building entity to update.
 * @param updateContext The current update context containing game state and delta time.
 */
export function buildingUpdate(building: BuildingEntity, updateContext: UpdateContext): void {
  const { gameState, deltaTime } = updateContext;

  // Calculate game hours passed in this frame
  // deltaTime is in seconds (real time)
  // We need to convert this to game hours
  const gameHoursDelta = deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);

  // Handle Destruction
  if (building.isBeingDestroyed) {
    const destructionTime = getBuildingDestructionTime(building.buildingType);
    if (destructionTime > 0) {
      building.destructionProgress += gameHoursDelta / destructionTime;
    } else {
      building.destructionProgress = 1;
    }

    if (building.destructionProgress >= 1) {
      if (building.buildingType === BuildingType.Palisade || building.buildingType === BuildingType.Gate) {
        updateNavigationGridSector(gameState, building.position, building.radius, false);
      }

      const isPlantingZone = building.buildingType === BuildingType.PlantingZone;
      removeEntity(gameState.entities, building.id);
      // Update planting zone connections after a planting zone is removed
      if (isPlantingZone) {
        updatePlantingZoneConnections(gameState);
      }
      return; // Entity removed, no further updates needed
    }
  }

  // Handle Construction
  if (!building.isConstructed && !building.isBeingDestroyed) {
    const constructionTime = getBuildingConstructionTime(building.buildingType);
    if (constructionTime > 0) {
      building.constructionProgress += gameHoursDelta / constructionTime;
    } else {
      building.constructionProgress = 1;
    }

    if (building.constructionProgress >= 1) {
      building.constructionProgress = 1;
      building.isConstructed = true;

      // Paint terrain ownership when construction completes
      if (building.ownerId) {
        paintTerrainOwnership(building.position, TERRITORY_BUILDING_RADIUS, building.ownerId, gameState);
      }

      if (building.buildingType === BuildingType.Palisade || building.buildingType === BuildingType.Gate) {
        updateNavigationGridSector(gameState, building.position, building.radius, true, building.ownerId);
      }

      // Update planting zone connections when a planting zone completes construction
      if (building.buildingType === BuildingType.PlantingZone) {
        updatePlantingZoneConnections(gameState);
      }
    }
  }

  // Handle Bonfire Fuel Consumption
  if (building.buildingType === BuildingType.Bonfire && building.isConstructed && !building.isBeingDestroyed) {
    if (building.fuelLevel !== undefined) {
      building.fuelLevel -= gameHoursDelta * BONFIRE_FUEL_CONSUMPTION_PER_HOUR;
      if (building.fuelLevel < 0) building.fuelLevel = 0;

      // Internal Refueling: Consume wood from storage if fuel is low
      if (building.fuelLevel < (building.maxFuelLevel || 0) * BONFIRE_REFUEL_THRESHOLD) {
        const woodItemIndex = building.storedItems.findIndex(
          (si) => si.item.itemType === 'item' && si.item.type === ItemType.Wood,
        );
        if (woodItemIndex !== -1) {
          building.storedItems.splice(woodItemIndex, 1);
          building.fuelLevel = Math.min(building.maxFuelLevel || 0, building.fuelLevel + BONFIRE_FUEL_PER_WOOD);
        }
      }
    }
  }

  prepareBuildingTaskAI(building, updateContext);
}
