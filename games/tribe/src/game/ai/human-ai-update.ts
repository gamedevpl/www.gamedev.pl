import { HumanEntity } from '../entities/characters/human/human-types';
import { UpdateContext } from '../world-types';
import { AIType } from './ai-types';
import { updateBehaviorTreeAI } from './behavior-tree/behavior-tree-update';
import { humanAIStrategies } from './strategies';
import { updateUtilityAI } from './utility-ai';

/**
 * Updates the AI decision-making for a human entity.
 * It acts as a router, delegating to either the old strategy-based system,
 * the utility-based system, or the new behavior tree system based on the human's aiType.
 */
export function humanAIUpdate(human: HumanEntity, context: UpdateContext): void {
  switch (human.aiType) {
    case AIType.BehaviorTreeBased:
      updateBehaviorTreeAI(human, context);
      return;

    case AIType.UtilityBased:
      updateUtilityAI(human, context);
      return;

    case AIType.StrategyBased:
    default:
      // --- Existing Strategy-Based AI Logic ---
      for (const strategy of humanAIStrategies) {
        const checkResult = strategy.check(human, context);
        if (checkResult) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          strategy.execute(human, context, checkResult as any);
          return; // Strategy executed, decision made for this tick
        }
      }

      // If no strategy was applicable (should ideally be handled by a fallback strategy like IdleWanderStrategy)
      // As a safeguard, ensure the human is at least in a known state if nothing else applied.
      // However, IdleWanderStrategy.check() should always return true if it's the last one.
      if (!human.activeAction) {
        human.activeAction = 'idle';
        human.direction = { x: 0, y: 0 };
        human.targetPosition = undefined;
      }
  }
}
