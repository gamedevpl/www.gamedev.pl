import { State } from '../../../../state-machine/state-machine-types';
import { removeEntity } from '../../../entities-update';
import { HumanEntity } from '../human-types';
import { HumanDyingStateData, HUMAN_DYING } from './human-state-types';

// Define the human dying state
export const humanDyingState: State<HumanEntity, HumanDyingStateData> = {
  id: HUMAN_DYING,
  update: (data) => {
    // The entity is removed, so no meaningful state transition for it.
    // The entityUpdate loop might skip it in the next tick if removal is immediate.
    // For safety, we return the current state, but it should not be processed further.
    return { nextState: HUMAN_DYING, data };
  },
  onEnter: (context, nextData) => {
    const dyingData = nextData;

    // Set game over if this is the player and there are no offspring
    if (context.entity.isPlayer) {
      context.updateContext.gameState.gameOver = true;
      context.updateContext.gameState.causeOfGameOver = dyingData.cause;
    }

    // Remove the entity
    removeEntity(context.updateContext.gameState.entities, context.entity.id);

    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};
