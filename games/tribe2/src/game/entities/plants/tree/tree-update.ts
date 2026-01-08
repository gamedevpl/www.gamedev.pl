import { TreeEntity } from './tree-types';
import { UpdateContext } from '../../../world-types';
import { HOURS_PER_GAME_DAY, GAME_DAY_IN_REAL_SECONDS } from '../../../game-consts';
import { TREE_RADIUS, TREE_GROWTH_TIME_GAME_HOURS, TREE_MAX_WOOD } from './tree-consts';
import { ItemType } from '../../item-types';
import { TREE_FALLEN, TREE_STUMP, TREE_DYING } from './states/tree-state-types';
import { updateNavigationGridSector, NAVIGATION_AGENT_RADIUS } from '../../../utils/navigation-utils';

export function treeUpdate(entity: TreeEntity, updateContext: UpdateContext): void {
  const hoursPassed = (updateContext.deltaTime * HOURS_PER_GAME_DAY) / GAME_DAY_IN_REAL_SECONDS;
  entity.age += hoursPassed;

  if (!entity.stateMachine) {
    return;
  }

  const [state] = entity.stateMachine;

  // Clear navigation grid obstacle when tree falls or becomes a stump
  // We trigger this when the state has just changed (enteredAt matches current time or is very recent)
  const stateData = entity.stateMachine[1];
  if (
    (state === TREE_FALLEN || state === TREE_STUMP) &&
    stateData.enteredAt >= updateContext.gameState.time - hoursPassed
  ) {
    updateNavigationGridSector(
      updateContext.gameState,
      entity.position,
      entity.radius,
      false, // isAdding
      null,
      NAVIGATION_AGENT_RADIUS,
    );
  }

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
