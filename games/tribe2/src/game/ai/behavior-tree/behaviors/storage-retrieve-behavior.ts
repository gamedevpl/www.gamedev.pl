import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { Selector } from '../nodes/composite-nodes';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { BlackboardData } from '../behavior-tree-blackboard';
import { STORAGE_INTERACTION_RANGE } from '../../../storage-spot-consts';
import { HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING } from '../../../ai-consts';
import { findClosestStorage, findNearbyTribeStorageWithFood } from '../../../utils/storage-utils';
import {
  getTribeLeaderForCoordination,
  canUseStorage,
  registerTribalStorageTask,
} from '../../../utils/tribe-task-utils';

/**
 * Creates a behavior for retrieving food from tribe storage spots.
 * NPCs will retrieve food when they are hungry and storage has food available.
 * Now includes tribal task coordination to prevent storage crowding.
 */
export function createStorageRetrieveBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Selector<HumanEntity>(
    [
      new Sequence<HumanEntity>(
        [
          // Check if human is hungry and storage has food
          new ConditionNode<HumanEntity>(
            (human: HumanEntity, context: UpdateContext, _blackboard: BlackboardData) => {
              // Must be hungry
              if (human.hunger <= HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING) {
                return [false, 'Not hungry enough'];
              }

              // Must have inventory space
              if (human.food.length >= human.maxFood) {
                return [false, 'Inventory full'];
              }

              // Find nearby storage spots belonging to the tribe with food
              const tribeStorages = findNearbyTribeStorageWithFood(human, context.gameState);
              const closest = findClosestStorage(human, tribeStorages, context.gameState);
              const tribeStorage = closest?.storage;

              if (!tribeStorage) {
                return [false, 'No tribe storage with food nearby'];
              }

              // Check if the storage spot is not too crowded (tribal coordination)
              const leader = getTribeLeaderForCoordination(human, context.gameState);
              if (leader && !canUseStorage(leader, tribeStorage.id, context.gameState.time)) {
                return [false, 'Storage busy'];
              }

              return [
                true,
                `Storage with food found at distance ${closest.distance.toFixed(1)}`,
              ];
            },
            'Check for Hunger and Storage Food',
            depth + 1,
          ),

          // Navigate to storage and retrieve
          new ActionNode<HumanEntity>(
            (human: HumanEntity, context: UpdateContext, _blackboard: BlackboardData) => {
              const leader = getTribeLeaderForCoordination(human, context.gameState);

              // Find nearest tribe storage spot with food
              const tribeStorages = findNearbyTribeStorageWithFood(human, context.gameState);

              if (tribeStorages.length === 0) {
                return [NodeStatus.FAILURE, 'No storage with food available'];
              }

              // Find closest storage
              const closest = findClosestStorage(human, tribeStorages, context.gameState);

              if (!closest) {
                return [NodeStatus.FAILURE, 'No storage found'];
              }

              const closestStorage = closest.storage;
              const closestDistance = closest.distance;

              // Check if storage is available (not too crowded)
              if (leader && !canUseStorage(leader, closestStorage.id, context.gameState.time)) {
                return [NodeStatus.FAILURE, 'Storage busy'];
              }

              // Check if within interaction range
              if (closestDistance <= STORAGE_INTERACTION_RANGE) {
                // Within range - use retrieving state for retrieve action
                // Register the task to hold the slot while retrieving
                if (leader) {
                  registerTribalStorageTask(leader, closestStorage.id, human.id, 'retrieve', context.gameState.time);
                }

                human.activeAction = 'retrieving';
                human.target = undefined;
                return [NodeStatus.SUCCESS, 'Retrieving food'];
              }

              // Navigate toward storage
              // Register the task to reserve the slot while moving
              if (leader) {
                registerTribalStorageTask(leader, closestStorage.id, human.id, 'retrieve', context.gameState.time);
              }

              human.activeAction = 'moving';
              human.target = closestStorage.position;
              return [NodeStatus.RUNNING, `Moving to storage (${closestDistance.toFixed(1)}px away)`];
            },
            'Navigate to Storage and Retrieve',
            depth + 1,
          ),
        ],
        'Retrieve Sequence',
        depth,
      ),
    ],
    'Storage Retrieve Behavior',
    depth,
  );
}
