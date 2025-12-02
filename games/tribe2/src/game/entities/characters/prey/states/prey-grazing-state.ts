import { State } from '../../../../state-machine/state-machine-types';
import { PreyEntity } from '../prey-types';
import {
  PreyStateData,
  PREY_IDLE,
  PREY_GRAZING,
  PREY_MOVING,
} from './prey-state-types';

// Define the prey grazing state
export const preyGrazingState: State<PreyEntity, PreyStateData> = {
  id: PREY_GRAZING,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // Moving overrides grazing (includes fleeing behavior)
    if (entity.activeAction === 'moving') {
      return {
        nextState: PREY_MOVING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREY_GRAZING,
          target: entity.target,
        },
      };
    }

    // If not grazing anymore, go to idle
    if (entity.activeAction !== 'grazing') {
      return {
        nextState: PREY_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREY_GRAZING,
        },
      };
    }

    return { nextState: PREY_GRAZING, data };
  },
  onEnter: (context, nextData) => {
    // Stop moving when starting to graze
    context.entity.acceleration = 0;
    context.entity.velocity = { x: 0, y: 0 };

    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};