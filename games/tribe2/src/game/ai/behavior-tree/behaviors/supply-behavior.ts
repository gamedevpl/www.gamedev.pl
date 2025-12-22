import { HumanEntity } from '../../../entities/characters/human/human-types';
import { areTribeRolesEffective, isTribeRole } from '../../../entities/tribe/tribe-role-utils';
import { TribeRole } from '../../../entities/tribe/tribe-types';
import { getTribeLeaderForCoordination } from '../../../entities/tribe/tribe-task-utils';
import { getUnclaimedDemands, claimDemand, getDemandById } from '../../supply-chain/tribe-logistics-utils';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { HUMAN_INTERACTION_RANGE } from '../../../human-consts';
import { STORAGE_INTERACTION_RANGE } from '../../../entities/buildings/storage-spot-consts';
import { findClosestStorage, findNearbyTribeStorage } from '../../../utils/storage-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode } from '../nodes';
import { Blackboard } from '../behavior-tree-blackboard';
import { EntityId } from '../../../entities/entities-types';
import { ItemType } from '../../../entities/item-types';
import { BuildingEntity, BuildingType } from '../../../entities/buildings/building-types';

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
const BB_KEY_TARGET_RESOURCE_TYPE = 'supply_targetResourceType';

/**
 * Cleans up all supply-related blackboard keys
 */
function cleanupSupplyState(human: HumanEntity): void {
  if (!human.aiBlackboard) return;

  Blackboard.delete(human.aiBlackboard, BB_KEY_SUPPLY_PHASE);
  Blackboard.delete(human.aiBlackboard, BB_KEY_TARGET_DEMANDER_ID);
  Blackboard.delete(human.aiBlackboard, BB_KEY_TARGET_STORAGE_ID);
  Blackboard.delete(human.aiBlackboard, BB_KEY_TARGET_RESOURCE_TYPE);
}

export function createSupplyBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new ActionNode(
    (human: HumanEntity, context) => {
      if (!areTribeRolesEffective(human, context.gameState)) {
        cleanupSupplyState(human);
        return [NodeStatus.FAILURE, 'Tribe roles not effective'];
      }

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
        const unclaimedDemands = getUnclaimedDemands(leader.aiBlackboard).filter(
          (demand) => demand.requesterId !== human.id,
        );
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
        Blackboard.set(human.aiBlackboard, BB_KEY_TARGET_RESOURCE_TYPE, demand.resourceType);
        Blackboard.set(human.aiBlackboard, BB_KEY_SUPPLY_PHASE, PHASE_RETRIEVING_FROM_STORAGE);

        return [
          NodeStatus.RUNNING,
          `Claimed ${demand.resourceType} demand for ${demand.requesterId}, moving to retrieval phase`,
        ];
      }

      // ===== PHASE 2: RETRIEVING_FROM_STORAGE =====
      if (currentPhase === PHASE_RETRIEVING_FROM_STORAGE) {
        const resourceType = Blackboard.get<string>(human.aiBlackboard, BB_KEY_TARGET_RESOURCE_TYPE);

        // Check if we already have the resource (retrieval completed)
        const hasFood = resourceType === 'food' && human.food.length > 0;
        const hasWood = resourceType === 'wood' && human.heldItem?.type === ItemType.Wood;

        if (hasFood || hasWood) {
          Blackboard.set(human.aiBlackboard, BB_KEY_SUPPLY_PHASE, PHASE_DELIVERING_TO_DEMANDER);
          return [NodeStatus.RUNNING, `${resourceType} retrieved, moving to delivery phase`];
        }

        // Find storage with the required resource
        const storages = findNearbyTribeStorage(
          human,
          context.gameState,
          400, // search radius
        ).filter((s) => {
          if (resourceType === 'food') {
            return s.storedItems.some((si) => si.item.itemType === 'food');
          } else if (resourceType === 'wood') {
            return s.storedItems.some((si) => si.item.type === ItemType.Wood);
          }
          return false;
        });

        if (storages.length === 0) {
          return [NodeStatus.FAILURE, `No storage with ${resourceType} found nearby`];
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
        const resourceType = Blackboard.get<string>(human.aiBlackboard, BB_KEY_TARGET_RESOURCE_TYPE) || 'food';

        // Get demander ID from blackboard
        const demanderId = Blackboard.get<EntityId>(human.aiBlackboard, BB_KEY_TARGET_DEMANDER_ID);
        if (!demanderId) {
          cleanupSupplyState(human);
          return [NodeStatus.FAILURE, 'Demander ID not found in blackboard'];
        }

        const demand = getDemandById(leader.aiBlackboard, demanderId, resourceType as any);

        if (!demand || demand.claimedBy !== human.id) {
          cleanupSupplyState(human);
          return [NodeStatus.FAILURE, 'Demand not found'];
        }

        // Get demander entity (Human or Building)
        const demander = context.gameState.entities.entities[demanderId];
        if (!demander) {
          cleanupSupplyState(human);
          return [NodeStatus.FAILURE, 'Demander not found'];
        }

        // Check if resource was transferred (delivery completed)
        const isDeliveryComplete = resourceType === 'food' ? human.food.length === 0 : !human.heldItem;

        if (isDeliveryComplete) {
          cleanupSupplyState(human);
          return [NodeStatus.SUCCESS, `Successfully delivered ${resourceType} to ${demanderId}`];
        }

        // Calculate distance to demander
        const distance = calculateWrappedDistance(
          human.position,
          demander.position,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );

        const interactionRange =
          demander.type === 'building' && (demander as BuildingEntity).buildingType === BuildingType.Bonfire
            ? STORAGE_INTERACTION_RANGE
            : HUMAN_INTERACTION_RANGE;

        // If close enough, start depositing
        if (distance <= interactionRange) {
          human.activeAction = 'depositing';
          if (resourceType === 'food') {
            human.activeActionPayload = {
              amount: Math.min((demander as any).maxFood / 2 || 1, human.food.length || 1),
            };
          }
          human.target = demander.id;
          return [NodeStatus.RUNNING, `Delivering to demander ${demander.id}`];
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
