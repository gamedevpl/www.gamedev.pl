import { BehaviorNode } from './behavior-tree-types';
import { AutopilotControlled, Selector } from './nodes';
import {
  createAttackingBehavior,
  createEatingBehavior,
  createFeedingChildBehavior,
  createFleeingBehavior,
  createGatheringBehavior,
  createIdleWanderBehavior,
  createLeaderCombatStrategyBehavior,
  createPlantingBehavior,
  createProcreationBehavior,
  createSeekingFoodFromParentBehavior,
  createTribeMemberCombatBehavior,
  createEstablishFamilyTerritoryBehavior,
  createFollowPatriarchBehavior,
  createTribeSplitBehavior,
} from './behaviors';

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

      // --- LEADER COMBAT STRATEGY (ATTACK OR RETREAT) ---
      new AutopilotControlled(createLeaderCombatStrategyBehavior(2), 'callToAttack', 'Gated Leader Combat', 1),

      // --- TRIBE COMBAT (MEMBER) ---
      createTribeMemberCombatBehavior(1),

      // --- COMBAT BEHAVIORS (ATTACK) ---
      new AutopilotControlled(createAttackingBehavior(2), 'attack', 'Gated Attacking', 1),

      // --- PERSONAL NEEDS (EAT) ---
      createEatingBehavior(1),

      // --- RESOURCE MANAGEMENT (GATHER) ---
      new AutopilotControlled(createGatheringBehavior(2), 'gathering', 'Gated Gathering', 1),

      // --- FAMILY/SOCIAL NEEDS (FEED CHILD) ---
      new AutopilotControlled(createFeedingChildBehavior(2), 'feedChildren', 'Gated Feed Child', 1),

      // --- CHILD NEEDS (SEEK FOOD) ---
      createSeekingFoodFromParentBehavior(1),

      // --- RESOURCE MANAGEMENT (PLANT) ---
      new AutopilotControlled(createPlantingBehavior(2), 'planting', 'Gated Planting', 1),

      // --- SOCIAL & REPRODUCTION (PROCREATE) ---
      new AutopilotControlled(createProcreationBehavior(2), 'procreation', 'Gated Procreation', 1),

      // --- TRIBE MANAGEMENT (SPLIT) ---
      createTribeSplitBehavior(1),

      // --- TERRITORY MANAGEMENT (ESTABLISH FAMILY) ---
      createEstablishFamilyTerritoryBehavior(1),

      // --- SOCIAL/DEFAULT BEHAVIOR (FOLLOW PATRIARCH) ---
      createFollowPatriarchBehavior(1),

      // --- DEFAULT/FALLBACK BEHAVIOR (WANDER) ---
      createIdleWanderBehavior(1),
    ],
    'Human Behavior',
    0,
  );

  return root;
}
