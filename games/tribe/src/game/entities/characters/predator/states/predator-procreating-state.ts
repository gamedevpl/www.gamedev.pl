import { State } from '../../../../state-machine/state-machine-types';
import { PredatorEntity } from '../predator-types';
import {
  PredatorStateData,
  PREDATOR_IDLE,
  PREDATOR_PROCREATING,
  PREDATOR_HUNTING,
  PREDATOR_ATTACKING,
  PREDATOR_EATING,
  PredatorHuntingStateData,
  PredatorAttackingStateData,
  PredatorEatingStateData,
} from './predator-state-types';

// Define the predator procreating state
export const predatorProcreatingState: State<PredatorEntity, PredatorStateData> = {
  id: PREDATOR_PROCREATING,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // Higher priority actions can override procreating
    if (entity.activeAction === 'eating') {
      return {
        nextState: PREDATOR_EATING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_PROCREATING,
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
          previousState: PREDATOR_PROCREATING,
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
          previousState: PREDATOR_PROCREATING,
          attackTargetId: entity.attackTargetId,
          attackStartTime: updateContext.gameState.time,
        } as PredatorAttackingStateData,
      };
    }

    // If not procreating anymore, go to idle
    if (entity.activeAction !== 'procreating') {
      return {
        nextState: PREDATOR_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_PROCREATING,
        },
      };
    }

    return { nextState: PREDATOR_PROCREATING, data };
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