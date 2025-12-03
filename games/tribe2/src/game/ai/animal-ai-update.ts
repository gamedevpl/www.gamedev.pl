import { PreyEntity } from '../entities/characters/prey/prey-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { updateBehaviorTreeAI } from './behavior-tree/behavior-tree-update';
import { UpdateContext } from '../world-types';
import { buildPreyBehaviorTree } from './behavior-tree/prey-behavior-tree';
import { buildPredatorBehaviorTree } from './behavior-tree/predator-behavior-tree';

export const preyBehaviorTree = buildPreyBehaviorTree();

/**
 * Updates the AI for a prey entity using a behavior tree.
 * This function "ticks" the root of the tree, causing it to be evaluated.
 */
export function preyAIUpdate(prey: PreyEntity, context: UpdateContext): void {
  if (prey.aiBlackboard) {
    // The behavior tree system is designed for HumanEntity but works with any entity
    // that has compatible properties. We cast to work around the type limitation
    // while maintaining type safety through the interface constraints.
    updateBehaviorTreeAI(prey as unknown as HumanEntity, context, preyBehaviorTree);
  } else {
    // Fallback if the tree is missing
    console.warn(`Behavior Tree AI ticked for prey ${prey.id}, but the tree or blackboard was missing.`);
    prey.activeAction = 'idle';
  }
}

export const predatorBehaviorTree = buildPredatorBehaviorTree();

/**
 * Updates the AI for a predator entity using a behavior tree.
 * This function "ticks" the root of the tree, causing it to be evaluated.
 */
export function predatorAIUpdate(predator: PredatorEntity, context: UpdateContext): void {
  if (predator.aiBlackboard) {
    // The behavior tree system is designed for HumanEntity but works with any entity
    // that has compatible properties. We cast to work around the type limitation
    // while maintaining type safety through the interface constraints.
    updateBehaviorTreeAI(predator as unknown as HumanEntity, context, predatorBehaviorTree);
  } else {
    // Fallback if the tree is missing
    console.warn(`Behavior Tree AI ticked for predator ${predator.id}, but the tree or blackboard was missing.`);
    predator.activeAction = 'idle';
  }
}
