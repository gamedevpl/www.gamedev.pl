import { State } from '../../../../state-machine/state-machine-types';
import { PredatorEntity } from '../predator-types';
import {
  PredatorStateData,
  PREDATOR_IDLE,
  PREDATOR_EATING,
  PredatorEatingStateData,
} from './predator-state-types';

// Define the predator eating state
export const predatorEatingState: State<PredatorEntity, PredatorStateData> = {
  id: PREDATOR_EATING,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // If not eating anymore, go to idle
    if (entity.activeAction !== 'eating') {
      return {
        nextState: PREDATOR_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREDATOR_EATING,
        },
      };
    }

    return { nextState: PREDATOR_EATING, data: data as PredatorEatingStateData };
  },
  onEnter: (context, nextData) => {
    // Stop moving when eating
    context.entity.acceleration = 0;
    context.entity.velocity = { x: 0, y: 0 };

    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};