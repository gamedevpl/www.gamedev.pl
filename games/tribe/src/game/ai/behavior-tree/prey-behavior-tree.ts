import { BehaviorNode } from './behavior-tree-types';
import { Selector } from './nodes';

/**
 * Builds a basic behavior tree for prey entities.
 * Prey behavior focuses on: eating berries, fleeing from threats, procreating
 * For now, this is a placeholder that will be extended later with actual behaviors.
 */
export function buildPreyBehaviorTree(): BehaviorNode {
  // Create a simple selector for now - actual behaviors will be implemented later
  return new Selector([
    // TODO: Add prey-specific behaviors
  ]);
}