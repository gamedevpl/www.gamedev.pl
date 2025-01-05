import { PreyEntity } from '../../../entities/entities-types';
import { BaseStateData, State } from '../../state-machine-types';
import { shouldFlee } from './prey-state-utils';

// Constants for movement behavior
const MAX_SPEED_VARIATION = 0.005;
const BASE_ACCELERATION = 0.005;

/**
 * State data interface for prey moving state
 */
export interface PreyMovingStateData extends BaseStateData {
  lastDirectionChange?: number;
}

/**
 * Prey moving state implementation
 */
export const PREY_MOVING_STATE: State<PreyEntity, PreyMovingStateData> = {
  id: 'PREY_MOVING',

  update: (data, context) => {
    const { entity } = context;

    // Check for fleeing condition
    if (shouldFlee(entity, context)) {
      return {
        nextState: 'PREY_FLEEING',
        data: {
          enteredAt: context.updateContext.gameState.time,
        },
      };
    }

    // Check for critical needs
    if (entity.thirstLevel < 30) {
      return {
        nextState: 'PREY_DRINKING',
        data: {
          enteredAt: context.updateContext.gameState.time,
        },
      };
    }

    if (entity.hungerLevel < 30 && entity.thirstLevel >= 30) {
      return {
        nextState: 'PREY_EATING',
        data: {
          enteredAt: context.updateContext.gameState.time,
        },
      };
    }

    const now = context.updateContext.gameState.time;

    if (now - data.enteredAt > 5000) {
      return { nextState: 'PREY_IDLE', data: { enteredAt: context.updateContext.gameState.time } };
    }
    // Update movement
    if (!data.lastDirectionChange || now - data.lastDirectionChange > 100) {
      const angleChange = ((Math.random() - 0.5) * Math.PI) / 2;
      entity.targetDirection += angleChange / 10;
      data.lastDirectionChange = now;
    }

    // Update acceleration with random variation
    entity.acceleration = BASE_ACCELERATION * (1 + (Math.random() - 0.5) * MAX_SPEED_VARIATION);

    return {
      nextState: 'PREY_MOVING',
      data: {
        ...data,
        lastDirectionChange: data.lastDirectionChange,
      },
    };
  },

  onEnter: (context) => ({
    enteredAt: context.updateContext.gameState.time,
    lastDirectionChange: context.updateContext.gameState.time,
  }),
};
