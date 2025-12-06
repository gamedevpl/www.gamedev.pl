import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { Selector } from '../nodes/composite-nodes';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { BlackboardData } from '../behavior-tree-blackboard';
import { STORAGE_INTERACTION_RANGE } from '../../../storage-spot-consts';
import { findClosestStorage, findNearbyTribeStorageWithCapacity } from '../../../utils/storage-utils';

/**
 * Creates a behavior for depositing excess food into tribe storage spots.
 * NPCs will deposit food when they have more than 50% of their carrying capacity.
 */
export function createStorageDepositBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Selector<HumanEntity>(
    [
      new Sequence<HumanEntity>(
        [
          // Check if human has excess food and storage is available
          new ConditionNode<HumanEntity>(
            (human: HumanEntity, context: UpdateContext, _blackboard: BlackboardData) => {
              // Must have excess food (more than 20% capacity)
              if (human.food.length <= human.maxFood * 0.2) {
                return [false, 'Not enough food to deposit'];
              }

              // Must be an adult
              if (!human.isAdult) {
                return [false, 'Not an adult'];
              }

              // Find nearby storage spots belonging to the tribe with capacity
              const tribeStorages = findNearbyTribeStorageWithCapacity(human, context.gameState);
              const closest = findClosestStorage(human, tribeStorages, context.gameState);
              const tribeStorage = closest?.storage;

              if (!tribeStorage) {
                return [false, 'No available tribe storage nearby'];
              }

              return [
                true,
                `Storage found at distance ${closest.distance.toFixed(1)}`,
              ];
            },
            'Check for Excess Food and Storage',
            depth + 1,
          ),

          // Navigate to storage and deposit
          new ActionNode<HumanEntity>(
            (human: HumanEntity, context: UpdateContext, _blackboard: BlackboardData) => {
              // Find nearest tribe storage spot with capacity
              const tribeStorages = findNearbyTribeStorageWithCapacity(human, context.gameState);

              if (tribeStorages.length === 0) {
                return [NodeStatus.FAILURE, 'No storage available'];
              }

              // Find closest storage
              const closest = findClosestStorage(human, tribeStorages, context.gameState);

              if (!closest) {
                return [NodeStatus.FAILURE, 'No storage found'];
              }

              const closestStorage = closest.storage;
              const closestDistance = closest.distance;

              // Check if within interaction range
              if (closestDistance <= STORAGE_INTERACTION_RANGE) {
                // Within range - set depositing action so interaction can happen
                human.activeAction = 'depositing';
                human.target = undefined;
                return [NodeStatus.SUCCESS, 'Depositing food'];
              }

              // Navigate toward storage
              human.activeAction = 'moving';
              human.target = closestStorage.position;
              return [NodeStatus.RUNNING, `Moving to storage (${closestDistance.toFixed(1)}px away)`];
            },
            'Navigate to Storage and Deposit',
            depth + 1,
          ),
        ],
        'Deposit Sequence',
        depth,
      ),
    ],
    'Storage Deposit Behavior',
    depth,
  );
}
