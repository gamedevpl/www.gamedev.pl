import { BehaviorNode } from "./behavior-tree-types";
import { Selector } from "./nodes";
import {
  createAttackingBehavior,
  createEatingBehavior,
  createFeedingChildBehavior,
  createFleeingBehavior,
  createGatheringBehavior,
  createIdleWanderBehavior,
  createLeaderCallToAttackBehavior,
  createPlantingBehavior,
  createProcreationBehavior,
  createSeekingFoodFromParentBehavior,
  createTribeMemberCombatBehavior,
  createEstablishFamilyTerritoryBehavior,
} from "./behaviors";

/**
 * Builds the complete behavior tree for a human entity.
 * The tree is a Selector at its root, which means it will try each branch
 * in order until one of them succeeds or is running. This creates a priority system.
 */
export function buildHumanBehaviorTree(): BehaviorNode {
  // The root of the tree is a Selector, which acts like an "OR" gate.
  // It will try each child branch in order until one succeeds or is running.
  const root = new Selector(
    [
      // --- HIGHEST PRIORITY: SURVIVAL (FLEE) ---
      createFleeingBehavior(1),

      // --- TRIBE COMBAT (LEADER) ---
      createLeaderCallToAttackBehavior(1),

      // --- TRIBE COMBAT (MEMBER) ---
      createTribeMemberCombatBehavior(1),

      // --- COMBAT BEHAVIORS (ATTACK) ---
      createAttackingBehavior(1),

      // --- FAMILY/SOCIAL NEEDS (FEED CHILD) ---
      createFeedingChildBehavior(1),

      // --- CHILD NEEDS (SEEK FOOD) ---
      createSeekingFoodFromParentBehavior(1),

      // --- PERSONAL NEEDS (EAT) ---
      createEatingBehavior(1),

      // --- RESOURCE MANAGEMENT (GATHER) ---
      createGatheringBehavior(1),

      // --- RESOURCE MANAGEMENT (PLANT) ---
      createPlantingBehavior(1),

      // --- SOCIAL & REPRODUCTION (PROCREATE) ---
      createProcreationBehavior(1),

      // --- TERRITORY MANAGEMENT (ESTABLISH FAMILY) ---
      createEstablishFamilyTerritoryBehavior(1),

      // --- DEFAULT/FALLBACK BEHAVIOR (WANDER) ---
      createIdleWanderBehavior(1),
    ],
    "Human Behavior",
    0
  );

  return root;
}
