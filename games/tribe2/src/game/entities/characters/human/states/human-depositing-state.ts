import { State, StateTransition } from '../../../../state-machine/state-machine-types';
import { HumanEntity } from '../human-types';
import { HumanDepositingStateData, HUMAN_DEPOSITING, HUMAN_IDLE } from './human-state-types';

/**
 * State for when a human is depositing food into storage.
 * This state is active during the deposit interaction.
 */
export const humanDepositingState: State<HumanEntity, HumanDepositingStateData> = {
  id: HUMAN_DEPOSITING,

  update: (data: HumanDepositingStateData, context): StateTransition<HumanDepositingStateData> => {
    const { entity: human } = context;

    // If the human is no longer performing the depositing action, transition to idle
    if (human.activeAction !== 'depositing') {
      return {
        nextState: HUMAN_IDLE,
        data: {
          ...data,
          enteredAt: context.updateContext.gameState.time,
          previousState: HUMAN_DEPOSITING,
        },
      };
    }

    // Continue depositing
    return {
      nextState: HUMAN_DEPOSITING,
      data,
    };
  },

  onEnter: (context, nextData) => {
    const { entity: human } = context;
    human.activeAction = 'depositing';
    return nextData;
  },

  onExit: (context) => {
    const { entity: human } = context;
    if (human.activeAction === 'depositing') {
      human.activeAction = 'idle';
    }
  },
};
