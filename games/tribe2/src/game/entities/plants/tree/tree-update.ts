import { TreeEntity } from './tree-types';
import { UpdateContext } from '../../../world-types';
import { HOURS_PER_GAME_DAY, GAME_DAY_IN_REAL_SECONDS } from '../../../game-consts';
import { TREE_RADIUS, TREE_GROWTH_TIME_GAME_HOURS, TREE_MAX_WOOD } from './tree-consts';
import { ItemType } from '../../item-types';
import { TREE_FALLEN, TREE_STUMP, TREE_DYING } from './states/tree-state-types';

export function treeUpdate(entity: TreeEntity, updateContext: UpdateContext): void {
  const hoursPassed = (updateContext.deltaTime * HOURS_PER_GAME_DAY) / GAME_DAY_IN_REAL_SECONDS;
  entity.age += hoursPassed;

  if (!entity.stateMachine) {
    return;
  }

  const [state] = entity.stateMachine;

  // Wood generation and growth only happen for standing trees
  const isStanding = state !== TREE_FALLEN && state !== TREE_STUMP && state !== TREE_DYING;

  if (isStanding) {
    // Initialize wood when tree reaches maturity
    if (entity.age >= TREE_GROWTH_TIME_GAME_HOURS && !entity.woodGenerated) {
      entity.wood = Array.from({ length: TREE_MAX_WOOD }, () => ({
        itemType: 'item',
        type: ItemType.Wood,
        id: updateContext.gameState.entities.nextEntityId++,
      }));
      entity.woodGenerated = true;
    }

    // Update radius based on growth
    entity.radius = TREE_RADIUS * Math.min(1, Math.max(0.4, entity.age / TREE_GROWTH_TIME_GAME_HOURS));
  }
}
