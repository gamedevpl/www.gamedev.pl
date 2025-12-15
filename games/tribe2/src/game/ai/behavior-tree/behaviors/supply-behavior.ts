import { HumanEntity } from '../../../entities/characters/human/human-types';
import { isTribeRole } from '../../../entities/tribe/tribe-role-utils';
import { TribeRole } from '../../../entities/tribe/tribe-types';
import { getTribeLeaderForCoordination } from '../../../entities/tribe/tribe-task-utils';
import { getUnclaimedDemands, claimDemand } from '../../supply-chain/tribe-logistics-utils';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { HUMAN_INTERACTION_RANGE } from '../../../human-consts';
import { STORAGE_INTERACTION_RANGE } from '../../../entities/buildings/storage-spot-consts';
import { findClosestStorage, findNearbyTribeStorage } from '../../../utils/storage-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode } from '../nodes';
import { Blackboard } from '../behavior-tree-blackboard';
import { EntityId } from '../../../entities/entities-types';

// Supply chain phase constants
const PHASE_FINDING_DEMAND = 'FINDING_DEMAND';
const PHASE_RETRIEVING_FROM_STORAGE = 'RETRIEVING_FROM_STORAGE';
const PHASE_DELIVERING_TO_DEMANDER = 'DELIVERING_TO_DEMANDER';

type SupplyPhase =
  | typeof PHASE_FINDING_DEMAND
  | typeof PHASE_RETRIEVING_FROM_STORAGE
  | typeof PHASE_DELIVERING_TO_DEMANDER;

// Blackboard keys
const BB_KEY_SUPPLY_PHASE = 'supply_phase';
const BB_KEY_TARGET_DEMANDER_ID = 'supply_targetDemanderId';
const BB_KEY_TARGET_STORAGE_ID = 'supply_targetStorageId';

/**
 * Cleans up all supply-related blackboard keys
 */
function cleanupSupplyState(human: HumanEntity): void {
  if (!human.aiBlackboard) return;

  Blackboard.delete(human.aiBlackboard, BB_KEY_SUPPLY_PHASE);
  Blackboard.delete(human.aiBlackboard, BB_KEY_TARGET_DEMANDER_ID);
  Blackboard.delete(human.aiBlackboard, BB_KEY_TARGET_STORAGE_ID);
}

