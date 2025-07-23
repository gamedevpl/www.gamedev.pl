import { BT_ACTION_TIMEOUT_HOURS, BT_EXPENSIVE_OPERATION_CACHE_HOURS } from '../../world-consts';
import { BehaviorNode } from './behavior-tree-types';
import { AutopilotControlled, CachingNode, Selector, TimeoutNode } from './nodes';
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
  createJealousyAttackBehavior,
  createDefendFamilyBehavior,
  createDefendClaimedBushBehavior,
  createDesperateAttackBehavior,
  createAutopilotMovingBehavior,
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
      // --- HIGHEST PRIORITY: SURVIVAL & IMMEDIATE DEFENSE ---
      createFleeingBehavior(1),
      createDefendFamilyBehavior(1),
      createJealousyAttackBehavior(1),
      createDefendClaimedBushBehavior(1),
      createDesperateAttackBehavior(1),

      // --- PLAYER AUTOPILOT COMMANDS ---
      // This sequence handles direct player commands like click-to-move.
      // It checks if it's the player and if autopilot is on, then executes the move.
      createAutopilotMovingBehavior(1),

      // --- LEADER COMBAT STRATEGY (ATTACK OR RETREAT) ---
      new AutopilotControlled(createLeaderCombatStrategyBehavior(2), 'callToAttack', 'Gated Leader Combat', 1),

      // --- TRIBE COMBAT (MEMBER) ---
      createTribeMemberCombatBehavior(1),

      // --- COMBAT BEHAVIORS (ATTACK) ---
      new AutopilotControlled(createAttackingBehavior(2), 'attack', 'Gated Attacking', 1),

      // --- PERSONAL NEEDS (EAT) ---
      createEatingBehavior(1),

      // --- RESOURCE MANAGEMENT (GATHER) ---
      new AutopilotControlled(
        new TimeoutNode(createGatheringBehavior(3), BT_ACTION_TIMEOUT_HOURS, 'Timeout Gathering', 2),
        'gathering',
        'Gated Gathering',
        1,
      ),

      // --- FAMILY/SOCIAL NEEDS (FEED CHILD) ---
      new AutopilotControlled(createFeedingChildBehavior(2), 'feedChildren', 'Gated Feed Child', 1),

      // --- CHILD NEEDS (SEEK FOOD) ---
      createSeekingFoodFromParentBehavior(1),

      // --- RESOURCE MANAGEMENT (PLANT) ---
      new AutopilotControlled(
        new TimeoutNode(createPlantingBehavior(3), BT_ACTION_TIMEOUT_HOURS, 'Timeout Planting', 2),
        'planting',
        'Gated Planting',
        1,
      ),

      // --- SOCIAL & REPRODUCTION (PROCREATE) ---
      new AutopilotControlled(createProcreationBehavior(2), 'procreation', 'Gated Procreation', 1),

      // --- TRIBE MANAGEMENT (SPLIT) ---
      new CachingNode(createTribeSplitBehavior(2), BT_EXPENSIVE_OPERATION_CACHE_HOURS, 'Cache Tribe Split', 1),

      // --- TERRITORY MANAGEMENT (ESTABLISH FAMILY) ---
      new CachingNode(
        createEstablishFamilyTerritoryBehavior(2),
        BT_EXPENSIVE_OPERATION_CACHE_HOURS,
        'Cache Establish Territory',
        1,
      ),

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
