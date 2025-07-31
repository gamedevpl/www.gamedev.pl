import { State } from '../../../../state-machine/state-machine-types';
import { PredatorEntity } from '../predator-types';
import {
  PredatorStateData,
  PREDATOR_IDLE,
  PREDATOR_MOVING,
  PREDATOR_HUNTING,
  PREDATOR_ATTACKING,
  PREDATOR_EATING,
  PredatorHuntingStateData,
  PredatorAttackingStateData,
  PredatorEatingStateData,
} from './predator-state-types';

// Define the predator moving state
export const predatorMovingState: State<PredatorEntity, PredatorStateData> = {
  id: PREDATOR_MOVING,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // Higher priority actions override moving
    if (entity.activeAction === 'eating') {
      return {
        nextState: PREDATOR_EATING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_MOVING,
          preyId: entity.huntTargetId!,
          eatingStartTime: updateContext.gameState.time,
        } as PredatorEatingStateData,
      };
    }

    if (entity.activeAction === 'hunting' && entity.huntTargetId) {
      return {
        nextState: PREDATOR_HUNTING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_MOVING,
          huntTargetId: entity.huntTargetId,
          huntStartTime: updateContext.gameState.time,
        } as PredatorHuntingStateData,
      };
    }

    if (entity.activeAction === 'attacking' && entity.attackTargetId) {
      return {
        nextState: PREDATOR_ATTACKING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_MOVING,
          attackTargetId: entity.attackTargetId,
          attackStartTime: updateContext.gameState.time,
        } as PredatorAttackingStateData,
      };
    }

    // If not moving anymore, go to idle
    if (entity.activeAction !== 'moving') {
      return {
        nextState: PREDATOR_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_MOVING,
        },
      };
    }

    return { nextState: PREDATOR_MOVING, data };
  },
  onEnter: (context, nextData) => {
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};