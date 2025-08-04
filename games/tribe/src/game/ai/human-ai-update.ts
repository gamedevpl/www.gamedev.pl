import { HumanEntity } from '../entities/characters/human/human-types';
import { UpdateContext } from '../world-types';
import { AIType } from './ai-types';
import { updateBehaviorTreeAI } from './behavior-tree/behavior-tree-update';

/**
 * Updates the AI decision-making for a human entity.
 * It acts as a router, delegating to the behavior tree system based on the human's aiType.
 */
export function humanAIUpdate(human: HumanEntity, context: UpdateContext): void {
  // Cleanup old blackboard entries to prevent memory leaks
  if (human.aiBlackboard) {
    human.aiBlackboard.cleanupOldEntries(context.gameState.time);
  }

  const startTime = performance.now();

  switch (human.aiType) {
    case AIType.BehaviorTreeBased:
    default:
      updateBehaviorTreeAI(human, context);
      break;
  }

  context.gameState.performanceMetrics.currentBucket.aiUpdateTime += performance.now() - startTime;
}
