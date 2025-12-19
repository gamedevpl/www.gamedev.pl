import { State, StateContext } from '../../../../state-machine/state-machine-types';
import { HumanEntity } from '../human-types';
import { HumanChoppingStateData, HUMAN_CHOPPING, HUMAN_IDLE } from './human-state-types';

class HumanChoppingState implements State<HumanEntity, HumanChoppingStateData> {
  id = HUMAN_CHOPPING;

  update(data: HumanChoppingStateData, context: StateContext<HumanEntity>) {
    const { entity, updateContext } = context;

    if (entity.activeAction !== 'chopping' || entity.heldItem) {
      // If the human is no longer chopping or has successfully gathered an item, return to idle state
      return {
        nextState: HUMAN_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: this.id,
        },
      };
    }

    return {
      nextState: this.id,
      data: data,
    };
  }
}

export const humanChoppingState: State<HumanEntity, HumanChoppingStateData> = new HumanChoppingState();
