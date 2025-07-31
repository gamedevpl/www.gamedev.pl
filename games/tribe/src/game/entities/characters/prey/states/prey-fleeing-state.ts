import { State } from '../../../../state-machine/state-machine-types';
import { PreyEntity } from '../prey-types';
import {
  PreyStateData,
  PREY_IDLE,
  PREY_FLEEING,
  PreyFleeingStateData,
} from './prey-state-types';

// Define the prey fleeing state
export const preyFleeingState: State<PreyEntity, PreyStateData> = {
  id: PREY_FLEEING,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // If not fleeing anymore, go to idle
    if (entity.activeAction !== 'fleeing') {
      return {
        nextState: PREY_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: PREY_FLEEING,
        },
      };
    }

    return { nextState: PREY_FLEEING, data: data as PreyFleeingStateData };
  },
  onEnter: (context, nextData) => {
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};