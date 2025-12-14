import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence, TribalTaskDecorator } from '../nodes';
import { Selector } from '../nodes/composite-nodes';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { BlackboardData, Blackboard } from '../behavior-tree-blackboard';
import { STORAGE_INTERACTION_RANGE } from '../../../entities/buildings/storage-spot-consts';
import {
  getStorageUtilization,
  assignStorageSpot,
  countTribeMembersWithAction,
} from '../../../entities/tribe/tribe-food-utils';
import { getTribeMembers } from '../../../utils';
import {
  DEPOSIT_COOLDOWN_HOURS,
  DEPOSIT_THRESHOLD_LOW_STORAGE,
  DEPOSIT_THRESHOLD_MID_STORAGE,
  DEPOSIT_THRESHOLD_HIGH_STORAGE,
} from '../../../ai-consts';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { EntityId } from '../../../entities/entities-types';
import { BuildingEntity } from '../../../entities/buildings/building-types';
import { MAX_USERS_PER_STORAGE } from '../../../entities/tribe/tribe-task-utils';
import { isTribeRole } from '../../../entities/tribe/tribe-role-utils';
import { TribeRole } from '../../../entities/tribe/tribe-types';

const LAST_DEPOSIT_TIME_KEY = 'lastDepositTime';
const ASSIGNED_STORAGE_KEY = 'assignedStorageSpot';

/**
 * Creates a behavior for depositing excess food into tribe storage spots.
 * NPCs will deposit food based on adaptive thresholds that respond to tribe storage utilization.
 * Includes cooldown to prevent constant trips and smart storage spot assignment.
 * Uses TribalTaskDecorator for coordination to prevent storage crowding.
 */
export function createStorageDepositBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Selector<HumanEntity>(
    [
      new Sequence<HumanEntity>(
        [
          // Check if human has excess food and storage is available (with adaptive threshold)
          new ConditionNode<HumanEntity>(
            (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
              if (
                !isTribeRole(human, TribeRole.Gatherer, context.gameState) &&
                !isTribeRole(human, TribeRole.Mover, context.gameState) &&
                !isTribeRole(human, TribeRole.Hunter, context.gameState)
              ) {
                return [false, 'Not a Gatherer/Mover/Hunter'];
              }

              // Check cooldown
              const lastDepositTime = Blackboard.get<number>(blackboard, LAST_DEPOSIT_TIME_KEY) || 0;
              const timeSinceDeposit = context.gameState.time - lastDepositTime;
              if (timeSinceDeposit < DEPOSIT_COOLDOWN_HOURS) {
                return [false, `Cooldown: ${(DEPOSIT_COOLDOWN_HOURS - timeSinceDeposit).toFixed(1)}h remaining`];
              }

              // Must be an adult
              if (!human.isAdult) {
                return [false, 'Not an adult'];
              }

              // Must have a tribe
              if (!human.leaderId) {
                return [false, 'No tribe'];
              }

              // Calculate storage utilization and determine threshold
              const storageUtil = getStorageUtilization(human.leaderId, context.gameState);
              let depositThreshold: number;

              if (storageUtil < 0.3) {
                depositThreshold = DEPOSIT_THRESHOLD_LOW_STORAGE; // 0.4 - deposit more aggressively
              } else if (storageUtil < 0.7) {
                depositThreshold = DEPOSIT_THRESHOLD_MID_STORAGE; // 0.6 - balanced
              } else {
                depositThreshold = DEPOSIT_THRESHOLD_HIGH_STORAGE; // 0.8 - only deposit when very full
              }

              const personalFoodRatio = human.food.length / human.maxFood;
              if (personalFoodRatio <= depositThreshold) {
                return [
                  false,
                  `Food ${(personalFoodRatio * 100).toFixed(0)}% < threshold ${(depositThreshold * 100).toFixed(0)}%`,
                ];
              }

              // Check if storage is available
              const assignedStorage = assignStorageSpot(human, context.gameState);
              if (!assignedStorage) {
                return [false, 'No available tribe storage nearby'];
              }

              // Store the assigned storage in blackboard for the decorator and action
              Blackboard.set(blackboard, ASSIGNED_STORAGE_KEY, assignedStorage.id);

              return [
                true,
                `Storage util: ${(storageUtil * 100).toFixed(0)}%, Personal: ${(personalFoodRatio * 100).toFixed(0)}%`,
              ];
            },
            'Check for Excess Food and Storage',
            depth + 1,
          ),

          // Coordination check: Ensure not too many tribe members are depositing simultaneously (Global limit)
          new ConditionNode<HumanEntity>(
            (human, context) => {
              if (!human.leaderId) return [true, 'No tribe coordination needed'];

              const activeDepositors = countTribeMembersWithAction(human.leaderId, context.gameState, 'depositing');
              const tribeMembers = getTribeMembers(human, context.gameState);
              const maxDepositors = Math.max(1, Math.ceil(tribeMembers.length * 0.4)); // Max 40% of tribe

              return [activeDepositors < maxDepositors, `Active depositors: ${activeDepositors}/${maxDepositors}`];
            },
            'Not Too Many Depositors',
            depth + 1,
          ),

          // Navigate to storage and deposit (Decorated with TribalTask)
          new TribalTaskDecorator(
            new ActionNode<HumanEntity>(
              (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
                // Get assigned storage spot
                const storageId = Blackboard.get<EntityId>(blackboard, ASSIGNED_STORAGE_KEY);
                if (!storageId) {
                  return [NodeStatus.FAILURE, 'No storage assigned'];
                }

                const assignedStorage = context.gameState.entities.entities[storageId] as BuildingEntity | undefined;
                if (!assignedStorage) {
                  Blackboard.delete(blackboard, ASSIGNED_STORAGE_KEY);
                  return [NodeStatus.FAILURE, 'Storage entity missing'];
                }

                if ((assignedStorage.storedFood?.length ?? 0) >= (assignedStorage.storageCapacity ?? 0)) {
                  Blackboard.delete(blackboard, ASSIGNED_STORAGE_KEY);
                  return [NodeStatus.FAILURE, 'Storage full'];
                }

                const distance = calculateWrappedDistance(
                  human.position,
                  assignedStorage.position,
                  context.gameState.mapDimensions.width,
                  context.gameState.mapDimensions.height,
                );

                // Check if within interaction range
                if (distance <= STORAGE_INTERACTION_RANGE) {
                  // Within range - set depositing action
                  human.activeAction = 'depositing';
                  human.target = undefined;

                  // Set last deposit time and clear assigned storage
                  Blackboard.set(blackboard, LAST_DEPOSIT_TIME_KEY, context.gameState.time);
                  Blackboard.delete(blackboard, ASSIGNED_STORAGE_KEY);

                  return [NodeStatus.SUCCESS, 'Depositing food'];
                }

                // Navigate toward storage
                human.activeAction = 'moving';
                human.target = assignedStorage.position;
                return [NodeStatus.RUNNING, `Moving to storage (${distance.toFixed(1)}px away)`];
              },
              'Navigate to Storage and Deposit',
              depth + 2,
            ),
            {
              taskType: 'storage',
              maxCapacity: MAX_USERS_PER_STORAGE,
              storageAction: 'deposit',
              getTargetId: (_entity, _context, blackboard) =>
                Blackboard.get<EntityId>(blackboard, ASSIGNED_STORAGE_KEY) ?? null,
            },
            'Tribal Storage Deposit Task',
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
