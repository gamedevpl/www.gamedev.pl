import { State } from '../../../../state-machine/state-machine-types';
import { PreyEntity } from '../prey-types';
import {
  PreyStateData,
  PREY_IDLE,
  PREY_PROCREATING,
  PREY_FLEEING,
  PreyFleeingStateData,
} from './prey-state-types';

// Define the prey procreating state
export const preyProcreatingState: State<PreyEntity, PreyStateData> = {
  id: PREY_PROCREATING,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // Fleeing overrides procreating
    if (entity.activeAction === 'fleeing' && entity.fleeTargetId) {
      return {
        nextState: PREY_FLEEING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREY_PROCREATING,
          fleeTargetId: entity.fleeTargetId,
          fleeStartTime: updateContext.gameState.time,
        } as PreyFleeingStateData,
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