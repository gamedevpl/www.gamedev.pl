import { State, StateContext, StateTransition } from '../../../../state-machine/state-machine-types';
import { BerryBushEntity } from '../berry-bush-types';
import { BushDyingStateData, BUSH_DYING } from './bush-state-types';
import { removeEntity } from '../../../entities-update'; // Adjusted path

export const bushDyingState: State<BerryBushEntity, BushDyingStateData> = {
  id: BUSH_DYING,
  update: (data: BushDyingStateData): StateTransition => {
    // The entity is removed, so no meaningful state transition for it.
    // The entityUpdate loop might skip it in the next tick if removal is immediate.
    // For safety, we return the current state, but it should not be processed further.
    return { nextState: BUSH_DYING, data };
  },
  onEnter: (context: StateContext<BerryBushEntity>, nextData: BushDyingStateData): BushDyingStateData => {
    // Perform removal on entering the dying state
    removeEntity(context.updateContext.gameState.entities, context.entity.id);
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};
