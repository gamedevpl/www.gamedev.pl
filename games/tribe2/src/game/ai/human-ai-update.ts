import { HumanEntity } from '../entities/characters/human/human-types';
import { UpdateContext } from '../world-types';
import { AIType } from './ai-types';
import { updateHumanTaskAI } from './task/humans/human-task-update';

/**
 * Updates the AI decision-making for a human entity.
 * It acts as a router, delegating to the behavior tree system based on the human's aiType.
 */
export function humanAIUpdate(human: HumanEntity, context: UpdateContext): void {
  const startTime = performance.now();

  switch (human.aiType) {
    case AIType.TaskBased:
    default:
      updateHumanTaskAI(human, context);
      break;
  }

  context.gameState.performanceMetrics.currentBucket.aiUpdateTime += performance.now() - startTime;
}
