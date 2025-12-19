import { State, StateData } from '../../../../state-machine/state-machine-types';
import { TreeEntity } from '../tree-types';
import { TREE_FULL } from './tree-state-types';

export const treeFullState: State<TreeEntity, StateData> = {
  id: TREE_FULL,
  update: (data) => {
    // Currently, the full state is a terminal state for this implementation phase.
    // Future logic for dying or other interactions can be added here.

    // Remain in full state
    return { nextState: TREE_FULL, data };
  },
};
