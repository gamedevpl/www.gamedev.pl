/**
 * Utility functions for MOVER delivery system.
 * MOVERs deliver resources from storage spots to tribe members in need,
 * prioritizing leaders, patriarchs, and warriors.
 * Supports mesh delivery where MOVERs can hand off resources to other MOVERs.
 */

import { HumanEntity } from '../characters/human/human-types';
import { BuildingEntity } from '../buildings/building-types';
import { GameWorldState } from '../../world-types';
import { IndexedWorldState } from '../../world-index/world-index-types';
import { TribeRole } from './tribe-types';
import { calculateWrappedDistance } from '../../utils/math-utils';
import { getTribeStorageSpots } from './tribe-food-utils';
import { Vector2D } from '../../utils/math-types';
import { Blackboard, BlackboardData } from '../../ai/behavior-tree/behavior-tree-blackboard';
import { getTribeLeaderForCoordination, TribalTaskData, TRIBAL_TASK_TIMEOUT_HOURS } from './tribe-task-utils';

/**
 * Constants for delivery system
 */
export const DELIVERY_PRIORITY_LEADER = 100;
export const DELIVERY_PRIORITY_PATRIARCH = 80;
export const DELIVERY_PRIORITY_WARRIOR = 60;
export const DELIVERY_PRIORITY_MOVER = 40; // Distant movers also need food
export const DELIVERY_PRIORITY_OTHER = 20;

export const MOVER_HANDOFF_RANGE = 50; // Range for MOVERs to hand off resources
export const MOVER_DELIVERY_RANGE = 100; // Range for final delivery to target
export const MOVER_FOOD_NEED_THRESHOLD = 0.4; // Consider delivering when target has < 40% food
export const MOVER_HUNGER_NEED_THRESHOLD = 80; // Hunger level that triggers need
export const MOVER_SEARCH_RADIUS = 800; // Max radius to search for delivery targets
export const MOVER_STORAGE_SEARCH_RADIUS = 600; // Max radius to search for storage spots
export const MOVER_MIN_FOOD_TO_DELIVER = 1; // Minimum food items required to attempt delivery
export const MOVER_OWN_FOOD_RESERVE = 2; // Keep at least this much food for self

/**
 * Represents a tribe member who needs resources delivered
 */
export interface DeliveryTarget {
  entity: HumanEntity;
  priority: number;
  distance: number;
  needScore: number; // Combined measure of how urgently they need food
  position: Vector2D;
}

/**
 * Represents a delivery source (storage spot or mover with food)
 */
export interface DeliverySource {
  type: 'storage' | 'mover';
  entity: BuildingEntity | HumanEntity;
  foodAvailable: number;
  distance: number;
  position: Vector2D;
}

/**
 * Represents a planned delivery
 */
export interface DeliveryPlan {
  source: DeliverySource;
  target: DeliveryTarget;
  isMeshDelivery: boolean; // True if handing off to another mover
}

/**
 * Gets the priority for a tribe member based on their role
 */
export function getDeliveryPriority(human: HumanEntity, gameState: GameWorldState): number {
  // Leader has highest priority
  if (human.leaderId === human.id && human.tribeControl) {
    return DELIVERY_PRIORITY_LEADER;
  }

  // Check role
  switch (human.tribeRole) {
    case TribeRole.Leader:
      return DELIVERY_PRIORITY_LEADER;
    case TribeRole.Warrior:
      return DELIVERY_PRIORITY_WARRIOR;
    case TribeRole.Hunter:
      return DELIVERY_PRIORITY_WARRIOR; // Hunters have similar priority to warriors
    case TribeRole.Mover:
      return DELIVERY_PRIORITY_MOVER;
    default:
      break;
  }

  // Check if this is a patriarch (male with children in tribe)
  if (human.gender === 'male' && human.isAdult) {
    const indexedState = gameState as IndexedWorldState;
    // Males can only be fathers, so only search by fatherId
    const children = indexedState.search.human.byProperty('fatherId', human.id);
    if (children.length > 0) {
      return DELIVERY_PRIORITY_PATRIARCH;
    }
  }

  return DELIVERY_PRIORITY_OTHER;
}

/**
 * Calculates the need score for a tribe member (higher = more urgent)
 */
export function calculateNeedScore(human: HumanEntity): number {
  // Calculate hunger urgency (0-1, higher is more urgent)
  const hungerUrgency = Math.min(1, human.hunger / 150);

  // Calculate food scarcity (0-1, higher means less food)
  const foodScarcity = 1 - human.food.length / human.maxFood;

  // Pregnant females have increased urgency
  const pregnancyMultiplier = human.isPregnant ? 1.3 : 1.0;

  // Children have increased urgency
  const childMultiplier = !human.isAdult ? 1.2 : 1.0;

  return hungerUrgency * foodScarcity * pregnancyMultiplier * childMultiplier;
}

