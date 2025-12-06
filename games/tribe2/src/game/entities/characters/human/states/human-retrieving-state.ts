import { State, StateTransition } from '../../../../state-machine/state-machine-types';
import { HumanEntity } from '../human-types';
import { HumanRetrievingStateData, HUMAN_RETRIEVING, HUMAN_IDLE } from './human-state-types';

/**
 * State for when a human is retrieving food from storage.
 * This state is active during the retrieve interaction.
 */
export const humanRetrievingState: State<HumanEntity, HumanRetrievingStateData> = {
  id: HUMAN_RETRIEVING,

  update: (data: HumanRetrievingStateData, context): StateTransition<HumanRetrievingStateData> => {
    const { entity: human } = context;

    // If the human is no longer performing the retrieving action, transition to idle
    if (human.activeAction !== 'retrieving') {
      return {
        nextState: HUMAN_IDLE,
        data: {
          ...data,
          enteredAt: context.updateContext.gameState.time,
          previousState: HUMAN_RETRIEVING,
        },
      };
    }

    // Continue retrieving
    return {
      nextState: HUMAN_RETRIEVING,
      data,
    };
  },

  onEnter: (context, nextData) => {
    const { entity: human } = context;
    human.activeAction = 'retrieving';
    return nextData;
  },

  onExit: (context) => {
    const { entity: human } = context;
    if (human.activeAction === 'retrieving') {
      human.activeAction = 'idle';
    }
  },
};
