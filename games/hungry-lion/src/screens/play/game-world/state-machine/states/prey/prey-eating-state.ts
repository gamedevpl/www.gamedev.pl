import { PreyEntity } from '../../../entities/entities-types';
import { BaseStateData, State } from '../../state-machine-types';
import { findClosestSector, getSectorAtEntity } from '../../../environment/environment-query';
import { shouldFlee } from './prey-state-utils';

// Constants
const MAX_SPEED_VARIATION = 0.005;
const BASE_ACCELERATION = 0.005;
const HUNGER_SATISFIED_THRESHOLD = 90;

/**
 * State data interface for prey eating state
 */
export interface PreyEatingStateData extends BaseStateData {
  lastSectorCheck?: number;
}

/**
 * Prey eating state implementation
 */
export const PREY_EATING_STATE: State<PreyEntity, PreyEatingStateData> = {
  id: 'PREY_EATING',

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

    // Check if hunger is satisfied
    if (entity.hungerLevel >= HUNGER_SATISFIED_THRESHOLD) {
      return {
        nextState: 'PREY_IDLE',
        data: {
          enteredAt: context.updateContext.gameState.time,
        },
      };
    }

    // Check if prey is in a grass sector
    const sector = getSectorAtEntity(updateContext.gameState.environment, entity, 'grass');

    if (!sector) {
      // If not in grass sector, find and move towards closest grass
      const [closestSector] = findClosestSector(updateContext.gameState.environment, entity, 'grass');

      if (closestSector) {
        // Calculate target position (center of sector)
        const targetX = closestSector.rect.x + closestSector.rect.width / 2;
        const targetY = closestSector.rect.y + closestSector.rect.height / 2;

        // Update movement towards grass
        entity.targetDirection = Math.atan2(targetY - entity.position.y, targetX - entity.position.x);
        entity.acceleration = BASE_ACCELERATION * (1 + (Math.random() - 0.5) * MAX_SPEED_VARIATION);
      } else {
        // No grass found, return to idle
        return {
          nextState: 'PREY_IDLE',
          data: {
            enteredAt: context.updateContext.gameState.time,
          },
        };
      }
    } else {
      // In grass sector, stop moving and eat
      entity.acceleration = 0;
    }

    return {
      nextState: 'PREY_EATING',
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
