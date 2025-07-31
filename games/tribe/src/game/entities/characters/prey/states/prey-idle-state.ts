import { State } from '../../../../state-machine/state-machine-types';
import { PreyEntity } from '../prey-types';
import {
  PreyStateData,
  PREY_IDLE,
  PREY_MOVING,
  PREY_GRAZING,
  PREY_PROCREATING,
  PREY_FLEEING,
  PreyFleeingStateData,
} from './prey-state-types';

// Define the prey idle state
export const preyIdleState: State<PreyEntity, PreyStateData> = {
  id: PREY_IDLE,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // Fleeing has highest priority
    if (entity.activeAction === 'fleeing' && entity.fleeTargetId) {
      return {
        nextState: PREY_FLEEING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREY_IDLE,
          fleeTargetId: entity.fleeTargetId,
          fleeStartTime: updateContext.gameState.time,
        } as PreyFleeingStateData,
      };
    }

    if (entity.activeAction === 'moving') {
      return {
        nextState: PREY_MOVING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREY_IDLE,
          target: entity.target,
        },
      };
    }

    if (entity.activeAction === 'grazing') {
      return {
        nextState: PREY_GRAZING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREY_IDLE,
        },
      };
    }

    if (entity.activeAction === 'procreating') {
      return {
        nextState: PREY_PROCREATING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREY_IDLE,
        },
      };
    }

    return { nextState: PREY_IDLE, data };
  },
  onEnter: (context, nextData) => {
    // Reset acceleration and velocity when entering idle state
    context.entity.acceleration = 0;
    context.entity.velocity = { x: 0, y: 0 };

    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};