import { PreyEntity } from '../../../entities/entities-types';
import { BaseStateData, State } from '../../state-machine-types';
import { shouldFlee } from './prey-state-utils';

// Constants
const IDLE_CHANCE = 0.5;

/**
 * State data interface for prey idle state
 */
export type PreyIdleStateData = BaseStateData;

/**
 * Prey idle state implementation
 */
export const PREY_IDLE_STATE: State<PreyEntity, PreyIdleStateData> = {
  id: 'PREY_IDLE',

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

    // Randomly transition to moving state
    if (Math.random() > IDLE_CHANCE && context.updateContext.gameState.time - data.enteredAt > 5000) {
      entity.targetDirection = Math.random() * Math.PI * 2;
      return {
        nextState: 'PREY_MOVING',
        data: {
          enteredAt: context.updateContext.gameState.time,
        },
      };
    }

    // Stay idle
    entity.acceleration = 0;
    return { nextState: 'PREY_IDLE', data };
  },

  onEnter: (context) => ({
    enteredAt: context.updateContext.gameState.time,
  }),
};
