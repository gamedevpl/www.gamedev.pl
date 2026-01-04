import { State, StateContext, StateData, StateTransition } from '../../../../state-machine/state-machine-types';
import { TreeEntity } from '../tree-types';
import { TREE_DYING } from './tree-state-types';
import { removeEntity } from '../../../entities-update';

export const treeDyingState: State<TreeEntity, StateData> = {
  id: TREE_DYING,
  update: (data): StateTransition => {
    // The entity is removed, so no meaningful state transition for it.
    return { nextState: TREE_DYING, data };
  },
  onEnter: (context: StateContext<TreeEntity>, nextData) => {
    removeEntity(context.updateContext.gameState.entities, context.entity.id);
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};
