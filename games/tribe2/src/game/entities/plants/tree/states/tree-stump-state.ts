import { State, StateData } from '../../../../state-machine/state-machine-types';
import { TreeEntity } from '../tree-types';
import { TREE_STUMP, TREE_DYING } from './tree-state-types';
import { TREE_STUMP_DECAY_HOURS } from '../tree-consts';

export const treeStumpState: State<TreeEntity, StateData> = {
  id: TREE_STUMP,
  update: (data, context) => {
    const { updateContext } = context;
    const timeInState = updateContext.gameState.time - data.enteredAt;

    if (timeInState >= TREE_STUMP_DECAY_HOURS) {
      return {
        nextState: TREE_DYING,
        data: {
          enteredAt: updateContext.gameState.time,
          previousState: TREE_STUMP,
        },
      };
    }

    return { nextState: TREE_STUMP, data };
  },
};