export function createSupplyBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new ActionNode(
    (human: HumanEntity, context) => {
      // Check if human has Mover role
      if (!isTribeRole(human, TribeRole.Mover, context.gameState)) {
        cleanupSupplyState(human);
        return [NodeStatus.FAILURE, 'Not a Mover'];
      }

      // Get tribe leader for coordination
      const leader = getTribeLeaderForCoordination(human, context.gameState);
      if (!leader || !leader.aiBlackboard) {
        cleanupSupplyState(human);
        return [NodeStatus.FAILURE, 'No leader or blackboard'];
      }

      if (!human.aiBlackboard) {
        return [NodeStatus.FAILURE, 'No AI blackboard'];
      }

      // Get current phase from blackboard
      const currentPhase = Blackboard.get<SupplyPhase>(human.aiBlackboard, BB_KEY_SUPPLY_PHASE) || PHASE_FINDING_DEMAND;

      // ===== PHASE 1: FINDING_DEMAND =====
      if (currentPhase === PHASE_FINDING_DEMAND) {
        // Get unclaimed demands (FIFO - oldest first)
        const unclaimedDemands = getUnclaimedDemands(leader.aiBlackboard);
        if (unclaimedDemands.length === 0) {
          return [NodeStatus.FAILURE, 'No unclaimed demands'];
        }

        // Get the first (oldest) demand
        const demand = unclaimedDemands[0];

        // Claim the demand
        const claimed = claimDemand(
          leader.aiBlackboard,
          demand.requesterId,
          demand.resourceType,
          human.id,
          context.gameState.time,
        );

        if (!claimed) {
          cleanupSupplyState(human);
          return [NodeStatus.FAILURE, 'Failed to claim demand'];
        }

        // Store demander ID and transition to next phase
        Blackboard.set(human.aiBlackboard, BB_KEY_TARGET_DEMANDER_ID, demand.requesterId);
        Blackboard.set(human.aiBlackboard, BB_KEY_SUPPLY_PHASE, PHASE_RETRIEVING_FROM_STORAGE);

        return [NodeStatus.RUNNING, `Claimed demand for ${demand.requesterId}, moving to retrieval phase`];
      }

      // ===== PHASE 2: RETRIEVING_FROM_STORAGE =====
      if (currentPhase === PHASE_RETRIEVING_FROM_STORAGE) {
        // Check if we already have food (retrieval completed)
        if (human.food.length > 0) {
          Blackboard.set(human.aiBlackboard, BB_KEY_SUPPLY_PHASE, PHASE_DELIVERING_TO_DEMANDER);
          return [NodeStatus.RUNNING, 'Food retrieved, moving to delivery phase'];
        }

        // Find storage with food
        const storages = findNearbyTribeStorage(
          human,
          context.gameState,
          400, // search radius
        );

        if (storages.length === 0) {
          // TODO: import part of gathering behavior here and use it to gather food if no storage with food is found nearby
          return [NodeStatus.FAILURE, 'No storage found nearby'];
        }

        // Find closest storage
        const closestResult = findClosestStorage(human, storages, context.gameState);
        if (!closestResult) {
          cleanupSupplyState(human);
          return [NodeStatus.FAILURE, 'Could not find closest storage'];
        }

        const { storage, distance } = closestResult;

        // Store storage ID
        Blackboard.set(human.aiBlackboard, BB_KEY_TARGET_STORAGE_ID, storage.id);

        // If close enough, start retrieving
        if (distance <= STORAGE_INTERACTION_RANGE) {
          human.activeAction = 'retrieving';
          human.target = storage.id;
          return [NodeStatus.RUNNING, `Retrieving from storage ${storage.id}`];
        }

        // Otherwise, move toward storage
        human.target = storage.id;
        human.activeAction = 'moving';
        return [NodeStatus.RUNNING, `Moving to storage ${storage.id}, distance: ${distance.toFixed(1)}`];
      }

      // ===== PHASE 3: DELIVERING_TO_DEMANDER =====
      if (currentPhase === PHASE_DELIVERING_TO_DEMANDER) {
        // Get demander ID from blackboard
        const demanderId = Blackboard.get<EntityId>(human.aiBlackboard, BB_KEY_TARGET_DEMANDER_ID);
        if (!demanderId) {
          cleanupSupplyState(human);
          return [NodeStatus.FAILURE, 'Demander ID not found in blackboard'];
        }

        // Get demander entity
        const demander = context.gameState.entities.entities[demanderId] as HumanEntity | undefined;
        if (!demander || demander.type !== 'human') {
          cleanupSupplyState(human);
          return [NodeStatus.FAILURE, 'Demander not found or invalid'];
        }

        // Check if food was transferred (delivery completed)
        if (human.food.length === 0) {
          cleanupSupplyState(human);
          return [NodeStatus.SUCCESS, `Successfully delivered food to ${demanderId}`];
        }

        // Calculate distance to demander
        const distance = calculateWrappedDistance(
          human.position,
          demander.position,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );

        // If close enough, start depositing
        if (distance <= HUMAN_INTERACTION_RANGE) {
          human.activeAction = 'depositing';
          human.target = demander.id;
          human.activeActionPayload = { amount: Math.min(demander.maxFood / 2, human.food.length) };
          return [NodeStatus.RUNNING, `Depositing to demander ${demander.id}`];
        }

        // Otherwise, move toward demander
        human.target = demander.id;
        human.activeAction = 'moving';
        return [NodeStatus.RUNNING, `Moving to demander ${demander.id}, distance: ${distance.toFixed(1)}`];
      }

      // Unknown phase - clean up and fail
      cleanupSupplyState(human);
      return [NodeStatus.FAILURE, 'Unknown supply phase'];
    },
    'Supply',
    depth,
  );
}
