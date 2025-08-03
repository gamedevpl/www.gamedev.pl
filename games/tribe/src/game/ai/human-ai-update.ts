import { HumanEntity } from '../entities/characters/human/human-types';
import { UpdateContext } from '../world-types';
import { AIType } from './ai-types';
import { updateBehaviorTreeAI } from './behavior-tree/behavior-tree-update';
import { PERFORMANCE_METRICS_BUFFER_SIZE } from '../game-consts';

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

  const duration = performance.now() - startTime;
  if (context.gameState.performanceMetrics) {
    context.gameState.performanceMetrics.aiUpdateTimes.push(duration);
    if (context.gameState.performanceMetrics.aiUpdateTimes.length > PERFORMANCE_METRICS_BUFFER_SIZE) {
      context.gameState.performanceMetrics.aiUpdateTimes.shift();
    }
  }
}
