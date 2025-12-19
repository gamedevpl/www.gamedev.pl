import { State, StateData } from '../../../../state-machine/state-machine-types';
import { TreeEntity } from '../tree-types';
import { TREE_FULL, TREE_SPREADING, TREE_DYING } from './tree-state-types';
import { HOURS_PER_GAME_DAY, GAME_DAY_IN_REAL_SECONDS } from '../../../../game-consts';
import { TREE_SPREAD_COOLDOWN_HOURS, TREE_SPREAD_CHANCE } from '../tree-consts';

export const treeFullState: State<TreeEntity, StateData> = {
  id: TREE_FULL,
  update: (data, context) => {
    const { entity, updateContext } = context;
    const gameHoursDelta = updateContext.deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);

    if (entity.age >= entity.lifespan) {
      return {
        nextState: TREE_DYING,
        data: { ...data, enteredAt: updateContext.gameState.time, previousState: TREE_FULL },
      };
    }

    entity.timeSinceLastSpreadAttempt += gameHoursDelta;
    if (entity.timeSinceLastSpreadAttempt >= TREE_SPREAD_COOLDOWN_HOURS) {
      entity.timeSinceLastSpreadAttempt = 0;

      if (Math.random() < TREE_SPREAD_CHANCE) {
        return {
          nextState: TREE_SPREADING,
          data: { ...data, enteredAt: updateContext.gameState.time, previousState: TREE_FULL },
        };
      }
    }

    // Remain in full state
    return { nextState: TREE_FULL, data };
  },
};
