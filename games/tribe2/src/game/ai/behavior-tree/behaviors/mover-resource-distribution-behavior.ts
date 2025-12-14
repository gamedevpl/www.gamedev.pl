import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence, TribalTaskDecorator } from '../nodes';
import { Selector } from '../nodes/composite-nodes';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { STORAGE_INTERACTION_RANGE } from '../../../storage-spot-consts';
import { TribeRole } from '../../../entities/tribe/tribe-types';
import { isTribeRole } from '../../../entities/tribe/tribe-role-utils';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { EntityId } from '../../../entities/entities-types';
import { BuildingEntity } from '../../../entities/buildings/building-types';
import { MAX_USERS_PER_STORAGE } from '../../../entities/tribe/tribe-task-utils';
import { getTribeStorageSpots } from '../../../entities/tribe/tribe-food-utils';
import { getTribeMembers } from '../../../entities/tribe/family-tribe-utils';
import { PARENT_FEEDING_RANGE } from '../../../human-consts';
import {
  MOVER_HUNGRY_MEMBER_THRESHOLD,
  MOVER_STORAGE_BALANCE_THRESHOLD,
  MOVER_SEARCH_RADIUS,
} from '../../../ai-consts';

// Blackboard keys
const MOVER_SOURCE_STORAGE_KEY = 'moverSourceStorage';
const MOVER_TARGET_STORAGE_KEY = 'moverTargetStorage';
const MOVER_TARGET_MEMBER_KEY = 'moverTargetMember';
const MOVER_TASK_TYPE_KEY = 'moverTaskType';

type MoverTaskType = 'balanceStorage' | 'feedMember';

/**
 * Creates a behavior for the Mover role to distribute resources.
 * Movers perform three main tasks:
 * 1. Balance storage between spots (move from full to empty)
 * 2. Deliver food to hungry leaders
 * 3. Deliver food to hungry warriors
 */
export function createMoverBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Selector<HumanEntity>(
    [
      // Task 1: Feed hungry tribe members (leader/warriors)
      createFeedTribeMemberBehavior(depth + 1),
      // Task 2: Balance storage between spots
      createBalanceStorageBehavior(depth + 1),
    ],
    'Mover Resource Distribution',
    depth,
  );
}

/**
 * Behavior for feeding hungry tribe members (leader or warriors).
 * Priority: Leader first, then warriors.
 */
function createFeedTribeMemberBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence<HumanEntity>(
    [
      // Check if this human is a Mover
      new ConditionNode<HumanEntity>(
        (human, context) => {
          if (!isTribeRole(human, TribeRole.Mover, context.gameState)) {
            return [false, 'Not a Mover'];
          }
          if (!human.isAdult) {
            return [false, 'Not an adult'];
          }
          return [true, 'Is Mover'];
        },
        'Is Mover Role',
        depth + 1,
      ),

      // Find hungry tribe member (leader or warrior)
      new ActionNode<HumanEntity>(
        (human, context, blackboard) => {
          if (!human.leaderId) {
            return [NodeStatus.FAILURE, 'No tribe'];
          }

          const { gameState } = context;
          const tribeMembers = getTribeMembers(human, gameState);

          // Filter for hungry leader or warriors
          const hungryTargets = tribeMembers.filter((member) => {
            if (member.id === human.id) return false; // Don't feed self
            if (member.hunger < MOVER_HUNGRY_MEMBER_THRESHOLD) return false;
            if (member.tribeRole !== TribeRole.Leader && member.tribeRole !== TribeRole.Warrior) return false;
            
            // Check distance
            const distance = calculateWrappedDistance(
              human.position,
              member.position,
              gameState.mapDimensions.width,
              gameState.mapDimensions.height,
            );
            return distance <= MOVER_SEARCH_RADIUS;
          });

          if (hungryTargets.length === 0) {
            return [NodeStatus.FAILURE, 'No hungry targets'];
          }

          // Prioritize leader over warriors
          hungryTargets.sort((a, b) => {
            if (a.tribeRole === TribeRole.Leader) return -1;
            if (b.tribeRole === TribeRole.Leader) return 1;
            // Among warriors, prioritize by hunger level
            return b.hunger - a.hunger;
          });

          const target = hungryTargets[0];
          Blackboard.set(blackboard, MOVER_TARGET_MEMBER_KEY, target.id);
          Blackboard.set(blackboard, MOVER_TASK_TYPE_KEY, 'feedMember' as MoverTaskType);

          return [NodeStatus.SUCCESS, `Found hungry ${target.tribeRole}: ${target.id}`];
        },
        'Find Hungry Tribe Member',
        depth + 1,
      ),

      // Check if mover has food, if not, get from storage
      new Selector<HumanEntity>(
        [
          // Already has food
          new ConditionNode<HumanEntity>(
            (human) => {
              return [human.food.length > 0, `Has food: ${human.food.length}`];
            },
            'Has Food',
            depth + 2,
          ),
          // Get food from storage
          createRetrieveFoodForDeliveryBehavior(depth + 2),
        ],
        'Ensure Has Food',
        depth + 1,
      ),

      // Move to target and feed
      new ActionNode<HumanEntity>(
        (human, context, blackboard) => {
          const targetId = Blackboard.get<EntityId>(blackboard, MOVER_TARGET_MEMBER_KEY);
          if (!targetId) {
            return [NodeStatus.FAILURE, 'No target member'];
          }

          const target = context.gameState.entities.entities[targetId] as HumanEntity | undefined;
          if (!target || target.hunger < MOVER_HUNGRY_MEMBER_THRESHOLD / 2) {
            // Target no longer hungry or doesn't exist
            Blackboard.delete(blackboard, MOVER_TARGET_MEMBER_KEY);
            Blackboard.delete(blackboard, MOVER_TASK_TYPE_KEY);
            return [NodeStatus.SUCCESS, 'Target no longer needs food'];
          }

          if (human.food.length === 0) {
            Blackboard.delete(blackboard, MOVER_TARGET_MEMBER_KEY);
            Blackboard.delete(blackboard, MOVER_TASK_TYPE_KEY);
            return [NodeStatus.FAILURE, 'No food to deliver'];
          }

          const distance = calculateWrappedDistance(
            human.position,
            target.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          if (distance <= PARENT_FEEDING_RANGE) {
            // Close enough to feed
            human.activeAction = 'tribeFeeding';
            human.target = target.id;
            Blackboard.delete(blackboard, MOVER_TARGET_MEMBER_KEY);
            Blackboard.delete(blackboard, MOVER_TASK_TYPE_KEY);
            return [NodeStatus.SUCCESS, 'Feeding tribe member'];
          }

          // Move toward target
          human.activeAction = 'moving';
          human.target = target.position;
          return [NodeStatus.RUNNING, `Moving to ${target.tribeRole} (${distance.toFixed(0)}px)`];
        },
        'Move To Member and Feed',
        depth + 1,
      ),
    ],
    'Feed Tribe Member',
    depth,
  );
}

/**
 * Helper behavior to retrieve food from storage for delivery.
 */
function createRetrieveFoodForDeliveryBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence<HumanEntity>(
    [
      // Find storage with food
      new ActionNode<HumanEntity>(
        (human, context, blackboard) => {
          if (!human.leaderId) {
            return [NodeStatus.FAILURE, 'No tribe'];
          }

          const storages = getTribeStorageSpots(human.leaderId, context.gameState);
          const storagesWithFood = storages.filter((s) => s.storedFood && s.storedFood.length > 0);

          if (storagesWithFood.length === 0) {
            return [NodeStatus.FAILURE, 'No storage with food'];
          }

          // Find closest storage with food
          let closest: BuildingEntity | null = null;
          let closestDist = Infinity;

          for (const storage of storagesWithFood) {
            const dist = calculateWrappedDistance(
              human.position,
              storage.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );
            if (dist < closestDist) {
              closestDist = dist;
              closest = storage;
            }
          }

          if (!closest) {
            return [NodeStatus.FAILURE, 'No nearby storage'];
          }

          Blackboard.set(blackboard, MOVER_SOURCE_STORAGE_KEY, closest.id);
          return [NodeStatus.SUCCESS, 'Found storage with food'];
        },
        'Find Storage With Food',
        depth + 1,
      ),

      // Navigate and retrieve
      new TribalTaskDecorator(
        new ActionNode<HumanEntity>(
          (human, context, blackboard) => {
            const storageId = Blackboard.get<EntityId>(blackboard, MOVER_SOURCE_STORAGE_KEY);
            if (!storageId) {
              return [NodeStatus.FAILURE, 'No source storage'];
            }

            const storage = context.gameState.entities.entities[storageId] as BuildingEntity | undefined;
            if (!storage || !storage.storedFood || storage.storedFood.length === 0) {
              Blackboard.delete(blackboard, MOVER_SOURCE_STORAGE_KEY);
              return [NodeStatus.FAILURE, 'Storage empty or missing'];
            }

            const distance = calculateWrappedDistance(
              human.position,
              storage.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );

            if (distance <= STORAGE_INTERACTION_RANGE) {
              human.activeAction = 'retrieving';
              human.target = undefined;
              Blackboard.delete(blackboard, MOVER_SOURCE_STORAGE_KEY);
              return [NodeStatus.SUCCESS, 'Retrieved food'];
            }

            human.activeAction = 'moving';
            human.target = storage.position;
            return [NodeStatus.RUNNING, `Moving to storage (${distance.toFixed(0)}px)`];
          },
          'Navigate to Storage and Retrieve',
          depth + 2,
        ),
        {
          taskType: 'storage',
          maxCapacity: MAX_USERS_PER_STORAGE,
          storageAction: 'retrieve',
          getTargetId: (_entity, _context, blackboard) =>
            Blackboard.get<EntityId>(blackboard, MOVER_SOURCE_STORAGE_KEY) ?? null,
        },
        'Mover Retrieve Task',
        depth + 1,
      ),
    ],
    'Retrieve Food for Delivery',
    depth,
  );
}

