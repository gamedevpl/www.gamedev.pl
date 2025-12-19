import { State, StateData } from '../../../../state-machine/state-machine-types';
import { TreeEntity } from '../tree-types';
import { TREE_GROWTH_TIME_GAME_HOURS } from '../tree-consts';
import { TREE_FULL, TREE_GROWING } from './tree-state-types';

export const treeGrowingState: State<TreeEntity, StateData> = {
  id: TREE_GROWING,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // Check if the tree has finished growing
    if (entity.age >= TREE_GROWTH_TIME_GAME_HOURS) {
      return {
        nextState: TREE_FULL,
        data: {
          enteredAt: updateContext.gameState.time,
          previousState: TREE_GROWING,
        },
      };
    }

    // Remain in growing state
    return { nextState: TREE_GROWING, data };
  },
};
