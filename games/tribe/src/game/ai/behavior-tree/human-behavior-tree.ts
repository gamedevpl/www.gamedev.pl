import { BehaviorNode } from "./behavior-tree-types";
import { Selector } from "./nodes";
import {
  createAttackingBehavior,
  createEatingBehavior,
  createFeedingChildBehavior,
  createFleeingBehavior,
  createGatheringBehavior,
  createIdleWanderBehavior,
  createPlantingBehavior,
  createProcreationBehavior,
  createSeekingFoodFromParentBehavior,
} from "./behaviors";

/**
 * Builds the complete behavior tree for a human entity.
 * The tree is a Selector at its root, which means it will try each branch
 * in order until one of them succeeds or is running. This creates a priority system.
 */
export function buildHumanBehaviorTree(): BehaviorNode {
  // The root of the tree is a Selector, which acts like an "OR" gate.
  // It will try each child branch in order until one succeeds or is running.
  const root = new Selector([
    // --- HIGHEST PRIORITY: SURVIVAL (FLEE) ---
    createFleeingBehavior(),

    // --- COMBAT BEHAVIORS (ATTACK) ---
    createAttackingBehavior(),

    // --- FAMILY/SOCIAL NEEDS (FEED CHILD) ---
    createFeedingChildBehavior(),

    // --- CHILD NEEDS (SEEK FOOD) ---
    createSeekingFoodFromParentBehavior(),

    // --- PERSONAL NEEDS (EAT) ---
    createEatingBehavior(),

    // --- RESOURCE MANAGEMENT (GATHER) ---
    createGatheringBehavior(),

    // --- RESOURCE MANAGEMENT (PLANT) ---
    createPlantingBehavior(),

    // --- SOCIAL & REPRODUCTION (PROCREATE) ---
    createProcreationBehavior(),

    // --- DEFAULT/FALLBACK BEHAVIOR (WANDER) ---
    createIdleWanderBehavior(),
  ]);

  return root;
}
