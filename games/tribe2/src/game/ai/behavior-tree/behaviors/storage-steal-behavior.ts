import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { Selector } from '../nodes/composite-nodes';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext, DiplomacyStatus } from '../../../world-types';
import { BlackboardData } from '../behavior-tree-blackboard';
import { STORAGE_INTERACTION_RANGE, STORAGE_STEAL_DETECTION_RANGE } from '../../../storage-spot-consts';
import { BuildingEntity } from '../../../entities/buildings/building-types';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { getTribeMembers } from '../../../utils/family-tribe-utils';

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

              // Must have a leader with diplomacy info
              if (!human.leaderId) {
                return [false, 'No tribe leader'];
              }

              const leader = context.gameState.entities.entities[human.leaderId] as HumanEntity | undefined;
              if (!leader || !leader.diplomacy) {
                return [false, 'No diplomacy info'];
              }

              // Find nearby enemy storage spots
              const indexedState = context.gameState as IndexedWorldState;
              const nearbyBuildings = indexedState.search.building.byRadius(human.position, 150);

              const enemyStorage = nearbyBuildings.find((building) => {
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

                // Must be hostile
                const diplomacyStatus = leader.diplomacy![buildingEntity.ownerId];
                if (diplomacyStatus !== DiplomacyStatus.Hostile) {
                  return false;
                }

                // Check for nearby defenders
                const defenders = getTribeMembers(
                  { leaderId: buildingEntity.ownerId } as HumanEntity,
                  context.gameState,
                );

                for (const defender of defenders) {
                  const distance = calculateWrappedDistance(
                    human.position,
                    defender.position,
                    context.gameState.mapDimensions.width,
                    context.gameState.mapDimensions.height,
                  );

                  if (distance <= STORAGE_STEAL_DETECTION_RANGE) {
                    // Defender nearby - too risky
                    return false;
                  }
                }

                return true;
              });

              if (!enemyStorage) {
                return [false, 'No undefended enemy storage nearby'];
              }

              return [
                true,
                `Undefended enemy storage found at distance ${calculateWrappedDistance(
                  human.position,
                  enemyStorage.position,
                  context.gameState.mapDimensions.width,
                  context.gameState.mapDimensions.height,
                ).toFixed(1)}`,
              ];
            },
            'Check for Undefended Enemy Storage',
            depth + 1,
          ),

          // Navigate to storage and steal
          new ActionNode<HumanEntity>(
            (human: HumanEntity, context: UpdateContext, _blackboard: BlackboardData) => {
              // Must have a leader with diplomacy info
              if (!human.leaderId) {
                return [NodeStatus.FAILURE, 'No tribe leader'];
              }

              const leader = context.gameState.entities.entities[human.leaderId] as HumanEntity | undefined;
              if (!leader || !leader.diplomacy) {
                return [NodeStatus.FAILURE, 'No diplomacy info'];
              }

              // Find nearest undefended enemy storage
              const indexedState = context.gameState as IndexedWorldState;
              const nearbyBuildings = indexedState.search.building.byRadius(human.position, 150);

              const enemyStorages = nearbyBuildings.filter((building) => {
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

                // Must be hostile
                const diplomacyStatus = leader.diplomacy![buildingEntity.ownerId];
                if (diplomacyStatus !== DiplomacyStatus.Hostile) {
                  return false;
                }

                // Check for nearby defenders
                const defenders = getTribeMembers(
                  { leaderId: buildingEntity.ownerId } as HumanEntity,
                  context.gameState,
                );

                for (const defender of defenders) {
                  const distance = calculateWrappedDistance(
                    human.position,
                    defender.position,
                    context.gameState.mapDimensions.width,
                    context.gameState.mapDimensions.height,
                  );

                  if (distance <= STORAGE_STEAL_DETECTION_RANGE) {
                    // Defender nearby - too risky
                    return false;
                  }
                }

                return true;
              });

              if (enemyStorages.length === 0) {
                return [NodeStatus.FAILURE, 'No undefended storage available'];
              }

              // Find closest storage
              let closestStorage: BuildingEntity | null = null;
              let closestDistance = Infinity;

              for (const storage of enemyStorages) {
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
              return [NodeStatus.RUNNING, `Moving to enemy storage (${closestDistance.toFixed(1)}px away)`];
            },
            'Navigate to Enemy Storage and Steal',
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
