/**
 * Consumer Demand Behavior
 *
 * Implements the behavior for tribe members (Warriors, etc.) to register
 * hunger demands in the logistics system. This allows Movers to deliver
 * food to hungry tribe members who are busy with other tasks.
 *
 * Consumers:
 * - Register a TribeDemand when hungry
 * - Wait for delivery
 * - If delivery takes too long, fallback to manual food seeking
 */

import { HumanEntity } from '../../../entities/characters/human/human-types';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { Blackboard, BlackboardData } from '../behavior-tree-blackboard';
import { ActionNode, ConditionNode, Sequence, Inverter, Succeeder } from '../nodes';
import { UpdateContext } from '../../../world-types';
import { TribeRole } from '../../../entities/tribe/tribe-types';
import { isTribeRole } from '../../../entities/tribe/tribe-role-utils';
import { getTribeLeaderForCoordination } from '../../../entities/tribe/tribe-task-utils';
import {
  registerDemand,
  getDemandByRequester,
  removeDemand,
  isDemandBeingDelivered,
} from '../../../entities/tribe/logistics-utils';
import {
  DemandPriority,
  DemandStatus,
} from '../../../entities/tribe/logistics-types';
import {
  LOGISTICS_CONSUMER_HUNGER_DEMAND_THRESHOLD,
  LOGISTICS_CRITICAL_HUNGER_THRESHOLD,
  LOGISTICS_CONSUMER_DEMAND_COOLDOWN_HOURS,
} from '../../../logistics-consts';

// Blackboard keys
const CONSUMER_DEMAND_REGISTERED_KEY = 'consumerDemandRegistered';
const CONSUMER_DEMAND_TIME_KEY = 'consumerDemandTime';

/**
 * Creates a behavior for consumers (Warriors, etc.) to register hunger demands.
 * This is a non-blocking behavior that runs alongside other behaviors.
 * It uses Succeeder to ensure it doesn't block the behavior tree.
 */
export function createConsumerDemandBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Inverter(
    new Succeeder(
      new Sequence(
        [
          // Check if this human should register a demand
          new ConditionNode(
            (human, context) => {
              // Only adults can register demands
              if (!human.isAdult) {
                return [false, 'Not an adult'];
              }

              // Only certain roles should register demands
              // Movers handle their own food, Gatherers are near food
              const isWarrior = isTribeRole(human, TribeRole.Warrior, context.gameState);
              const isHunter = isTribeRole(human, TribeRole.Hunter, context.gameState);

              if (!isWarrior && !isHunter) {
                return [false, 'Not a consumer role'];
              }

              return [true, 'Consumer role check passed'];
            },
            'Is Consumer Role',
            depth + 1,
          ),

          // Register or update demand based on hunger
          new ActionNode(
            (human, context, blackboard) => {
              const leader = getTribeLeaderForCoordination(human, context.gameState);
              if (!leader?.aiBlackboard) {
                return [NodeStatus.FAILURE, 'No leader coordination'];
              }

              const currentTime = context.gameState.time;
              const hungerRatio = human.hunger / 150;

              // Check cooldown
              const lastDemandTime = Blackboard.get<number>(blackboard, CONSUMER_DEMAND_TIME_KEY) ?? 0;
              if (currentTime - lastDemandTime < LOGISTICS_CONSUMER_DEMAND_COOLDOWN_HOURS) {
                return [NodeStatus.FAILURE, 'Cooldown active'];
              }

              // Check if we're hungry enough to request food
              if (hungerRatio < LOGISTICS_CONSUMER_HUNGER_DEMAND_THRESHOLD) {
                // Not hungry - check if we have an existing demand to clear
                const existingDemand = getDemandByRequester(leader.aiBlackboard, human.id);
                if (existingDemand && existingDemand.status === DemandStatus.Fulfilled) {
                  removeDemand(leader.aiBlackboard, existingDemand.id, currentTime);
                  Blackboard.set(blackboard, CONSUMER_DEMAND_REGISTERED_KEY, false);
                }
                return [NodeStatus.FAILURE, 'Not hungry enough'];
              }

              // We're hungry - register or update demand
              const priority = hungerRatio > LOGISTICS_CRITICAL_HUNGER_THRESHOLD
                ? DemandPriority.Critical
                : hungerRatio > 0.7
                  ? DemandPriority.VeryHigh
                  : hungerRatio > 0.6
                    ? DemandPriority.High
                    : DemandPriority.Normal;

              registerDemand(
                leader.aiBlackboard,
                human.id,
                'food',
                1, // Request 1 food item
                priority,
                human.position,
                currentTime,
              );

              Blackboard.set(blackboard, CONSUMER_DEMAND_REGISTERED_KEY, true);
              Blackboard.set(blackboard, CONSUMER_DEMAND_TIME_KEY, currentTime);

              return [NodeStatus.SUCCESS, `Registered demand with priority ${priority}`];
            },
            'Register Consumer Demand',
            depth + 1,
          ),
        ],
        'Consumer Demand Sequence',
        depth,
      ),
      'Consumer Demand Succeeder',
      depth,
    ),
    'Consumer Demand Gate',
    depth,
  );
}

/**
 * Checks if a human is waiting for a delivery.
 * Can be used by other behaviors to know if they should fallback to manual food seeking.
 */
export function isWaitingForDelivery(
  human: HumanEntity,
  blackboard: BlackboardData,
  context: UpdateContext,
): boolean {
  const isRegistered = Blackboard.get<boolean>(blackboard, CONSUMER_DEMAND_REGISTERED_KEY);
  if (!isRegistered) {
    return false;
  }

  const leader = getTribeLeaderForCoordination(human, context.gameState);
  if (!leader?.aiBlackboard) {
    return false;
  }

  const demand = getDemandByRequester(leader.aiBlackboard, human.id);
  if (!demand) {
    return false;
  }

  // Check if demand is being actively delivered
  return isDemandBeingDelivered(leader.aiBlackboard, demand.id, context.gameState.time);
}
