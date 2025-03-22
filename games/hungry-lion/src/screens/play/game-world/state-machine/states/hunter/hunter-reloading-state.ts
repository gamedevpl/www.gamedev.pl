import { HunterEntity, LionEntity } from '../../../entities/entities-types';
import { getEntityById } from '../../../game-world-query';
import { vectorDistance } from '../../../utils/math-utils';
import { BaseStateData, State } from '../../state-machine-types';

// Constants for reloading behavior
const DEFAULT_AMMUNITION = 5; // Default ammunition to reload
const MAX_SHOOTING_DISTANCE = 200; // Maximum distance for shooting

// Define state data interface
export interface HunterReloadingStateData extends BaseStateData {
  reloadStartTime: number;
}

// Hunter reloading state definition
export const HUNTER_RELOADING_STATE: State<HunterEntity, HunterReloadingStateData> = {
  id: 'HUNTER_RELOADING',

  update: (data, context) => {
    const { entity, updateContext } = context;
    const currentTime = updateContext.gameState.time;
    const timeSpentReloading = currentTime - data.reloadStartTime;

    // Check if reload is complete
    if (timeSpentReloading >= entity.reloadTime) {
      // Reload complete, replenish ammunition
      entity.ammunition = DEFAULT_AMMUNITION;

      // Check if target lion still exists
      const targetLion = entity.targetLionId
        ? (getEntityById(updateContext.gameState, entity.targetLionId) as LionEntity | undefined)
        : undefined;

      // If no target or target is not a lion, go back to patrolling
      if (!targetLion || targetLion.type !== 'lion') {
        entity.targetLionId = undefined;
        return {
          nextState: 'HUNTER_PATROLLING',
          data: {
            enteredAt: currentTime,
            previousState: 'HUNTER_RELOADING',
            targetPosition: null,
          },
        };
      }

      // Calculate distance to target
      const distanceToTarget = vectorDistance(entity.position, targetLion.position);

      // If target is in shooting range, go back to shooting
      if (distanceToTarget <= MAX_SHOOTING_DISTANCE) {
        return {
          nextState: 'HUNTER_SHOOTING',
          data: {
            enteredAt: currentTime,
            previousState: 'HUNTER_RELOADING',
          },
        };
      } else {
        // Otherwise, chase the target
        return {
          nextState: 'HUNTER_CHASING',
          data: {
            enteredAt: currentTime,
            previousState: 'HUNTER_RELOADING',
          },
        };
      }
    }

    // Continue reloading
    return {
      nextState: 'HUNTER_RELOADING',
      data,
    };
  },

  onEnter: (context, data) => {
    const { entity, updateContext } = context;

    // Stop movement
    entity.acceleration = 0;
    entity.velocity = { x: 0, y: 0 };

    // Set reload start time
    return {
      enteredAt: data.enteredAt,
      previousState: data.previousState,
      reloadStartTime: updateContext.gameState.time,
    };
  },

  onExit: (context) => {
    // Reset last shot time when exiting reload state
    const { entity, updateContext } = context;
    entity.lastShotTime = updateContext.gameState.time;
  },
};
