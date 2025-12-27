import { PreyEntity } from '../entities/characters/prey/prey-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { updateBehaviorTreeAI } from './behavior-tree/behavior-tree-update';
import { UpdateContext } from '../world-types';
import { buildPreyBehaviorTree } from './behavior-tree/prey-behavior-tree';
import { buildPredatorBehaviorTree } from './behavior-tree/predator-behavior-tree';
import { AIType } from './ai-types';
import { updateAnimalTaskAI } from './task/animals/animal-task-update';

export const preyBehaviorTree = buildPreyBehaviorTree();

/**
 * Updates the AI for a prey entity using a behavior tree.
 * This function "ticks" the root of the tree, causing it to be evaluated.
 */
export function preyAIUpdate(prey: PreyEntity, context: UpdateContext): void {
  // The behavior tree system is designed for HumanEntity but works with any entity
  // that has compatible properties. We cast to work around the type limitation
  // while maintaining type safety through the interface constraints.
  switch (prey.aiType) {
    case AIType.TaskBased:
      updateAnimalTaskAI(prey, context);
      break;
    case AIType.BehaviorTreeBased:
    default:
      updateBehaviorTreeAI(prey as unknown as HumanEntity, context, preyBehaviorTree);
      break;
  }
}

export const predatorBehaviorTree = buildPredatorBehaviorTree();

/**
 * Updates the AI for a predator entity using a behavior tree.
 * This function "ticks" the root of the tree, causing it to be evaluated.
 */
export function predatorAIUpdate(predator: PredatorEntity, context: UpdateContext): void {
  switch (predator.aiType) {
    case AIType.TaskBased:
      updateAnimalTaskAI(predator, context);
      break;
    case AIType.BehaviorTreeBased:
    default:
      updateBehaviorTreeAI(predator as unknown as HumanEntity, context, predatorBehaviorTree);
      break;
  }
}
