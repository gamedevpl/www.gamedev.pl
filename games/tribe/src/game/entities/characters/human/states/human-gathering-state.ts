import { State, StateContext } from '../../../../state-machine/state-machine-types';
import { HumanEntity } from '../human-types';
import { HumanGatheringStateData, HUMAN_GATHERING } from './human-state-types';

class HumanGatheringState implements State<HumanEntity, HumanGatheringStateData> {
  id = HUMAN_GATHERING;

  update(data: HumanGatheringStateData, context: StateContext<HumanEntity>) {
    if (context.entity.activeAction !== 'gathering') {
      // If the human is no longer gathering, return to idle state
      return {
        nextState: 'humanIdle',
        data: {
          ...data,
          enteredAt: context.updateContext.gameState.time,
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

export const humanGatheringState: State<HumanEntity, HumanGatheringStateData> = new HumanGatheringState();