/**
 * Finds tribe members who need food delivered
 * Excludes the mover themselves and other movers who are actively delivering
 */
export function findDeliveryTargets(
  mover: HumanEntity,
  gameState: GameWorldState,
  maxDistance: number = MOVER_SEARCH_RADIUS,
): DeliveryTarget[] {
  if (!mover.leaderId) {
    return [];
  }

  const indexedState = gameState as IndexedWorldState;
  const tribeMembers = indexedState.search.human.byProperty('leaderId', mover.leaderId);
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

  const targets: DeliveryTarget[] = [];

  for (const member of tribeMembers) {
    // Skip self
    if (member.id === mover.id) continue;

    // Calculate distance
    const distance = calculateWrappedDistance(mover.position, member.position, worldWidth, worldHeight);

    // Skip if too far
    if (distance > maxDistance) continue;

    // Check if they need food
    const foodRatio = member.food.length / member.maxFood;
    const needsFood = foodRatio < MOVER_FOOD_NEED_THRESHOLD || member.hunger >= MOVER_HUNGER_NEED_THRESHOLD;

    if (!needsFood) continue;

    // Calculate priority and need score
    const priority = getDeliveryPriority(member, gameState);
    const needScore = calculateNeedScore(member);

    targets.push({
      entity: member,
      priority,
      distance,
      needScore,
      position: member.position,
    });
  }

  // Sort by priority (descending), then by need score (descending), then by distance (ascending)
  targets.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (Math.abs(a.needScore - b.needScore) > 0.1) return b.needScore - a.needScore;
    return a.distance - b.distance;
  });

  return targets;
}

/**
 * Finds delivery sources (storage spots with food or movers with excess food)
 */
export function findDeliverySources(
  mover: HumanEntity,
  gameState: GameWorldState,
  targetPosition: Vector2D,
  leaderBlackboard?: BlackboardData,
): DeliverySource[] {
  if (!mover.leaderId) {
    return [];
  }

  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const sources: DeliverySource[] = [];

  // Find storage spots with food
  const storageSpots = getTribeStorageSpots(mover.leaderId, gameState);

  for (const storage of storageSpots) {
    if (!storage.storedFood || storage.storedFood.length === 0) continue;

    const distanceToMover = calculateWrappedDistance(mover.position, storage.position, worldWidth, worldHeight);

    // Skip if too far from mover
    if (distanceToMover > MOVER_STORAGE_SEARCH_RADIUS) continue;

    // Check if already being used by too many movers
    if (leaderBlackboard) {
      const taskKey = `tribal_mover_source_${storage.id}`;
      const task = Blackboard.get<TribalTaskData>(leaderBlackboard, taskKey);
      if (task && gameState.time - task.startTime <= TRIBAL_TASK_TIMEOUT_HOURS) {
        // Allow max 2 movers per storage
        if (!task.memberIds.includes(mover.id) && task.memberIds.length >= 2) {
          continue;
        }
      }
    }

    sources.push({
      type: 'storage',
      entity: storage,
      foodAvailable: storage.storedFood.length,
      distance: distanceToMover,
      position: storage.position,
    });
  }

  // Find other movers with excess food who can hand off
  const indexedState = gameState as IndexedWorldState;
  const tribeMembers = indexedState.search.human.byProperty('leaderId', mover.leaderId);

  for (const member of tribeMembers) {
    // Skip self
    if (member.id === mover.id) continue;

    // Only consider movers
    if (member.tribeRole !== TribeRole.Mover) continue;

    // Only consider if they have excess food to share
    const excessFood = member.food.length - MOVER_OWN_FOOD_RESERVE;
    if (excessFood < MOVER_MIN_FOOD_TO_DELIVER) continue;

    const distanceToMover = calculateWrappedDistance(mover.position, member.position, worldWidth, worldHeight);

    // Only consider nearby movers for handoff
    if (distanceToMover > MOVER_HANDOFF_RANGE * 3) continue;

    // For mesh delivery: accept handoff from movers who are farther from target (closer to storage)
    // This enables a chain: Storage -> Mover A (near storage) -> Mover B (middle) -> Mover C (near target)
    const theirDistanceToTarget = calculateWrappedDistance(member.position, targetPosition, worldWidth, worldHeight);
    const ourDistanceToTarget = calculateWrappedDistance(mover.position, targetPosition, worldWidth, worldHeight);

    // Accept handoff if they are farther from target (meaning closer to storage in the chain)
    if (theirDistanceToTarget < ourDistanceToTarget) continue;

    sources.push({
      type: 'mover',
      entity: member,
      foodAvailable: excessFood,
      distance: distanceToMover,
      position: member.position,
    });
  }

  // Sort by distance
  sources.sort((a, b) => a.distance - b.distance);

  return sources;
}

/**
 * Creates a delivery plan for a mover
 * Returns the best source and target for delivery, considering mesh delivery
 */
