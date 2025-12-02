import { State } from '../../../../state-machine/state-machine-types';
import { PreyEntity } from '../prey-types';
import {
  PreyStateData,
  PREY_IDLE,
  PREY_PROCREATING,
  PREY_MOVING,
} from './prey-state-types';

// Define the prey procreating state
export const preyProcreatingState: State<PreyEntity, PreyStateData> = {
  id: PREY_PROCREATING,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // Moving overrides procreating (includes fleeing behavior)
    if (entity.activeAction === 'moving') {
      return {
        nextState: PREY_MOVING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREY_PROCREATING,
          target: entity.target,
        },
      };
    }

    // If not procreating anymore, go to idle
    if (entity.activeAction !== 'procreating') {
      return {
        nextState: PREY_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREY_PROCREATING,
        },
      };
    }

    return { nextState: PREY_PROCREATING, data };
  },
  onEnter: (context, nextData) => {
    // Stop moving when starting to procreate
    context.entity.acceleration = 0;
    context.entity.velocity = { x: 0, y: 0 };

    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};