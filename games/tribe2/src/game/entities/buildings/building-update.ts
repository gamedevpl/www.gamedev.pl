import { UpdateContext } from '../../world-types';
import { BuildingEntity } from './building-types';
import { getBuildingConstructionTime, getBuildingDestructionTime } from '../../building-consts';
import { removeEntity } from '../entities-update';
import { HOURS_PER_GAME_DAY, GAME_DAY_IN_REAL_SECONDS } from '../../game-consts.ts';

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
      removeEntity(gameState.entities, building.id);
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
      // Triggers or effects on completion could be added here
    }
  }
}
