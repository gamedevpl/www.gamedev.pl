import { PreyEntity } from '../../../entities/entities-types';
import { metricsAggregator } from '../../../../../../utils/metrics/metrics-aggregator';
import { BaseStateData, State } from '../../state-machine-types';
import { shouldFlee, updateFleeing } from './prey-state-utils';

const MIN_FLEE_TIME = 5000;

/**
 * State data interface for prey fleeing state
 */
export type PreyFleeingStateData = BaseStateData;

/**
 * Prey fleeing state implementation
 */
export const PREY_FLEEING_STATE: State<PreyEntity, PreyFleeingStateData> = {
  id: 'PREY_FLEEING',

  update: (data, context) => {
    const { entity } = context;
    const currentTime = context.updateContext.gameState.time;
    if (data.enteredAt === currentTime) {
      metricsAggregator.recordFleeEvent();
    }
    const timeInState = currentTime - data.enteredAt;

    // Only consider stopping fleeing after minimum flee time
    if (timeInState > MIN_FLEE_TIME && !shouldFlee(entity, context)) {
      return {
        nextState: 'PREY_IDLE',
        data: {
          enteredAt: currentTime,
        },
      };
    }

    // Update fleeing behavior (direction and acceleration)
    updateFleeing(entity, context);

    return {
      nextState: 'PREY_FLEEING',
      data,
    };
  },

  onEnter: (context) => ({
    enteredAt: context.updateContext.gameState.time,
    MIN_FLEE_TIME: 5000,
  }),
};
