import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { BehaviorNode } from './behavior-tree-types.ts';
import { CharacterEntity } from '../../entities/characters/character-types.ts';
import { cleanupStaleTribalTasks, getTribeLeaderForCoordination } from '../../entities/tribe/tribe-task-utils.ts';
import { cleanupStaleDemands } from '../supply-chain/tribe-logistics-utils.ts';

/**
 * Updates the AI for a human entity using a behavior tree.
 * This function "ticks" the root of the tree, causing it to be evaluated.
 *
 * @param human The human entity to update.
 * @param context The current game update context.
 */
export function updateBehaviorTreeAI(
  human: HumanEntity,
  context: UpdateContext,
  behaviorTree: BehaviorNode<CharacterEntity>,
): void {
  // Cleanup stale tribal tasks if this human is a coordination leader
  const coordinationLeader = getTribeLeaderForCoordination(human, context.gameState);
  if (coordinationLeader && coordinationLeader.id === human.id && coordinationLeader.aiBlackboard) {
    cleanupStaleTribalTasks(coordinationLeader, context.gameState.time);
    cleanupStaleDemands(coordinationLeader.aiBlackboard, context.gameState.time);
  }

  behaviorTree.execute(human, context, human.aiBlackboard);
}
