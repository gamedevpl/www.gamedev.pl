/**
 * Mover Delivery Behavior
 *
 * This behavior handles the MOVER role in the tribe. MOVERs are responsible for:
 * 1. Delivering food from storage spots to tribe members in need
 * 2. Prioritizing deliveries to leaders, patriarchs, and warriors
 * 3. Forming a mesh of deliveries where MOVERs can hand off resources to each other
 * 4. Receiving food from other MOVERs when they are distant from storage
 */

import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Selector, Sequence } from '../nodes';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { BlackboardData, Blackboard } from '../behavior-tree-blackboard';
import { STORAGE_INTERACTION_RANGE } from '../../../storage-spot-consts';
import { isTribeRole } from '../../../entities/tribe/tribe-role-utils';
import { TribeRole } from '../../../entities/tribe/tribe-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { EntityId } from '../../../entities/entities-types';
import { BuildingEntity } from '../../../entities/buildings/building-types';
import { HUMAN_INTERACTION_PROXIMITY } from '../../../human-consts';
import {
  createDeliveryPlan,
  MOVER_DELIVERY_RANGE,
  MOVER_MIN_FOOD_TO_DELIVER,
  MOVER_OWN_FOOD_RESERVE,
} from '../../../entities/tribe/tribe-delivery-utils';

// Blackboard keys
const DELIVERY_PLAN_KEY = 'moverDeliveryPlan';
const DELIVERY_SOURCE_ID_KEY = 'moverDeliverySourceId';
const DELIVERY_TARGET_ID_KEY = 'moverDeliveryTargetId';
const DELIVERY_PHASE_KEY = 'moverDeliveryPhase';

// Delivery phases
type DeliveryPhase = 'pickup' | 'deliver' | 'handoff';

/**
 * Creates the MOVER delivery behavior.
 * This behavior allows MOVERs to pick up food from storage and deliver it to tribe members in need.
 */
export function createMoverDeliveryBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Selector<HumanEntity>(
    [
      // Continue an existing delivery
      new Sequence<HumanEntity>(
        [
          // Check if we have an active delivery in progress
          new ConditionNode<HumanEntity>(
            (_human, _context, blackboard) => {
              const phase = Blackboard.get<DeliveryPhase>(blackboard, DELIVERY_PHASE_KEY);
              const targetId = Blackboard.get<EntityId>(blackboard, DELIVERY_TARGET_ID_KEY);
              return [phase !== undefined && targetId !== undefined, `Phase: ${phase}`];
            },
            'Has Active Delivery',
            depth + 1,
          ),

          // Execute the current phase
          new ActionNode<HumanEntity>(
            (human, context, blackboard) => {
              const phase = Blackboard.get<DeliveryPhase>(blackboard, DELIVERY_PHASE_KEY);
              const targetId = Blackboard.get<EntityId>(blackboard, DELIVERY_TARGET_ID_KEY);
              const sourceId = Blackboard.get<EntityId>(blackboard, DELIVERY_SOURCE_ID_KEY);

              if (!phase || !targetId) {
                clearDeliveryState(blackboard);
                return [NodeStatus.FAILURE, 'No delivery state'];
              }

              switch (phase) {
                case 'pickup':
                  return executePickupPhase(human, context, blackboard, sourceId!);
                case 'deliver':
                case 'handoff':
                  return executeDeliverPhase(human, context, blackboard, targetId, phase === 'handoff');
                default:
                  clearDeliveryState(blackboard);
                  return [NodeStatus.FAILURE, 'Unknown phase'];
              }
            },
            'Execute Delivery Phase',
            depth + 1,
          ),
        ],
        'Continue Delivery',
        depth,
      ),

      // Start a new delivery
      new Sequence<HumanEntity>(
        [
          // Check if we're a mover with available capacity
          new ConditionNode<HumanEntity>(
            (human, context) => {
              if (!isTribeRole(human, TribeRole.Mover, context.gameState)) {
                return [false, 'Not a Mover'];
              }

              if (!human.isAdult) {
                return [false, 'Not an adult'];
              }

              if (!human.leaderId) {
                return [false, 'No tribe'];
              }

              return [true, 'Ready to deliver'];
            },
            'Can Deliver',
            depth + 1,
          ),

          // Create a delivery plan
          new ActionNode<HumanEntity>(
            (human, context, blackboard) => {
              const plan = createDeliveryPlan(human, context.gameState);

              if (!plan) {
                return [NodeStatus.FAILURE, 'No delivery needed'];
              }

              // Store the plan
              Blackboard.set(blackboard, DELIVERY_PLAN_KEY, {
                sourceType: plan.source.type,
                sourceId: plan.source.entity.id,
                targetId: plan.target.entity.id,
                isMeshDelivery: plan.isMeshDelivery,
              });

              // Determine starting phase
              const availableFood = human.food.length - MOVER_OWN_FOOD_RESERVE;
              const hasEnoughFood = availableFood >= MOVER_MIN_FOOD_TO_DELIVER;

              if (hasEnoughFood) {
                // We have food, go directly to deliver
                Blackboard.set(blackboard, DELIVERY_PHASE_KEY, plan.isMeshDelivery ? 'handoff' : 'deliver');
                Blackboard.set(blackboard, DELIVERY_TARGET_ID_KEY, plan.target.entity.id);
              } else {
                // Need to pick up food first
                Blackboard.set(blackboard, DELIVERY_PHASE_KEY, 'pickup');
                Blackboard.set(blackboard, DELIVERY_SOURCE_ID_KEY, plan.source.entity.id);
                Blackboard.set(blackboard, DELIVERY_TARGET_ID_KEY, plan.target.entity.id);
              }

              return [NodeStatus.SUCCESS, `Plan: ${plan.source.type} -> target, mesh=${plan.isMeshDelivery}`];
            },
            'Create Delivery Plan',
            depth + 1,
          ),

          // Execute the first step
          new ActionNode<HumanEntity>(
            (human, context, blackboard) => {
              const phase = Blackboard.get<DeliveryPhase>(blackboard, DELIVERY_PHASE_KEY);
              const targetId = Blackboard.get<EntityId>(blackboard, DELIVERY_TARGET_ID_KEY);
              const sourceId = Blackboard.get<EntityId>(blackboard, DELIVERY_SOURCE_ID_KEY);

              if (!phase || !targetId) {
                clearDeliveryState(blackboard);
                return [NodeStatus.FAILURE, 'No delivery state'];
              }

              switch (phase) {
                case 'pickup':
                  return executePickupPhase(human, context, blackboard, sourceId!);
                case 'deliver':
                case 'handoff':
                  return executeDeliverPhase(human, context, blackboard, targetId, phase === 'handoff');
                default:
                  clearDeliveryState(blackboard);
                  return [NodeStatus.FAILURE, 'Unknown phase'];
              }
            },
            'Start Delivery',
            depth + 1,
          ),
        ],
        'New Delivery',
        depth,
      ),
    ],
    'Mover Delivery Behavior',
    depth,
  );
}

