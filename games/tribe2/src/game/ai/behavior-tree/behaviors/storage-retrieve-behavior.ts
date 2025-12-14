import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence, TribalTaskDecorator } from '../nodes';
import { Selector } from '../nodes/composite-nodes';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { BlackboardData, Blackboard } from '../behavior-tree-blackboard';
import { STORAGE_INTERACTION_RANGE } from '../../../entities/buildings/storage-spot-consts';
import { HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING } from '../../../ai-consts';
import { findClosestStorage, findNearbyTribeStorageWithFood } from '../../../utils/storage-utils';
import { MAX_USERS_PER_STORAGE, getTribeLeaderForCoordination } from '../../../entities/tribe/tribe-task-utils';
import { EntityId } from '../../../entities/entities-types';
import { BuildingEntity } from '../../../entities/buildings/building-types';
import { calculateWrappedDistance } from '../../../utils/math-utils';

const RETRIEVAL_STORAGE_KEY = 'retrievalStorageId';

/**
 * Creates a behavior for retrieving food from tribe storage spots.
 * NPCs will retrieve food when they are hungry and storage has food available.
 * Uses TribalTaskDecorator for coordination.
 */
export function createStorageRetrieveBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Selector<HumanEntity>(
    [
      new Sequence<HumanEntity>(
        [
          // Check if human is hungry and storage has food
          new ConditionNode<HumanEntity>(
            (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
              // Must be hungry
              if (human.hunger <= HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING) {
                return [false, 'Not hungry enough'];
              }

              // Must have inventory space
              if (human.food.length >= human.maxFood) {
                return [false, 'Inventory full'];
              }

              // Find nearby storage spots belonging to the tribe with food
              const leader = getTribeLeaderForCoordination(human, context.gameState);
              const tribeStorages = findNearbyTribeStorageWithFood(
                human,
                context.gameState,
                undefined,
                leader?.aiBlackboard,
                human.id,
              );
              const closest = findClosestStorage(human, tribeStorages, context.gameState);
              const tribeStorage = closest?.storage;

              if (!tribeStorage) {
                return [false, 'No tribe storage with food nearby'];
              }

              // Store the target in blackboard for the action node and decorator
              Blackboard.set(blackboard, RETRIEVAL_STORAGE_KEY, tribeStorage.id);

              return [true, `Storage with food found at distance ${closest.distance.toFixed(1)}`];
            },
            'Check for Hunger and Storage Food',
            depth + 1,
          ),

          // Navigate to storage and retrieve (Coordinated)
          new TribalTaskDecorator(
            new ActionNode<HumanEntity>(
              (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
                const storageId = Blackboard.get<EntityId>(blackboard, RETRIEVAL_STORAGE_KEY);
                if (!storageId) {
                  return [NodeStatus.FAILURE, 'No storage target'];
                }

                const storage = context.gameState.entities.entities[storageId] as BuildingEntity | undefined;
                if (!storage) {
                  Blackboard.delete(blackboard, RETRIEVAL_STORAGE_KEY);
                  return [NodeStatus.FAILURE, 'Storage not found'];
                }

                const distance = calculateWrappedDistance(
                  human.position,
                  storage.position,
                  context.gameState.mapDimensions.width,
                  context.gameState.mapDimensions.height,
                );

                // Check if within interaction range
                if (distance <= STORAGE_INTERACTION_RANGE) {
                  // Within range - use retrieving state for retrieve action
                  human.activeAction = 'retrieving';
                  human.target = undefined;
                  return [NodeStatus.SUCCESS, 'Retrieving food'];
                }

                // Navigate toward storage
                human.activeAction = 'moving';
                human.target = storage.position;
                return [NodeStatus.RUNNING, `Moving to storage (${distance.toFixed(1)}px away)`];
              },
              'Navigate to Storage and Retrieve',
              depth + 2,
            ),
            {
              taskType: 'storage',
              maxCapacity: MAX_USERS_PER_STORAGE,
              storageAction: 'retrieve',
              getTargetId: (_entity, _context, blackboard) =>
                Blackboard.get<EntityId>(blackboard, RETRIEVAL_STORAGE_KEY) ?? null,
            },
            'Coordinated Storage Retrieve',
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
