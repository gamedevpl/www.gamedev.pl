import { HumanEntity } from '../../entities/characters/human/human-types';
import { AI_UPDATE_INTERVAL } from '../../ai-consts.ts';
import { UpdateContext } from '../../world-types';
import { Blackboard } from './behavior-tree-blackboard.ts';
import { BehaviorNode } from './behavior-tree-types.ts';
import { CharacterEntity } from '../../entities/characters/character-types.ts';

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
  if (human.aiBlackboard) {
    const lastAiUpdateTime: number = Blackboard.get(human.aiBlackboard, 'lastAiUpdateTime') ?? 0;
    if (context.gameState.time - lastAiUpdateTime >= AI_UPDATE_INTERVAL) {
      behaviorTree.execute(human, context, human.aiBlackboard);
      Blackboard.set(human.aiBlackboard, 'lastAiUpdateTime', context.gameState.time);
    }
  } else {
    // Fallback or error logging if the tree is missing
    console.warn(`Behavior Tree AI ticked for human ${human.id}, but the tree or blackboard was missing.`);
    human.activeAction = 'idle';
  }
}
