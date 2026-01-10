import { State, StateContext } from '../../../../state-machine/state-machine-types';
import { HumanEntity } from '../human-types';
import { HumanDismantlingStateData, HUMAN_DISMANTLING, HUMAN_IDLE } from './human-state-types';

class HumanDismantlingState implements State<HumanEntity, HumanDismantlingStateData> {
  id = HUMAN_DISMANTLING;

  update(data: HumanDismantlingStateData, context: StateContext<HumanEntity>) {
    const { entity, updateContext } = context;

    if (entity.activeAction !== 'dismantling') {
      // If the human is no longer dismantling, return to idle state
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

  onEnter(context: StateContext<HumanEntity>, nextData: HumanDismantlingStateData) {
    // Stop movement
    context.entity.acceleration = 0;
    context.entity.velocity = { x: 0, y: 0 };

    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  }
}

export const humanDismantlingState: State<HumanEntity, HumanDismantlingStateData> = new HumanDismantlingState();