/**
 * Executes the pickup phase - go to storage and retrieve food
 */
function executePickupPhase(
  human: HumanEntity,
  context: UpdateContext,
  blackboard: BlackboardData,
  sourceId: EntityId,
): [NodeStatus, string] {
  const source = context.gameState.entities.entities[sourceId];

  if (!source) {
    clearDeliveryState(blackboard);
    return [NodeStatus.FAILURE, 'Source not found'];
  }

  const { width: worldWidth, height: worldHeight } = context.gameState.mapDimensions;
  const distance = calculateWrappedDistance(human.position, source.position, worldWidth, worldHeight);

  // Check if we've picked up enough food
  const availableFood = human.food.length - MOVER_OWN_FOOD_RESERVE;
  if (availableFood >= MOVER_MIN_FOOD_TO_DELIVER) {
    // Have food, transition to deliver phase
    const plan = Blackboard.get<{ isMeshDelivery: boolean }>(blackboard, DELIVERY_PLAN_KEY);
    Blackboard.set(blackboard, DELIVERY_PHASE_KEY, plan?.isMeshDelivery ? 'handoff' : 'deliver');
    Blackboard.delete(blackboard, DELIVERY_SOURCE_ID_KEY);
    return [NodeStatus.SUCCESS, 'Picked up food, ready to deliver'];
  }

  // Check if source is a storage spot with food
  const storageSource = source as BuildingEntity;
  if (
    source.type === 'building' &&
    storageSource.buildingType === 'storageSpot' &&
    (!storageSource.storedFood || storageSource.storedFood.length === 0)
  ) {
    clearDeliveryState(blackboard);
    return [NodeStatus.FAILURE, 'Storage is empty'];
  }

  // Check if source is a mover with food
  const moverSource = source as HumanEntity;
  if (source.type === 'human' && moverSource.food.length <= MOVER_OWN_FOOD_RESERVE) {
    clearDeliveryState(blackboard);
    return [NodeStatus.FAILURE, 'Mover has no excess food'];
  }

  // Move to source if not close enough
  if (distance > STORAGE_INTERACTION_RANGE) {
    human.activeAction = 'moving';
    human.target = source.position;
    human.direction = dirToTarget(human.position, source.position, context.gameState.mapDimensions);
    return [NodeStatus.RUNNING, `Moving to source (${distance.toFixed(1)}px)`];
  }

  // At source, retrieve food
  if (source.type === 'building') {
    // Use retrieving action for storage spots
    human.activeAction = 'retrieving';
    human.target = undefined;
    return [NodeStatus.RUNNING, 'Retrieving from storage'];
  } else {
    // For mover handoff when receiving food, the source mover should deliver to us
    // We stay idle and wait for the other mover to deliver to us
    // The other mover will set their action to 'delivering' when they reach us
    human.activeAction = 'idle';
    human.target = undefined;
    
    // Check if we've received enough food
    const newAvailableFood = human.food.length - MOVER_OWN_FOOD_RESERVE;
    if (newAvailableFood >= MOVER_MIN_FOOD_TO_DELIVER) {
      // We now have food, transition to deliver phase
      const plan = Blackboard.get<{ isMeshDelivery: boolean }>(blackboard, DELIVERY_PLAN_KEY);
      Blackboard.set(blackboard, DELIVERY_PHASE_KEY, plan?.isMeshDelivery ? 'handoff' : 'deliver');
      Blackboard.delete(blackboard, DELIVERY_SOURCE_ID_KEY);
      return [NodeStatus.SUCCESS, 'Received food from mover, ready to deliver'];
    }

    return [NodeStatus.RUNNING, 'Waiting for handoff from other mover'];
  }
}

