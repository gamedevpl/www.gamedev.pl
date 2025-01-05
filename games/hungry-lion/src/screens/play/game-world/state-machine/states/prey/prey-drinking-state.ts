import { PreyEntity } from '../../../entities/entities-types';
import { BaseStateData, State } from '../../state-machine-types';
import { findClosestSector, getSectorAtEntity } from '../../../environment/environment-query';
import { shouldFlee } from './prey-state-utils';

// Constants
const MAX_SPEED_VARIATION = 0.005;
const BASE_ACCELERATION = 0.005;
const THIRST_SATISFIED_THRESHOLD = 90;

/**
 * State data interface for prey drinking state
 */
export interface PreyDrinkingStateData extends BaseStateData {
  lastSectorCheck?: number;
}

/**
 * Prey drinking state implementation
 */
export const PREY_DRINKING_STATE: State<PreyEntity, PreyDrinkingStateData> = {
  id: 'PREY_DRINKING',

  update: (data, context) => {
    const { entity, updateContext } = context;

    // Check for fleeing condition - survival takes priority
    if (shouldFlee(entity, context)) {
      return {
        nextState: 'PREY_FLEEING',
        data: {
          enteredAt: context.updateContext.gameState.time,
        },
      };
    }

    // Check if thirst is satisfied
    if (entity.thirstLevel >= THIRST_SATISFIED_THRESHOLD) {
      return {
        nextState: 'PREY_IDLE',
        data: {
          enteredAt: context.updateContext.gameState.time,
        },
      };
    }

    // Check if prey is in a water sector
    const sector = getSectorAtEntity(updateContext.gameState.environment, entity, 'water');

    if (!sector) {
      // If not in water sector, find and move towards closest water
      const [closestSector] = findClosestSector(updateContext.gameState.environment, entity, 'water');

      if (closestSector) {
        // Calculate target position (center of sector)
        const targetX = closestSector.rect.x + closestSector.rect.width / 2;
        const targetY = closestSector.rect.y + closestSector.rect.height / 2;

        // Update movement towards water
        entity.targetDirection = Math.atan2(targetY - entity.position.y, targetX - entity.position.x);
        entity.acceleration = BASE_ACCELERATION * (1 + (Math.random() - 0.5) * MAX_SPEED_VARIATION);
      } else {
        // No water found, return to idle
        return {
          nextState: 'PREY_IDLE',
          data: {
            enteredAt: context.updateContext.gameState.time,
          },
        };
      }
    } else {
      // In water sector, stop moving and drink
      entity.acceleration = 0;
    }

    return {
      nextState: 'PREY_DRINKING',
      data: {
        ...data,
        lastSectorCheck: context.updateContext.gameState.time,
      },
    };
  },

  onEnter: (context) => ({
    enteredAt: context.updateContext.gameState.time,
    lastSectorCheck: context.updateContext.gameState.time,
  }),
};
