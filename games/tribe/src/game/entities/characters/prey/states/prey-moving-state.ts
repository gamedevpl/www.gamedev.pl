import { State } from '../../../../state-machine/state-machine-types';
import { PreyEntity } from '../prey-types';
import {
  PreyStateData,
  PREY_IDLE,
  PREY_MOVING,
  PREY_FLEEING,
  PreyFleeingStateData,
} from './prey-state-types';

// Define the prey moving state
export const preyMovingState: State<PreyEntity, PreyStateData> = {
  id: PREY_MOVING,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // Fleeing overrides moving
    if (entity.activeAction === 'fleeing' && entity.fleeTargetId) {
      return {
        nextState: PREY_FLEEING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREY_MOVING,
          fleeTargetId: entity.fleeTargetId,
          fleeStartTime: updateContext.gameState.time,
        } as PreyFleeingStateData,
      };
    }

    // If not moving anymore, go to idle
    if (entity.activeAction !== 'moving') {
      return {
        nextState: PREY_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREY_MOVING,
        },
      };
    }

    return { nextState: PREY_MOVING, data };
  },
  onEnter: (context, nextData) => {
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};