import { BehaviorNode } from './behavior-tree-types';
import { Selector } from './nodes';
import {
  createPreyFleeingBehavior,
  createPreyGrazingBehavior,
  createPreyProcreationBehavior,
  createAnimalWanderBehavior,
  createPreyFeedingChildBehavior,
  createPreySeekingFoodFromParentBehavior,
} from './behaviors';
import { createPreyHerdBehavior } from './behaviors/prey-herd-behavior';

/**
 * Builds a complete behavior tree for prey entities.
 * Prey behavior focuses on: fleeing from threats, feeding children, seeking food from parents, eating berries, procreating, herding for protection, and wandering.
 * The tree is structured as a priority system where higher-priority behaviors are evaluated first.
 */
export function buildPreyBehaviorTree(): BehaviorNode {
  return new Selector([
    // HIGHEST PRIORITY: Survival - flee from predators and humans
    createPreyFleeingBehavior(1),
    
    // HIGH PRIORITY: Parental care - feed hungry children (females only)
    createPreyFeedingChildBehavior(1),
    
    // HIGH PRIORITY: Child survival - seek food from female parent when hungry
    createPreySeekingFoodFromParentBehavior(1),
    
    // MEDIUM PRIORITY: Basic needs - eat when hungry
    createPreyGrazingBehavior(1),
    
    // LOWER PRIORITY: Reproduction - procreate when conditions are favorable
    createPreyProcreationBehavior(1),
    
    // LOW PRIORITY: Social behavior - form herds for protection
    createPreyHerdBehavior(1),
    
    // FALLBACK: Wander around when nothing else to do
    createAnimalWanderBehavior(1),
  ], 'Prey Behavior Root', 0);
}