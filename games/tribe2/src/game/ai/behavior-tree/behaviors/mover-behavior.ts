/**
 * Mover Behavior - Lean Implementation
 * 
 * Movers pick up food from storage and deliver to hungry tribe members.
 * Simple state machine: find demand -> go to storage -> pickup -> deliver
 */

import { HumanEntity } from '../../../entities/characters/human/human-types';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { Blackboard, BlackboardData } from '../behavior-tree-blackboard';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { UpdateContext } from '../../../world-types';
import { TribeRole } from '../../../entities/tribe/tribe-types';
import { isTribeRole } from '../../../entities/tribe/tribe-role-utils';
import { getTribeLeaderForCoordination } from '../../../entities/tribe/tribe-task-utils';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { BuildingEntity } from '../../../entities/buildings/building-types';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { getUnclaimedDemands, claimDemand, removeDemand } from '../../../entities/tribe/logistics-utils';
import { HUMAN_INTERACTION_PROXIMITY } from '../../../human-consts';

// Blackboard keys for mover state
const MOVER_TARGET_ID = 'moverTargetId';      // Who we're delivering to
const MOVER_STORAGE_ID = 'moverStorageId';    // Where we're picking up from
const MOVER_STATE = 'moverState';             // 'pickup' | 'deliver'

/**
 * Creates the mover behavior tree.
 */
export function createMoverBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // Only movers execute this behavior
      new ConditionNode(
        (human, context) => {
          if (!human.isAdult) return [false, 'Not adult'];
          return [isTribeRole(human, TribeRole.Mover, context.gameState), 'Role check'];
        },
        'Is Mover',
        depth + 1,
      ),

      // Main mover action
      new ActionNode(
        (human, context, blackboard) => executeMover(human, context, blackboard),
        'Execute Mover',
        depth + 1,
      ),
    ],
    'Mover Behavior',
    depth,
  );
}

function executeMover(
  human: HumanEntity,
  context: UpdateContext,
  blackboard: BlackboardData,
): [NodeStatus, string] {
  const { gameState } = context;
  const leader = getTribeLeaderForCoordination(human, gameState);
  if (!leader?.aiBlackboard) {
    return [NodeStatus.FAILURE, 'No leader'];
  }

  const state = Blackboard.get<string>(blackboard, MOVER_STATE);
  const targetId = Blackboard.get<number>(blackboard, MOVER_TARGET_ID);
  const storageId = Blackboard.get<number>(blackboard, MOVER_STORAGE_ID);

  // If we have food and a target, deliver
  if (state === 'deliver' && targetId && human.food.length > 0) {
    const target = gameState.entities.entities[targetId] as HumanEntity | undefined;
    if (!target) {
      // Target gone, clear state
      clearMoverState(blackboard);
      removeDemand(leader.aiBlackboard, targetId);
      return [NodeStatus.FAILURE, 'Target gone'];
    }

    const dist = calculateWrappedDistance(human.position, target.position, gameState.mapDimensions.width, gameState.mapDimensions.height);
    
    if (dist <= HUMAN_INTERACTION_PROXIMITY) {
      // Deliver food
      const food = human.food.pop();
      if (food) {
        target.food.push(food);
        removeDemand(leader.aiBlackboard, targetId);
        clearMoverState(blackboard);
        return [NodeStatus.SUCCESS, 'Delivered food'];
      }
    }

    // Move to target
    human.activeAction = 'moving';
    human.direction = dirToTarget(human.position, target.position, gameState.mapDimensions);
    return [NodeStatus.RUNNING, `Delivering to ${targetId}`];
  }

  // If we have a storage to pick up from
  if (state === 'pickup' && storageId) {
    const storage = gameState.entities.entities[storageId] as BuildingEntity | undefined;
    if (!storage || !storage.storedFood?.length) {
      clearMoverState(blackboard);
      return [NodeStatus.FAILURE, 'Storage empty'];
    }

    const dist = calculateWrappedDistance(human.position, storage.position, gameState.mapDimensions.width, gameState.mapDimensions.height);
    
    if (dist <= HUMAN_INTERACTION_PROXIMITY) {
      // Pick up food
      const food = storage.storedFood.pop();
      if (food) {
        human.food.push(food.item);
        Blackboard.set(blackboard, MOVER_STATE, 'deliver');
        return [NodeStatus.RUNNING, 'Picked up food'];
      }
    }

    // Move to storage
    human.activeAction = 'moving';
    human.direction = dirToTarget(human.position, storage.position, gameState.mapDimensions);
    return [NodeStatus.RUNNING, `Going to storage ${storageId}`];
  }

  // Find a demand to fulfill
  const demands = getUnclaimedDemands(leader.aiBlackboard);
  if (demands.length === 0) {
    return [NodeStatus.FAILURE, 'No demands'];
  }

  // Find storage with food
  const storages = (gameState as IndexedWorldState).search.building
    .byProperty('ownerId', human.leaderId)
    .filter((b) => b.buildingType === 'storageSpot' && (b.storedFood?.length ?? 0) > 0);

  if (storages.length === 0) {
    return [NodeStatus.FAILURE, 'No supply'];
  }

  // Pick closest storage with food
  let bestStorage: BuildingEntity | null = null;
  let bestDist = Infinity;
  for (const s of storages) {
    const d = calculateWrappedDistance(human.position, s.position, gameState.mapDimensions.width, gameState.mapDimensions.height);
    if (d < bestDist) {
      bestDist = d;
      bestStorage = s;
    }
  }

  if (!bestStorage) {
    return [NodeStatus.FAILURE, 'No storage found'];
  }

  // Claim the highest priority demand
  const demand = demands[0];
  if (!claimDemand(leader.aiBlackboard, demand.requesterId, human.id)) {
    return [NodeStatus.FAILURE, 'Claim failed'];
  }

  // Set state
  Blackboard.set(blackboard, MOVER_TARGET_ID, demand.requesterId);
  Blackboard.set(blackboard, MOVER_STORAGE_ID, bestStorage.id);
  Blackboard.set(blackboard, MOVER_STATE, 'pickup');

  return [NodeStatus.RUNNING, `Claimed demand from ${demand.requesterId}`];
}

function clearMoverState(blackboard: BlackboardData): void {
  Blackboard.delete(blackboard, MOVER_TARGET_ID);
  Blackboard.delete(blackboard, MOVER_STORAGE_ID);
  Blackboard.delete(blackboard, MOVER_STATE);
}
