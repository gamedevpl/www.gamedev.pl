import { BehaviorNode } from './behavior-tree-types';
import { Selector } from './nodes';

/**
 * Builds a basic behavior tree for predator entities.
 * Predator behavior focuses on: hunting prey, fighting humans, procreating, patrolling
 * For now, this is a placeholder that will be extended later with actual behaviors.
 */
export function buildPredatorBehaviorTree(): BehaviorNode {
  // Create a simple selector for now - actual behaviors will be implemented later
  return new Selector([
    // TODO: Add predator-specific behaviors
  ]);
}