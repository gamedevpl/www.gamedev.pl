import { BehaviorNode } from './behavior-tree-types';
import { Selector } from './nodes';
import {
  createPredatorHuntBehavior,
  createPredatorAttackBehavior,
  createPredatorProcreationBehavior,
  createAnimalWanderBehavior,
} from './behaviors';
import { createPredatorTerritorialBehavior } from './behaviors/predator-territorial-behavior';
import { createPredatorPackBehavior } from './behaviors/predator-pack-behavior';

/**
 * Builds a complete behavior tree for predator entities.
 * Predator behavior focuses on: hunting prey, fighting humans, territorial disputes, pack coordination, procreating, and patrolling.
 * The tree is structured as a priority system where higher-priority behaviors are evaluated first.
 */
export function buildPredatorBehaviorTree(): BehaviorNode {
  return new Selector([
    // HIGHEST PRIORITY: Hunting prey when hungry
    createPredatorHuntBehavior(1),
    
    // HIGH PRIORITY: Attack humans when very hungry or defensive
    createPredatorAttackBehavior(1),
    
    // MEDIUM-HIGH PRIORITY: Territorial fights with rival predator groups
    createPredatorTerritorialBehavior(1),
    
    // MEDIUM PRIORITY: Reproduction - procreate when conditions are favorable
    createPredatorProcreationBehavior(1),
    
    // LOW-MEDIUM PRIORITY: Pack coordination - follow pack leader
    createPredatorPackBehavior(1),
    
    // FALLBACK: Patrol/wander around when nothing else to do
    createAnimalWanderBehavior(1),
  ], 'Predator Behavior Root', 0);
}