export function createDeliveryPlan(
  mover: HumanEntity,
  gameState: GameWorldState,
): DeliveryPlan | null {
  const leader = getTribeLeaderForCoordination(mover, gameState);
  const leaderBlackboard = leader?.aiBlackboard;

  // First, find potential targets
  const targets = findDeliveryTargets(mover, gameState);

  if (targets.length === 0) {
    return null;
  }

  // Check if mover has food to deliver
  const availableFoodToDeliver = mover.food.length - MOVER_OWN_FOOD_RESERVE;

  if (availableFoodToDeliver >= MOVER_MIN_FOOD_TO_DELIVER) {
    // Mover has food, find target to deliver to
    const bestTarget = targets[0];

    // Check if there's a downstream mover we can hand off to
    const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
    const indexedState = gameState as IndexedWorldState;
    const tribeMembers = indexedState.search.human.byProperty('leaderId', mover.leaderId!);

    for (const member of tribeMembers) {
      if (member.id === mover.id) continue;
      if (member.tribeRole !== TribeRole.Mover) continue;

      const distanceToMember = calculateWrappedDistance(mover.position, member.position, worldWidth, worldHeight);
      if (distanceToMember > MOVER_HANDOFF_RANGE) continue;

      // Check if this mover is closer to the target
      const theirDistanceToTarget = calculateWrappedDistance(
        member.position,
        bestTarget.position,
        worldWidth,
        worldHeight,
      );
      const ourDistanceToTarget = calculateWrappedDistance(mover.position, bestTarget.position, worldWidth, worldHeight);

      // Check if handoff makes sense (they're closer and can carry more)
      if (theirDistanceToTarget < ourDistanceToTarget && member.food.length < member.maxFood) {
        // Hand off to this mover instead
        return {
          source: {
            type: 'mover',
            entity: mover,
            foodAvailable: availableFoodToDeliver,
            distance: 0,
            position: mover.position,
          },
          target: {
            entity: member,
            priority: DELIVERY_PRIORITY_MOVER,
            distance: distanceToMember,
            needScore: 1 - member.food.length / member.maxFood,
            position: member.position,
          },
          isMeshDelivery: true,
        };
      }
    }

    // Deliver directly to target
    return {
      source: {
        type: 'mover',
        entity: mover,
        foodAvailable: availableFoodToDeliver,
        distance: 0,
        position: mover.position,
      },
      target: bestTarget,
      isMeshDelivery: false,
    };
  }

  // Mover needs to get food from a source first
  const bestTarget = targets[0];
  const sources = findDeliverySources(mover, gameState, bestTarget.position, leaderBlackboard);

  if (sources.length === 0) {
    return null;
  }

  // Use the closest source
  const bestSource = sources[0];

  return {
    source: bestSource,
    target: bestTarget,
    isMeshDelivery: bestSource.type === 'mover',
  };
}

/**
 * Registers a mover's delivery task for coordination
 */
export function registerDeliveryTask(
  mover: HumanEntity,
  taskKey: string,
  gameState: GameWorldState,
): boolean {
  const leader = getTribeLeaderForCoordination(mover, gameState);
  if (!leader || !leader.aiBlackboard) {
    return true; // No coordination needed
  }

  const task = Blackboard.get<TribalTaskData>(leader.aiBlackboard, taskKey);

  if (!task) {
    // Create new task
    Blackboard.set(leader.aiBlackboard, taskKey, {
      memberIds: [mover.id],
      startTime: gameState.time,
      maxCapacity: 2,
    });
    return true;
  }

  // Check if task is stale
  if (gameState.time - task.startTime > TRIBAL_TASK_TIMEOUT_HOURS) {
    Blackboard.set(leader.aiBlackboard, taskKey, {
      memberIds: [mover.id],
      startTime: gameState.time,
      maxCapacity: 2,
    });
    return true;
  }

  // Check if already registered
  if (task.memberIds.includes(mover.id)) {
    return true;
  }

  // Check capacity
  if (task.memberIds.length >= (task.maxCapacity || 2)) {
    return false;
  }

  // Add to task
  task.memberIds.push(mover.id);
  Blackboard.set(leader.aiBlackboard, taskKey, task);
  return true;
}

/**
 * Unregisters a mover from a delivery task
 */
export function unregisterDeliveryTask(
  mover: HumanEntity,
  taskKey: string,
  gameState: GameWorldState,
): void {
  const leader = getTribeLeaderForCoordination(mover, gameState);
  if (!leader || !leader.aiBlackboard) {
    return;
  }

  const task = Blackboard.get<TribalTaskData>(leader.aiBlackboard, taskKey);
  if (!task) return;

  task.memberIds = task.memberIds.filter((id) => id !== mover.id);

  if (task.memberIds.length === 0) {
    Blackboard.delete(leader.aiBlackboard, taskKey);
  } else {
    Blackboard.set(leader.aiBlackboard, taskKey, task);
  }
}
