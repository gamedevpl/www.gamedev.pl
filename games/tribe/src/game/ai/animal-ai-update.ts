import { PreyEntity } from '../entities/characters/prey/prey-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { updateBehaviorTreeAI } from './behavior-tree/behavior-tree-update';
import { UpdateContext } from '../world-types';

/**
 * Updates the AI for a prey entity using a behavior tree.
 * This function "ticks" the root of the tree, causing it to be evaluated.
 */
export function preyAIUpdate(prey: PreyEntity, context: UpdateContext): void {
  if (prey.aiBehaviorTree && prey.aiBlackboard) {
    // Note: The behavior tree system is currently typed for HumanEntity,
    // but it works generically with any entity that has the required properties.
    // We cast to any to work around the type system limitation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateBehaviorTreeAI(prey as any, context);
  } else {
    // Fallback if the tree is missing
    console.warn(`Behavior Tree AI ticked for prey ${prey.id}, but the tree or blackboard was missing.`);
    prey.activeAction = 'idle';
  }
}

/**
 * Updates the AI for a predator entity using a behavior tree.
 * This function "ticks" the root of the tree, causing it to be evaluated.
 */
export function predatorAIUpdate(predator: PredatorEntity, context: UpdateContext): void {
  if (predator.aiBehaviorTree && predator.aiBlackboard) {
    // Note: The behavior tree system is currently typed for HumanEntity,
    // but it works generically with any entity that has the required properties.
    // We cast to any to work around the type system limitation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateBehaviorTreeAI(predator as any, context);
  } else {
    // Fallback if the tree is missing
    console.warn(`Behavior Tree AI ticked for predator ${predator.id}, but the tree or blackboard was missing.`);
    predator.activeAction = 'idle';
  }
}