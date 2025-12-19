import { State, StateData } from '../../../../state-machine/state-machine-types';
import { TreeEntity } from '../tree-types';
import { TREE_GROWTH_TIME_GAME_HOURS } from '../tree-consts';
import { TREE_FULL, TREE_GROWING, TREE_DYING } from './tree-state-types';
import { HOURS_PER_GAME_DAY, GAME_DAY_IN_REAL_SECONDS } from '../../../../game-consts';

export const treeGrowingState: State<TreeEntity, StateData> = {
  id: TREE_GROWING,
  update: (data, context) => {
    const { entity, updateContext } = context;
    const gameHoursDelta = updateContext.deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);
    entity.age += gameHoursDelta;

    if (entity.age >= entity.lifespan) {
      return {
        nextState: TREE_DYING,
        data: {
          enteredAt: updateContext.gameState.time,
          previousState: TREE_GROWING,
        },
      };
    }

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
