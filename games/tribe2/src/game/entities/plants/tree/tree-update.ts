import { TreeEntity } from './tree-types';
import { UpdateContext } from '../../../world-types';
import { HOURS_PER_GAME_DAY, GAME_DAY_IN_REAL_SECONDS } from '../../../game-consts';
import { TREE_RADIUS, TREE_GROWTH_TIME_GAME_HOURS } from './tree-consts';

export function treeUpdate(entity: TreeEntity, updateContext: UpdateContext): void {
  const hoursPassed = (updateContext.deltaTime * HOURS_PER_GAME_DAY) / GAME_DAY_IN_REAL_SECONDS;
  entity.age += hoursPassed;

  // Update radius based on growth
  entity.radius = TREE_RADIUS * Math.min(1, Math.max(0.4, entity.age / TREE_GROWTH_TIME_GAME_HOURS));
}
