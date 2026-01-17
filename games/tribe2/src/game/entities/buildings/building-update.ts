import { UpdateContext } from '../../world-types';
import { BuildingEntity } from './building-types';
import { getBuildingConstructionTime, getBuildingDestructionTime, BuildingType, getBuildingTerritoryRadius } from './building-consts.ts';
import { removeEntity } from '../entities-update';
import { HOURS_PER_GAME_DAY, GAME_DAY_IN_REAL_SECONDS } from '../../game-consts.ts';
import { paintTerrainOwnership } from '../tribe/territory-utils';
import { updatePlantingZoneConnections } from '../../utils/planting-zone-connections-utils';
import {
  BONFIRE_FUEL_CONSUMPTION_PER_HOUR,
  BONFIRE_REFUEL_THRESHOLD,
  BONFIRE_FUEL_PER_WOOD,
} from '../../temperature/temperature-consts';
import { ItemType } from '../item-types';
import { prepareBuildingTaskAI } from '../../ai/task/buildings/building-task-update';
import { updateNavigationGridSector, NAVIGATION_AGENT_RADIUS } from '../../utils/navigation-utils';
import { addVisualEffect } from '../../utils/visual-effects-utils';
import { VisualEffectType } from '../../visual-effects/visual-effect-types';

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
        const navOwnerId = building.buildingType === BuildingType.Gate ? building.ownerId ?? null : null;
        updateNavigationGridSector(gameState, building.position, building.radius, false, navOwnerId, NAVIGATION_AGENT_RADIUS);
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
        paintTerrainOwnership(building.position, getBuildingTerritoryRadius(building.buildingType), building.ownerId, gameState);
      }

      if (building.buildingType === BuildingType.Palisade || building.buildingType === BuildingType.Gate) {
        const navOwnerId = building.buildingType === BuildingType.Gate ? building.ownerId ?? null : null;
        updateNavigationGridSector(
          gameState,
          building.position,
          building.radius,
          true,
          navOwnerId,
          NAVIGATION_AGENT_RADIUS,
        );
      }

      // Update planting zone connections when a planting zone completes construction
      if (building.buildingType === BuildingType.PlantingZone) {
        updatePlantingZoneConnections(gameState);
      }
    }
  }

  // Handle Bonfire Fuel Consumption and Visual Effects
  if (building.buildingType === BuildingType.Bonfire && building.isConstructed && !building.isBeingDestroyed) {
    if (building.fuelLevel !== undefined) {
      // Initialize fire state if undefined
      if (building.firePhase === undefined) {
        building.firePhase = 'off';
      }
      if (building.fireIntensity === undefined) {
        building.fireIntensity = 0;
      }

      // Fire phase state machine
      const LIGHTING_RATE = 2.0; // Intensity increase per game hour
      const STOPPING_RATE = 1.0; // Intensity decrease per game hour

      // Transition logic
      if (building.fuelLevel > 0 && (building.firePhase === 'off' || building.firePhase === 'stopping')) {
        building.firePhase = 'lighting';
      }

      if (building.firePhase === 'lighting') {
        building.fireIntensity += gameHoursDelta * LIGHTING_RATE;
        if (building.fireIntensity >= 1) {
          building.fireIntensity = 1;
          building.firePhase = 'burning';
        }
      } else if (building.firePhase === 'burning') {
        building.fireIntensity = 1;
        if (building.fuelLevel <= 0) {
          building.firePhase = 'stopping';
        }
      } else if (building.firePhase === 'stopping') {
        building.fireIntensity -= gameHoursDelta * STOPPING_RATE;
        if (building.fireIntensity <= 0) {
          building.fireIntensity = 0;
          building.firePhase = 'off';
        }
      }

      building.fuelLevel -= gameHoursDelta * BONFIRE_FUEL_CONSUMPTION_PER_HOUR;
      if (building.fuelLevel < 0) building.fuelLevel = 0;

      // Trigger Fire/Smoke visual effects
      if (building.fireIntensity > 0) {
        // Reduced spawn rates and increased durations for calmer effects
        if (Math.random() < gameHoursDelta * 4) {
          addVisualEffect(gameState, VisualEffectType.Fire, building.position, 0.5, building.fireIntensity);
        }
        if (Math.random() < gameHoursDelta * 2) {
          addVisualEffect(gameState, VisualEffectType.Smoke, building.position, 1.2, building.fireIntensity);
        }
      }

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
