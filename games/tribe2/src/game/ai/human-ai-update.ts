import { HumanEntity } from '../entities/characters/human/human-types';
import { UpdateContext } from '../world-types';
import { AIType } from './ai-types';
import { Blackboard } from './behavior-tree/behavior-tree-blackboard';
import { updateBehaviorTreeAI } from './behavior-tree/behavior-tree-update';
import { buildHumanBehaviorTree } from './behavior-tree/human-behavior-tree';
import { cleanupStaleTribalTasks, getTribeLeaderForCoordination } from '../utils/tribe-task-utils';

export const humanBehaviorTree = buildHumanBehaviorTree();

/**
 * Updates the AI decision-making for a human entity.
 * It acts as a router, delegating to the behavior tree system based on the human's aiType.
 */
export function humanAIUpdate(human: HumanEntity, context: UpdateContext): void {
  // Cleanup old blackboard entries to prevent memory leaks
  if (human.aiBlackboard) {
    Blackboard.cleanupOldEntries(human.aiBlackboard, context.gameState.time);
  }

  // Cleanup stale tribal tasks if this human is a coordination leader
  const coordinationLeader = getTribeLeaderForCoordination(human, context.gameState);
  if (coordinationLeader && coordinationLeader.id === human.id && coordinationLeader.aiBlackboard) {
    cleanupStaleTribalTasks(coordinationLeader, context.gameState.time);
  }

  const startTime = performance.now();

  switch (human.aiType) {
    case AIType.BehaviorTreeBased:
    default:
      updateBehaviorTreeAI(human, context, humanBehaviorTree);
      break;
  }

  context.gameState.performanceMetrics.currentBucket.aiUpdateTime += performance.now() - startTime;
}
