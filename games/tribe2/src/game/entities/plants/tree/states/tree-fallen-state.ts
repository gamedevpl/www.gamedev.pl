import { State, StateData } from '../../../../state-machine/state-machine-types';
import { TreeEntity } from '../tree-types';
import { TREE_FALLEN, TREE_STUMP } from './tree-state-types';
import { TREE_FALLEN_DECAY_HOURS } from '../tree-consts';

export const treeFallenState: State<TreeEntity, StateData> = {
  id: TREE_FALLEN,
  update: (data, context) => {
    const { updateContext } = context;
    const timeInState = updateContext.gameState.time - data.enteredAt;

    if (timeInState >= TREE_FALLEN_DECAY_HOURS) {
      return {
        nextState: TREE_STUMP,
        data: {
          enteredAt: updateContext.gameState.time,
          previousState: TREE_FALLEN,
        },
      };
    }

    return { nextState: TREE_FALLEN, data };
  },
};
