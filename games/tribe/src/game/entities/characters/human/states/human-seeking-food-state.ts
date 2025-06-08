import { State, StateContext } from '../../../../state-machine/state-machine-types';
import { HumanEntity } from '../human-types';
import { HumanSeekingFoodStateData, HUMAN_SEEKING_FOOD, HUMAN_IDLE } from './human-state-types';

class HumanSeekingFoodState implements State<HumanEntity, HumanSeekingFoodStateData> {
  id = HUMAN_SEEKING_FOOD;

  update(data: HumanSeekingFoodStateData, context: StateContext<HumanEntity>) {
    if (context.entity.activeAction !== 'seekingFood') {
      // If the human is no longer seeking food, return to idle state
      return {
        nextState: HUMAN_IDLE,
        data: {
          ...data,
          enteredAt: context.updateContext.gameState.time,
          previousState: this.id,
        },
      };
    }

    // The core logic for seeking food (e.g., moving towards a parent)
    // is handled by the AI strategy. This state is primarily for
    // ensuring the child remains in a 'seeking food' mode.
    return {
      nextState: this.id,
      data: data,
    };
  }
}

export const humanSeekingFoodState: State<HumanEntity, HumanSeekingFoodStateData> = new HumanSeekingFoodState();
