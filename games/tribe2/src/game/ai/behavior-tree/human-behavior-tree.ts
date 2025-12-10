import {
  BT_ACTION_TIMEOUT_HOURS,
  BT_EXPENSIVE_OPERATION_CACHE_HOURS,
  BT_LEADER_BUILDING_PLACEMENT_COOLDOWN_HOURS,
} from '../../ai-consts.ts';
import { BehaviorNode } from './behavior-tree-types';
import { AutopilotControlled, CachingNode, Inverter, ManualControl, NonPlayerControlled, Selector, Succeeder, TimeoutNode } from './nodes';
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
  createFollowPatriarchBehavior,
  createTribeSplitBehavior,
  createJealousyAttackBehavior,
  createDefendFamilyBehavior,
  createDesperateAttackBehavior,
  createPlayerCommandBehavior,
  createFollowLeaderBehavior,
  createTribeMigrationBehavior,
  createDiplomacyBehavior,
  createHumanHuntPreyBehavior,
  createHumanDefendAgainstPredatorBehavior,
  createStorageDepositBehavior,
  createStorageRetrieveBehavior,
  createStorageStealBehavior,
  createLeaderBuildingPlacementBehavior,
  createTakeOverBuildingBehavior,
  createRemoveEnemyBuildingBehavior,
  createTribeRoleAssignmentBehavior,
} from './behaviors';
import { HumanEntity } from '../../entities/characters/human/human-types';

/**
 * Builds the complete behavior tree for a human entity.
 * The tree is a Selector at its root, which means it will try each branch
 * in order until one of them succeeds or is running. This creates a priority system.
 */
