import { BaseStateData, State, StateContext, StateTransition } from '../../state-machine-types';
import { LionEntity } from '../../../entities/entities-types';
import { vectorDistance } from '../../../utils/math-utils';
import { getCarrion } from '../../../game-world-query';
import { MAX_EATING_DISTANCE } from '../../../game-world-consts';

/**
 * Lion eating state definition
 */
export const LION_EATING_STATE: State<LionEntity, BaseStateData> = {
  id: 'LION_EATING',

  update: (data: BaseStateData, context: StateContext<LionEntity>): StateTransition => {
    // check if interacting with a carrion entity
    const carrion = getCarrion(context.updateContext.gameState).filter((c) => {
      const distance = vectorDistance(context.entity.position, c.position);
      return distance < MAX_EATING_DISTANCE && c.food > 0;
    });

    if (carrion.length === 0) {
      return {
        nextState: 'LION_IDLE',
        data: {
          enteredAt: context.updateContext.gameState.time,
        },
      };
    } else {
      return { nextState: 'LION_IDLE', data };
    }
  },
};