/**
 * Executes the deliver phase - go to target and give food
 */
function executeDeliverPhase(
  human: HumanEntity,
  context: UpdateContext,
  blackboard: BlackboardData,
  targetId: EntityId,
  isHandoff: boolean,
): [NodeStatus, string] {
  const target = context.gameState.entities.entities[targetId] as HumanEntity | undefined;

  if (!target || target.type !== 'human') {
    clearDeliveryState(blackboard);
    return [NodeStatus.FAILURE, 'Target not found'];
  }

  // Check if we have food to deliver
  const availableFood = human.food.length - MOVER_OWN_FOOD_RESERVE;
  if (availableFood < MOVER_MIN_FOOD_TO_DELIVER) {
    clearDeliveryState(blackboard);
    return [NodeStatus.FAILURE, 'No food to deliver'];
  }

  // Check if target still needs food
  const targetNeedsFood = target.food.length < target.maxFood;
  if (!targetNeedsFood) {
    clearDeliveryState(blackboard);
    return [NodeStatus.SUCCESS, 'Target no longer needs food'];
  }

  const { width: worldWidth, height: worldHeight } = context.gameState.mapDimensions;
  const distance = calculateWrappedDistance(human.position, target.position, worldWidth, worldHeight);

  // Move to target if not close enough
  const deliveryRange = isHandoff ? HUMAN_INTERACTION_PROXIMITY : MOVER_DELIVERY_RANGE;
  if (distance > deliveryRange) {
    human.activeAction = 'moving';
    human.target = target.position;
    human.direction = dirToTarget(human.position, target.position, context.gameState.mapDimensions);
    return [NodeStatus.RUNNING, `Moving to ${isHandoff ? 'mover' : 'target'} (${distance.toFixed(1)}px)`];
  }

  // At target, set delivering action - the interaction system will handle the food transfer
  human.activeAction = 'delivering';
  human.target = target.id;

  // Check if we've delivered all our excess food or target is full
  const stillHasExcessFood = human.food.length > MOVER_OWN_FOOD_RESERVE;
  const targetStillNeedsFood = target.food.length < target.maxFood;

  if (!stillHasExcessFood || !targetStillNeedsFood) {
    clearDeliveryState(blackboard);
    human.activeAction = 'idle';
    human.target = undefined;
    return [NodeStatus.SUCCESS, 'Delivery complete'];
  }

  return [NodeStatus.RUNNING, `Delivering food (${availableFood} left)`];
}

/**
 * Clears the delivery state from the blackboard
 */
function clearDeliveryState(blackboard: BlackboardData): void {
  Blackboard.delete(blackboard, DELIVERY_PLAN_KEY);
  Blackboard.delete(blackboard, DELIVERY_SOURCE_ID_KEY);
  Blackboard.delete(blackboard, DELIVERY_TARGET_ID_KEY);
  Blackboard.delete(blackboard, DELIVERY_PHASE_KEY);
}