export function buildHumanBehaviorTree(): BehaviorNode<HumanEntity> {
  // The AI logic is a Selector, which acts like an "OR" gate.
  // It will try each child branch in order until one succeeds or is running.
  const aiRoot = new Selector(
    [
      // --- HIGHEST PRIORITY: SURVIVAL & IMMEDIATE DEFENSE ---
      createFleeingBehavior(2),
      createDefendFamilyBehavior(2),
      new AutopilotControlled(
        createHumanDefendAgainstPredatorBehavior(2),
        'attack',
        'Gated Defend Against Predator',
        2,
      ),
      new AutopilotControlled(createJealousyAttackBehavior(2), 'attack', 'Gated Jealousy Attack', 2),
      new AutopilotControlled(createDesperateAttackBehavior(2), 'attack', 'Gated Desperate Attack', 2),

      // --- PLAYER COMMANDS (NOT GATED BY AUTOPILOT TOGGLES) ---
      // These actions are triggered by direct player clicks and should always have high priority.
      createPlayerCommandBehavior(2),

      // --- TRIBE ROLE ASSIGNMENT ---
      new Inverter(
        new Succeeder(createTribeRoleAssignmentBehavior(4), 'Role Assignment Success', 3),
        'Role Assignment Gate',
        2,
      ),

      // --- LEADER COMBAT STRATEGY (ATTACK OR RETREAT) ---
      new NonPlayerControlled(createLeaderCombatStrategyBehavior(3), 'Gated Leader Combat Strategy', 2),

      // --- DIPLOMACY (LEADER) ---
      new NonPlayerControlled(createDiplomacyBehavior(3), 'Gated Diplomacy', 2),

      // --- LEADER BUILDING INTERACTIONS (TAKE OVER / DESTROY ENEMY BUILDINGS) ---
      new NonPlayerControlled(
        new Selector(
          [
            // Prioritize taking over (preserves the building)
            new CachingNode(
              createTakeOverBuildingBehavior(5),
              BT_EXPENSIVE_OPERATION_CACHE_HOURS,
              'Cache Take Over Building',
              4,
            ),
            // Fall back to destruction if takeover isn't viable
            new CachingNode(
              createRemoveEnemyBuildingBehavior(5),
              BT_EXPENSIVE_OPERATION_CACHE_HOURS,
              'Cache Remove Enemy Building',
              4,
            ),
          ],
          'Building Interaction Selector',
          3,
        ),
        'Gated Leader Building Interactions',
        2,
      ),

      // --- LEADER BUILDING PLACEMENT (INFRASTRUCTURE) ---
      new AutopilotControlled(
        new CachingNode(
          createLeaderBuildingPlacementBehavior(4),
          BT_LEADER_BUILDING_PLACEMENT_COOLDOWN_HOURS,
          'Cache Building Placement',
          3,
        ),
        'build',
        'Gated Leader Building Placement',
        2,
      ),

      // --- TRIBE COMBAT (MEMBER) ---
      createTribeMemberCombatBehavior(2),

      // --- OPPORTUNISTIC STEALING ---
      new AutopilotControlled(createStorageStealBehavior(3), 'attack', 'Gated Storage Steal', 2),

      // --- COMBAT BEHAVIORS (ATTACK) ---
      new AutopilotControlled(createAttackingBehavior(3), 'attack', 'Gated Attacking', 2),

      // --- PERSONAL NEEDS (EAT) ---
      createEatingBehavior(2),

      // --- STORAGE RETRIEVE (WHEN HUNGRY) ---
      new AutopilotControlled(createStorageRetrieveBehavior(3), 'gathering', 'Gated Storage Retrieve', 2),

      // --- RESOURCE MANAGEMENT (GATHER) ---
      new TimeoutNode(
        new AutopilotControlled(createGatheringBehavior(4), 'gathering', 'Gated Gathering', 3),
        BT_ACTION_TIMEOUT_HOURS,
        'Timeout Gathering',
        2,
      ),

      // --- STORAGE DEPOSIT (EXCESS FOOD) ---
      new AutopilotControlled(createStorageDepositBehavior(3), 'gathering', 'Gated Storage Deposit', 2),

      // --- FAMILY/SOCIAL NEEDS (FEED CHILD) ---
      new AutopilotControlled(createFeedingChildBehavior(3), 'feedChildren', 'Gated Feed Child', 2),

      // --- CHILD NEEDS (SEEK FOOD) ---
      createSeekingFoodFromParentBehavior(2),

      // --- SOCIAL & REPRODUCTION (PROCREATE) ---
      new AutopilotControlled(createProcreationBehavior(3), 'procreation', 'Gated Procreation', 2),

      // --- RESOURCE MANAGEMENT (PLANT) ---
      new TimeoutNode(
        new AutopilotControlled(createPlantingBehavior(4), 'planting', 'Gated Planting', 3),
        BT_ACTION_TIMEOUT_HOURS,
        'Timeout Planting',
        2,
      ),

      // --- HUNTING BEHAVIORS ---
      new AutopilotControlled(createHumanHuntPreyBehavior(3), 'attack', 'Gated Hunt Prey', 2),

      // --- TRIBE MANAGEMENT (SPLIT) ---
      new CachingNode(createTribeSplitBehavior(3), BT_EXPENSIVE_OPERATION_CACHE_HOURS, 'Cache Tribe Split', 2),

      // --- TRIBE MANAGEMENT (MIGRATION) ---
      new NonPlayerControlled(createTribeMigrationBehavior(3), 'Gated Tribe Migration', 2),

      // --- SOCIAL/DEFAULT BEHAVIOR (FOLLOW LEADER/PATRIARCH) ---
      new AutopilotControlled(createFollowLeaderBehavior(3), 'followLeader', 'Gated Follow Leader', 2),
      new NonPlayerControlled(createFollowPatriarchBehavior(2), 'Gated Follow Patriarch', 2),

      // --- DEFAULT/FALLBACK BEHAVIOR (WANDER) ---
      new NonPlayerControlled(createIdleWanderBehavior(2), 'Gated Idle Wander', 2),
    ],
    'AI Root Selector',
    1,
  );

  // Wrap the entire tree in a ManualControl decorator.
  // This is the true root of the tree, ensuring manual movement overrides AI.
  const root = new ManualControl(aiRoot, 'Manual Control Gate', 0);

  return root;
}
