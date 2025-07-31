import { State } from '../../../../state-machine/state-machine-types';
import { PredatorEntity } from '../predator-types';
import {
  PredatorStateData,
  PREDATOR_IDLE,
  PREDATOR_MOVING,
  PREDATOR_HUNTING,
  PREDATOR_ATTACKING,
  PREDATOR_PROCREATING,
  PREDATOR_EATING,
  PredatorHuntingStateData,
  PredatorAttackingStateData,
  PredatorEatingStateData,
} from './predator-state-types';

// Define the predator idle state
export const predatorIdleState: State<PredatorEntity, PredatorStateData> = {
  id: PREDATOR_IDLE,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // Eating has highest priority (when prey is caught)
    if (entity.activeAction === 'eating') {
      return {
        nextState: PREDATOR_EATING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_IDLE,
          preyId: entity.huntTargetId!, // Assume huntTargetId contains the caught prey
          eatingStartTime: updateContext.gameState.time,
        } as PredatorEatingStateData,
      };
    }

    // Hunting comes next
    if (entity.activeAction === 'hunting' && entity.huntTargetId) {
      return {
        nextState: PREDATOR_HUNTING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_IDLE,
          huntTargetId: entity.huntTargetId,
          huntStartTime: updateContext.gameState.time,
        } as PredatorHuntingStateData,
      };
    }

    // Attacking humans
    if (entity.activeAction === 'attacking' && entity.attackTargetId) {
      return {
        nextState: PREDATOR_ATTACKING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_IDLE,
          attackTargetId: entity.attackTargetId,
          attackStartTime: updateContext.gameState.time,
        } as PredatorAttackingStateData,
      };
    }

    if (entity.activeAction === 'moving') {
      return {
        nextState: PREDATOR_MOVING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_IDLE,
          target: entity.target,
        },
      };
    }

    if (entity.activeAction === 'procreating') {
      return {
        nextState: PREDATOR_PROCREATING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_IDLE,
        },
      };
    }

    return { nextState: PREDATOR_IDLE, data };
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