import {
  BT_EXPENSIVE_OPERATION_CACHE_HOURS,
  FOOD_SECURITY_EMERGENCY_THRESHOLD,
  FOOD_SECURITY_GROWTH_THRESHOLD,
  FOOD_SECURITY_MAINTENANCE_THRESHOLD,
} from '../../../ai-consts.ts';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { TribeRole } from '../../../entities/tribe/tribe-types';
import { getTribeMembers } from '../../../entities/tribe/family-tribe-utils.ts';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, CachingNode } from '../nodes';

const MIN_TRIBE_SIZE_FOR_ROLE_MANAGEMENT = 5; // Minimum adult members to enable role management
const MIN_ROLE_WEIGHT = 0;
const MAX_ROLE_WEIGHT = 10;

/**
 * Target role weights based on tribe's food security level.
 * These represent ideal distributions for different scenarios.
 */
type RoleWeightTargets = Record<TribeRole, number>;

/**
 * Determines target role weights based on the tribe's food security level.
 */
function getTargetWeights(foodSecurityRatio: number): RoleWeightTargets {
  // Emergency mode: Focus heavily on gathering food
  if (foodSecurityRatio < FOOD_SECURITY_EMERGENCY_THRESHOLD) {
    return {
      [TribeRole.Leader]: 0, // Leader role is not assigned via weights
      [TribeRole.Gatherer]: 7,
      [TribeRole.Planter]: 2,
      [TribeRole.Hunter]: 1,
      [TribeRole.Mover]: 1,
      [TribeRole.Warrior]: 0,
    };
  }

  // Growth mode: Balance gathering and planting for sustainability
  if (foodSecurityRatio < FOOD_SECURITY_GROWTH_THRESHOLD) {
    return {
      [TribeRole.Leader]: 0,
      [TribeRole.Gatherer]: 5,
      [TribeRole.Planter]: 4,
      [TribeRole.Hunter]: 2,
      [TribeRole.Mover]: 2,
      [TribeRole.Warrior]: 1,
    };
  }

  // Maintenance mode: Balanced distribution for stable operations
  if (foodSecurityRatio < FOOD_SECURITY_MAINTENANCE_THRESHOLD) {
    return {
      [TribeRole.Leader]: 0,
      [TribeRole.Gatherer]: 4,
      [TribeRole.Planter]: 3,
      [TribeRole.Hunter]: 3,
      [TribeRole.Mover]: 3,
      [TribeRole.Warrior]: 2,
    };
  }

  // Abundance mode: Can afford more hunters and warriors for expansion
  return {
    [TribeRole.Leader]: 0,
    [TribeRole.Gatherer]: 3,
    [TribeRole.Planter]: 3,
    [TribeRole.Hunter]: 4,
    [TribeRole.Mover]: 3,
    [TribeRole.Warrior]: 3,
  };
}

/**
 * Calculates the tribe's food security ratio.
 * Returns a value between 0 and 1+ representing how well-fed the tribe is.
 */
function calculateFoodSecurity(tribeMembers: HumanEntity[]): number {
  if (tribeMembers.length === 0) return 0;

  let totalFood = 0;
  let totalCapacity = 0;

  for (const member of tribeMembers) {
    totalFood += member.food.length;
    totalCapacity += member.maxFood;
  }

  if (totalCapacity === 0) return 0;

  return totalFood / totalCapacity;
}

/**
 * Adjusts a single role weight toward its target value.
 * Makes gradual changes (+1 or -1) to avoid oscillation.
 */
function adjustWeightTowardTarget(currentWeight: number, targetWeight: number): number {
  if (currentWeight < targetWeight) {
    return Math.min(currentWeight + 1, MAX_ROLE_WEIGHT);
  } else if (currentWeight > targetWeight) {
    return Math.max(currentWeight - 1, MIN_ROLE_WEIGHT);
  }
  return currentWeight;
}

/**
 * Creates a behavior that manages tribe role weights for a leader.
 * This behavior analyzes the tribe's food security and adjusts role weights
 * to optimize resource gathering, planting, hunting, and defense.
 *
 * The behavior only runs for tribe leaders and makes gradual adjustments
 * to avoid constant role reassignments.
 */
export function createTribeRoleManagementBehavior(debugDepth: number): BehaviorNode<HumanEntity> {
  const action = new ActionNode<HumanEntity>(
    (human, context) => {
      // 1. Check if human is a leader
      if (!human.leaderId || human.id !== human.leaderId) {
        return NodeStatus.FAILURE;
      }

      // 2. Check if human has tribe control
      if (!human.tribeControl) {
        return NodeStatus.FAILURE;
      }

      // 3. Get tribe members
      const tribeMembers = getTribeMembers(human, context.gameState);
      const adultMembers = tribeMembers.filter((m) => m.isAdult);

      // 4. Check if tribe has sufficient size
      if (adultMembers.length < MIN_TRIBE_SIZE_FOR_ROLE_MANAGEMENT) {
        return NodeStatus.FAILURE;
      }

      // 5. Calculate food security
      const foodSecurityRatio = calculateFoodSecurity(tribeMembers);

      // 6. Determine target weights based on food security
      const targetWeights = getTargetWeights(foodSecurityRatio);

      // 7. Adjust current weights toward target weights
      const currentWeights = human.tribeControl.roleWeights;
      let anyWeightChanged = false;

      // Iterate through all roles (except Leader which is not assigned via weights)
      const rolesToManage: TribeRole[] = [
        TribeRole.Gatherer,
        TribeRole.Planter,
        TribeRole.Hunter,
        TribeRole.Mover,
        TribeRole.Warrior,
      ];

      for (const role of rolesToManage) {
        const currentWeight = currentWeights[role] || 0;
        const targetWeight = targetWeights[role];
        const newWeight = adjustWeightTowardTarget(currentWeight, targetWeight);

        if (newWeight !== currentWeight) {
          currentWeights[role] = newWeight;
          anyWeightChanged = true;
        }
      }

      // 8. Return success if any weight was changed, failure otherwise
      if (anyWeightChanged) {
        const debugInfo = `Adjusted weights for food security: ${(foodSecurityRatio * 100).toFixed(1)}%`;
        return [NodeStatus.SUCCESS, debugInfo];
      }

      return NodeStatus.FAILURE;
    },
    'Manage Tribe Role Weights',
    debugDepth + 1,
  );

  // Wrap in caching node to avoid recalculating every frame
  return new CachingNode(action, BT_EXPENSIVE_OPERATION_CACHE_HOURS, 'Cache Role Management', debugDepth);
}
