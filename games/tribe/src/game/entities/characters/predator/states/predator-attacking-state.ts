import { State } from '../../../../state-machine/state-machine-types';
import { PredatorEntity } from '../predator-types';
import {
  PredatorStateData,
  PREDATOR_IDLE,
  PREDATOR_ATTACKING,
  PREDATOR_EATING,
  PredatorAttackingStateData,
  PredatorEatingStateData,
} from './predator-state-types';

// Define the predator attacking state
export const predatorAttackingState: State<PredatorEntity, PredatorStateData> = {
  id: PREDATOR_ATTACKING,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // If found food (prey), prioritize eating
    if (entity.activeAction === 'eating') {
      return {
        nextState: PREDATOR_EATING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_ATTACKING,
          preyId: entity.attackTargetId!,
          eatingStartTime: updateContext.gameState.time,
        } as PredatorEatingStateData,
      };
    }

    // If not attacking anymore, go to idle
    if (entity.activeAction !== 'attacking') {
      return {
        nextState: PREDATOR_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_ATTACKING,
        },
      };
    }

    return { nextState: PREDATOR_ATTACKING, data: data as PredatorAttackingStateData };
  },
  onEnter: (context, nextData) => {
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};