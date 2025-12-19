import { State, StateContext, StateData, StateTransition } from '../../../../state-machine/state-machine-types';
import { TreeEntity } from '../tree-types';
import { TREE_FULL, TREE_SPREADING, TREE_DYING } from './tree-state-types';
import { isPositionOccupied, getRandomNearbyPosition } from '../../../../utils/world-utils';
import { createTree } from '../../../entities-update';

export const treeSpreadingState: State<TreeEntity, StateData> = {
  id: TREE_SPREADING,
  update: (data, context: StateContext<TreeEntity>): StateTransition => {
    const { entity, updateContext } = context;
    const { gameState } = updateContext;

    if (entity.age >= entity.lifespan) {
      return { nextState: TREE_DYING, data: { ...data, enteredAt: gameState.time, previousState: TREE_SPREADING } };
    }

    const newPosition = getRandomNearbyPosition(
      entity.position,
      entity.spreadRadius,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    // Using a check radius, e.g., 25 pixels, for trees to avoid them spawning too close.
    const SPREAD_CHECK_RADIUS = 25;
    if (!isPositionOccupied(newPosition, gameState, SPREAD_CHECK_RADIUS)) {
      createTree(gameState.entities, newPosition, gameState.time);
    }

    // Always transition back to full after attempting to spread
    return { nextState: TREE_FULL, data: { ...data, enteredAt: gameState.time, previousState: TREE_SPREADING } };
  },
  onEnter: (context: StateContext<TreeEntity>, nextData) => {
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};
