import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { Selector } from '../nodes/composite-nodes';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { BlackboardData } from '../behavior-tree-blackboard';
import { STORAGE_INTERACTION_RANGE } from '../../../storage-spot-consts';
import { BuildingEntity } from '../../../entities/buildings/building-types';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { IndexedWorldState } from '../../../world-index/world-index-types';

/**
 * Creates a behavior for stealing food from enemy storage spots.
 * NPCs will opportunistically steal when hostile tribes have undefended storage.
 */
export function createStorageStealBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Selector<HumanEntity>(
    [
      new Sequence<HumanEntity>(
        [
          // Check if stealing is possible and safe
          new ConditionNode<HumanEntity>(
            (human: HumanEntity, context: UpdateContext, _blackboard: BlackboardData) => {
              // Must be an adult
              if (!human.isAdult) {
                return [false, 'Not an adult'];
              }

              // Must have inventory space
              if (human.food.length >= human.maxFood) {
                return [false, 'Inventory full'];
              }

              // Find nearby enemy storage spots
              const indexedState = context.gameState as IndexedWorldState;
              const nearbyBuildings = indexedState.search.building.byRadius(human.position, 150);

              const storage = nearbyBuildings.find((building) => {
                const buildingEntity = building as BuildingEntity;

                // Must be a storage spot with food
                if (
                  buildingEntity.buildingType !== 'storageSpot' ||
                  !buildingEntity.isConstructed ||
                  !buildingEntity.storedFood ||
                  buildingEntity.storedFood.length === 0
                ) {
                  return false;
                }

                // Must belong to a different tribe
                if (buildingEntity.ownerId === human.leaderId) {
                  return false;
                }

                return true;
              });

              if (!storage) {
                return [false, 'No storage for stealing nearby'];
              }

              return [
                true,
                `Storage for stealing found at distance ${calculateWrappedDistance(
                  human.position,
                  storage.position,
                  context.gameState.mapDimensions.width,
                  context.gameState.mapDimensions.height,
                ).toFixed(1)}`,
              ];
            },
            'Check for Storage for Stealing',
            depth + 1,
          ),

          // Navigate to storage and steal
          new ActionNode<HumanEntity>(
            (human: HumanEntity, context: UpdateContext, _blackboard: BlackboardData) => {
              // Find nearest storage for stealing
              const indexedState = context.gameState as IndexedWorldState;
              const nearbyBuildings = indexedState.search.building.byRadius(human.position, 150);

              const storages = nearbyBuildings.filter((building) => {
                const buildingEntity = building as BuildingEntity;

                // Must be a storage spot with food
                if (
                  buildingEntity.buildingType !== 'storageSpot' ||
                  !buildingEntity.isConstructed ||
                  !buildingEntity.storedFood ||
                  buildingEntity.storedFood.length === 0
                ) {
                  return false;
                }

                // Must belong to a different tribe
                if (buildingEntity.ownerId === human.leaderId) {
                  return false;
                }

                return true;
              });

              if (storages.length === 0) {
                return [NodeStatus.FAILURE, 'No undefended storage available'];
              }

              // Find closest storage
              let closestStorage: BuildingEntity | null = null;
              let closestDistance = Infinity;

              for (const storage of storages) {
                const distance = calculateWrappedDistance(
                  human.position,
                  storage.position,
                  context.gameState.mapDimensions.width,
                  context.gameState.mapDimensions.height,
                );

                if (distance < closestDistance) {
                  closestDistance = distance;
                  closestStorage = storage as BuildingEntity;
                }
              }

              if (!closestStorage) {
                return [NodeStatus.FAILURE, 'No storage found'];
              }

              // Check if within interaction range
              if (closestDistance <= STORAGE_INTERACTION_RANGE) {
                // Within range - interaction will happen automatically
                human.activeAction = 'idle';
                human.target = undefined;
                return [NodeStatus.SUCCESS, 'Stealing food'];
              }

              // Navigate toward storage
              human.activeAction = 'moving';
              human.target = closestStorage.position;
              return [NodeStatus.RUNNING, `Moving to storage (${closestDistance.toFixed(1)}px away)`];
            },
            'Navigate to Storage and Steal',
            depth + 1,
          ),
        ],
        'Steal Sequence',
        depth,
      ),
    ],
    'Storage Steal Behavior',
    depth,
  );
}
