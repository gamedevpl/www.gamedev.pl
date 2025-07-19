import { HumanEntity } from '../../entities/characters/human/human-types';
import { AI_UPDATE_INTERVAL } from '../../world-consts';
import { UpdateContext } from '../../world-types';

/**
 * Updates the AI for a human entity using a behavior tree.
 * This function "ticks" the root of the tree, causing it to be evaluated.
 *
 * @param human The human entity to update.
 * @param context The current game update context.
 */
export function updateBehaviorTreeAI(human: HumanEntity, context: UpdateContext): void {
  if (human.aiBehaviorTree && human.aiBlackboard) {
    const lastAiUpdateTime: number = human.aiBlackboard.get('lastAiUpdateTime') ?? 0;
    if (context.gameState.time - lastAiUpdateTime >= AI_UPDATE_INTERVAL) {
      human.aiBehaviorTree.execute(human, context, human.aiBlackboard);
      human.aiBlackboard.set('lastAiUpdateTime', context.gameState.time);
    }
  } else {
    // Fallback or error logging if the tree is missing
    console.warn(`Behavior Tree AI ticked for human ${human.id}, but the tree or blackboard was missing.`);
    human.activeAction = 'idle';
  }
}