/**
 * Behavior for balancing storage between spots.
 * Moves food from high-capacity storage to low-capacity storage.
 */
function createBalanceStorageBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence<HumanEntity>(
    [
      // Check if this human is a Mover
      new ConditionNode<HumanEntity>(
        (human, context) => {
          if (!isTribeRole(human, TribeRole.Mover, context.gameState)) {
            return [false, 'Not a Mover'];
          }
          if (!human.isAdult) {
            return [false, 'Not an adult'];
          }
          return [true, 'Is Mover'];
        },
        'Is Mover Role (Storage)',
        depth + 1,
      ),

      // Find storage imbalance
      new ActionNode<HumanEntity>(
        (human, context, blackboard) => {
          if (!human.leaderId) {
            return [NodeStatus.FAILURE, 'No tribe'];
          }

          const storages = getTribeStorageSpots(human.leaderId, context.gameState);
          if (storages.length < 2) {
            return [NodeStatus.FAILURE, 'Not enough storage spots'];
          }

          // Calculate fill ratio for each storage
          const storageStats = storages.map((s) => ({
            storage: s,
            fillRatio: (s.storedFood?.length ?? 0) / (s.storageCapacity ?? 1),
            food: s.storedFood?.length ?? 0,
            capacity: s.storageCapacity ?? 0,
          }));

          // Sort by fill ratio
          storageStats.sort((a, b) => b.fillRatio - a.fillRatio);

          const fullest = storageStats[0];
          const emptiest = storageStats[storageStats.length - 1];

          // Check if imbalance is significant enough
          const imbalance = fullest.fillRatio - emptiest.fillRatio;
          if (imbalance < MOVER_STORAGE_BALANCE_THRESHOLD) {
            return [NodeStatus.FAILURE, `Balanced (diff: ${(imbalance * 100).toFixed(0)}%)`];
          }

          // Must have food to move
          if (fullest.food === 0) {
            return [NodeStatus.FAILURE, 'No food to balance'];
          }

          // Check if target has capacity
          if (emptiest.food >= emptiest.capacity) {
            return [NodeStatus.FAILURE, 'Target storage full'];
          }

          Blackboard.set(blackboard, MOVER_SOURCE_STORAGE_KEY, fullest.storage.id);
          Blackboard.set(blackboard, MOVER_TARGET_STORAGE_KEY, emptiest.storage.id);
          Blackboard.set(blackboard, MOVER_TASK_TYPE_KEY, 'balanceStorage' as MoverTaskType);

          return [
            NodeStatus.SUCCESS,
            `Imbalance: ${(fullest.fillRatio * 100).toFixed(0)}% -> ${(emptiest.fillRatio * 100).toFixed(0)}%`,
          ];
        },
        'Find Storage Imbalance',
        depth + 1,
      ),

      // Check if already carrying food OR need to pick up from source
      new Selector<HumanEntity>(
        [
          // Already has food from this task
          new ConditionNode<HumanEntity>(
            (human) => {
              return [human.food.length > 0, `Has food: ${human.food.length}`];
            },
            'Has Food for Balancing',
            depth + 2,
          ),
          // Pick up from source storage
          new TribalTaskDecorator(
            new ActionNode<HumanEntity>(
              (human, context, blackboard) => {
                const sourceId = Blackboard.get<EntityId>(blackboard, MOVER_SOURCE_STORAGE_KEY);
                if (!sourceId) {
                  return [NodeStatus.FAILURE, 'No source storage'];
                }

                const source = context.gameState.entities.entities[sourceId] as BuildingEntity | undefined;
                if (!source || !source.storedFood || source.storedFood.length === 0) {
                  Blackboard.delete(blackboard, MOVER_SOURCE_STORAGE_KEY);
                  Blackboard.delete(blackboard, MOVER_TARGET_STORAGE_KEY);
                  Blackboard.delete(blackboard, MOVER_TASK_TYPE_KEY);
                  return [NodeStatus.FAILURE, 'Source empty'];
                }

                const distance = calculateWrappedDistance(
                  human.position,
                  source.position,
                  context.gameState.mapDimensions.width,
                  context.gameState.mapDimensions.height,
                );

                if (distance <= STORAGE_INTERACTION_RANGE) {
                  human.activeAction = 'retrieving';
                  human.target = undefined;
                  return [NodeStatus.SUCCESS, 'Retrieved from source'];
                }

                human.activeAction = 'moving';
                human.target = source.position;
                return [NodeStatus.RUNNING, `Moving to source (${distance.toFixed(0)}px)`];
              },
              'Pickup From Source Storage',
              depth + 3,
            ),
            {
              taskType: 'storage',
              maxCapacity: MAX_USERS_PER_STORAGE,
              storageAction: 'retrieve',
              getTargetId: (_entity, _context, blackboard) =>
                Blackboard.get<EntityId>(blackboard, MOVER_SOURCE_STORAGE_KEY) ?? null,
            },
            'Mover Balance Retrieve Task',
            depth + 2,
          ),
        ],
        'Get Food From Source',
        depth + 1,
      ),

      // Deliver to target storage
      new TribalTaskDecorator(
        new ActionNode<HumanEntity>(
          (human, context, blackboard) => {
            const targetId = Blackboard.get<EntityId>(blackboard, MOVER_TARGET_STORAGE_KEY);
            if (!targetId) {
              return [NodeStatus.FAILURE, 'No target storage'];
            }

            const target = context.gameState.entities.entities[targetId] as BuildingEntity | undefined;
            if (!target) {
              Blackboard.delete(blackboard, MOVER_SOURCE_STORAGE_KEY);
              Blackboard.delete(blackboard, MOVER_TARGET_STORAGE_KEY);
              Blackboard.delete(blackboard, MOVER_TASK_TYPE_KEY);
              return [NodeStatus.FAILURE, 'Target storage missing'];
            }

            if (human.food.length === 0) {
              Blackboard.delete(blackboard, MOVER_SOURCE_STORAGE_KEY);
              Blackboard.delete(blackboard, MOVER_TARGET_STORAGE_KEY);
              Blackboard.delete(blackboard, MOVER_TASK_TYPE_KEY);
              return [NodeStatus.FAILURE, 'No food to deposit'];
            }

            // Check if target is full
            if ((target.storedFood?.length ?? 0) >= (target.storageCapacity ?? 0)) {
              Blackboard.delete(blackboard, MOVER_SOURCE_STORAGE_KEY);
              Blackboard.delete(blackboard, MOVER_TARGET_STORAGE_KEY);
              Blackboard.delete(blackboard, MOVER_TASK_TYPE_KEY);
              return [NodeStatus.FAILURE, 'Target storage full'];
            }

            const distance = calculateWrappedDistance(
              human.position,
              target.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );

            if (distance <= STORAGE_INTERACTION_RANGE) {
              human.activeAction = 'depositing';
              human.target = undefined;
              Blackboard.delete(blackboard, MOVER_SOURCE_STORAGE_KEY);
              Blackboard.delete(blackboard, MOVER_TARGET_STORAGE_KEY);
              Blackboard.delete(blackboard, MOVER_TASK_TYPE_KEY);
              return [NodeStatus.SUCCESS, 'Deposited to target'];
            }

            human.activeAction = 'moving';
            human.target = target.position;
            return [NodeStatus.RUNNING, `Moving to target (${distance.toFixed(0)}px)`];
          },
          'Deliver to Target Storage',
          depth + 2,
        ),
        {
          taskType: 'storage',
          maxCapacity: MAX_USERS_PER_STORAGE,
          storageAction: 'deposit',
          getTargetId: (_entity, _context, blackboard) =>
            Blackboard.get<EntityId>(blackboard, MOVER_TARGET_STORAGE_KEY) ?? null,
        },
        'Mover Balance Deposit Task',
        depth + 1,
      ),
    ],
    'Balance Storage',
    depth,
  );
}
