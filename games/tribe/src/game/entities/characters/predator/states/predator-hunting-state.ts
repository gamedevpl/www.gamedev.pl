import { State } from '../../../../state-machine/state-machine-types';
import { PredatorEntity } from '../predator-types';
import {
  PredatorStateData,
  PREDATOR_IDLE,
  PREDATOR_HUNTING,
  PREDATOR_EATING,
  PredatorHuntingStateData,
  PredatorEatingStateData,
} from './predator-state-types';

// Define the predator hunting state
export const predatorHuntingState: State<PredatorEntity, PredatorStateData> = {
  id: PREDATOR_HUNTING,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // If successfully caught prey, switch to eating
    if (entity.activeAction === 'eating') {
      return {
        nextState: PREDATOR_EATING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_HUNTING,
          preyId: entity.huntTargetId!,
          eatingStartTime: updateContext.gameState.time,
        } as PredatorEatingStateData,
      };
    }

    // If not hunting anymore, go to idle
    if (entity.activeAction !== 'hunting') {
      return {
        nextState: PREDATOR_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_HUNTING,
        },
      };
    }

    return { nextState: PREDATOR_HUNTING, data: data as PredatorHuntingStateData };
  },
  onEnter: (context, nextData) => {
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};