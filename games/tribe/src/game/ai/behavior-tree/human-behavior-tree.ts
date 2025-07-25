import { BT_ACTION_TIMEOUT_HOURS, BT_EXPENSIVE_OPERATION_CACHE_HOURS } from '../../world-consts';
import { BehaviorNode } from './behavior-tree-types';
import { AutopilotControlled, CachingNode, ManualControl, Selector, TimeoutNode } from './nodes';
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
  createAutopilotGatheringBehavior,
  createAutopilotAttackingBehavior,
  createAutopilotFeedingChildBehavior,
  createAutopilotPlantingBehavior,
  createAutopilotProcreationBehavior,
  createAutopilotFollowLeaderBehavior,
  createFollowLeaderBehavior,
  createTribeMigrationBehavior,
} from './behaviors';

/**
 * Builds the complete behavior tree for a human entity.
 * The tree is a Selector at its root, which means it will try each branch
 * in order until one of them succeeds or is running. This creates a priority system.
 */
export function buildHumanBehaviorTree(): BehaviorNode {
  // The AI logic is a Selector, which acts like an "OR" gate.
  // It will try each child branch in order until one succeeds or is running.
  const aiRoot = new Selector(
    [
      // --- HIGHEST PRIORITY: SURVIVAL & IMMEDIATE DEFENSE ---
      createFleeingBehavior(2),
      createDefendFamilyBehavior(2),
      createJealousyAttackBehavior(2),
      createDefendClaimedBushBehavior(2),
      createDesperateAttackBehavior(2),

      // --- PLAYER AUTOPILOT COMMANDS (NOT GATED BY AUTOPILOT TOGGLES) ---
      // These actions are triggered by direct player clicks on targets and should always work.
      createAutopilotMovingBehavior(2),
      createAutopilotGatheringBehavior(2),
      createAutopilotAttackingBehavior(2),
      createAutopilotProcreationBehavior(2),
      createAutopilotPlantingBehavior(2),
      createAutopilotFeedingChildBehavior(2),
      createAutopilotFollowLeaderBehavior(2),

      // --- LEADER COMBAT STRATEGY (ATTACK OR RETREAT) ---
      createLeaderCombatStrategyBehavior(2),

      // --- TRIBE COMBAT (MEMBER) ---
      createTribeMemberCombatBehavior(2),

      // --- COMBAT BEHAVIORS (ATTACK) ---
      new AutopilotControlled(createAttackingBehavior(3), 'attack', 'Gated Attacking', 2),

      // --- PERSONAL NEEDS (EAT) ---
      createEatingBehavior(2),

      // --- RESOURCE MANAGEMENT (GATHER) ---
      new TimeoutNode(
        new AutopilotControlled(createGatheringBehavior(4), 'gathering', 'Gated Gathering', 3),
        BT_ACTION_TIMEOUT_HOURS,
        'Timeout Gathering',
        2,
      ),

      // --- FAMILY/SOCIAL NEEDS (FEED CHILD) ---
      new AutopilotControlled(createFeedingChildBehavior(3), 'feedChildren', 'Gated Feed Child', 2),

      // --- CHILD NEEDS (SEEK FOOD) ---
      createSeekingFoodFromParentBehavior(2),

      // --- RESOURCE MANAGEMENT (PLANT) ---
      new TimeoutNode(
        new AutopilotControlled(createPlantingBehavior(4), 'planting', 'Gated Planting', 3),
        BT_ACTION_TIMEOUT_HOURS,
        'Timeout Planting',
        2,
      ),

      // --- SOCIAL & REPRODUCTION (PROCREATE) ---
      new AutopilotControlled(createProcreationBehavior(3), 'procreation', 'Gated Procreation', 2),

      // --- TRIBE MANAGEMENT (SPLIT) ---
      new CachingNode(createTribeSplitBehavior(3), BT_EXPENSIVE_OPERATION_CACHE_HOURS, 'Cache Tribe Split', 2),

      // --- TRIBE MANAGEMENT (MIGRATION) ---
      createTribeMigrationBehavior(2),

      // --- TERRITORY MANAGEMENT (ESTABLISH FAMILY) ---
      new CachingNode(
        createEstablishFamilyTerritoryBehavior(3),
        BT_EXPENSIVE_OPERATION_CACHE_HOURS,
        'Cache Establish Territory',
        2,
      ),

      // --- SOCIAL/DEFAULT BEHAVIOR (FOLLOW LEADER/PATRIARCH) ---
      new AutopilotControlled(createFollowLeaderBehavior(3), 'followLeader', 'Gated Follow Leader', 2),
      createFollowPatriarchBehavior(2),

      // --- DEFAULT/FALLBACK BEHAVIOR (WANDER) ---
      createIdleWanderBehavior(2),
    ],
    'AI Root Selector',
    1,
  );

  // Wrap the entire tree in a ManualControl decorator.
  // This is the true root of the tree, ensuring manual movement overrides AI.
  const root = new ManualControl(aiRoot, 'Manual Control Gate', 0);

  return root;
}
