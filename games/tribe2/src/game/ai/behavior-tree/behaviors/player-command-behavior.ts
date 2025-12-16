import { HumanEntity } from '../../../entities/characters/human/human-types';
import { canPlaceBuilding, createBuilding } from '../../../utils/building-placement-utils';
// PreyEntity and PredatorEntity types used for type checking in switch cases
import { UpdateContext, GameWorldState } from '../../../world-types';
import { Entity } from '../../../entities/entities-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { AUTOPILOT_ACTION_PROXIMITY, AUTOPILOT_MOVE_DISTANCE_THRESHOLD } from '../../../ai-consts.ts';
import { BERRY_BUSH_PLANTING_CLEARANCE_RADIUS } from '../../../entities/plants/berry-bush/berry-bush-consts.ts';
import { HUMAN_INTERACTION_PROXIMITY, HUMAN_INTERACTION_RANGE } from '../../../human-consts.ts';
import { STORAGE_INTERACTION_RANGE } from '../../../entities/buildings/storage-spot-consts.ts';
import { PlayerActionType } from '../../../ui/ui-types';
import { BerryBushEntity } from '../../../entities/plants/berry-bush/berry-bush-types';
import { canProcreate, isPositionOccupied, isEnemyBuilding } from '../../../utils';
import { BuildingEntity } from '../../../entities/buildings/building-types.ts';

/**
 * Shared autopilot attack behavior logic used by multiple action types.
 * This demonstrates that AutopilotAttack, AutopilotHuntPrey, and AutopilotDefendAgainstPredator
 * have identical behavior - they differ only in target validation.
 */
function handleAutopilotAttack(
  gameState: GameWorldState,
  human: HumanEntity,
  activeAction: { targetEntityId: number },
  targetValidator?: (target: Entity) => boolean,
): NodeStatus {
  const target = gameState.entities.entities[activeAction.targetEntityId];

  // Validate target existence, hitpoints, and optional type-specific validation
  if (!target || !('hitpoints' in target) || (target as { hitpoints: number }).hitpoints <= 0) {
    gameState.autopilotControls.activeAutopilotAction = undefined;
    return NodeStatus.FAILURE;
  }

  // Apply optional target validation (e.g., type === 'prey')
  if (targetValidator && !targetValidator(target)) {
    gameState.autopilotControls.activeAutopilotAction = undefined;
    return NodeStatus.FAILURE;
  }

  const distance = calculateWrappedDistance(
    human.position,
    target.position,
    gameState.mapDimensions.width,
    gameState.mapDimensions.height,
  );

  if (distance <= AUTOPILOT_ACTION_PROXIMITY) {
    human.activeAction = 'attacking';
    human.attackTargetId = target.id;
    gameState.autopilotControls.activeAutopilotAction = undefined;
    return NodeStatus.SUCCESS;
  }

  human.activeAction = 'moving';
  human.target = target.id;
  human.direction = dirToTarget(human.position, target.position, gameState.mapDimensions);
  return NodeStatus.RUNNING;
}

/**
 * Creates a behavior that handles all direct player commands via the autopilot system.
 * This is a high-priority behavior for the player character that interprets and executes
 * actions like moving, gathering, attacking, etc., based on player input.
 */
export function createPlayerCommandBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // 1. Condition: Is there an active autopilot command for the player?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          return human.isPlayer === true && !!context.gameState.autopilotControls.activeAutopilotAction;
        },
        'Has Player Command',
        depth + 1,
      ),

      // 2. Action: Execute the command.
      new ActionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const { gameState } = context;
          const activeAction = gameState.autopilotControls.activeAutopilotAction;

          // Should always be true due to the preceding ConditionNode, but as a safeguard:
          if (!activeAction) {
            return NodeStatus.FAILURE;
          }

          // Use a switch to handle the various player commands
          switch (activeAction.action) {
            // --- MOVE ---
            case PlayerActionType.AutopilotMove: {
              const targetPosition = activeAction.position;
              const distance = calculateWrappedDistance(
                human.position,
                targetPosition,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              if (distance < AUTOPILOT_MOVE_DISTANCE_THRESHOLD) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                if (human.activeAction === 'moving') {
                  human.activeAction = 'idle';
                  human.target = undefined;
                }
                return NodeStatus.SUCCESS;
              }

              human.activeAction = 'moving';
              human.target = targetPosition;
              human.direction = dirToTarget(human.position, targetPosition, gameState.mapDimensions);
              return NodeStatus.RUNNING;
            }

            // --- GATHER ---
            case PlayerActionType.AutopilotGather: {
              const targetBush = gameState.entities.entities[activeAction.targetEntityId] as
                | BerryBushEntity
                | undefined;

              if (!targetBush || targetBush.food.length === 0) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              const distance = calculateWrappedDistance(
                human.position,
                targetBush.position,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              if (distance > HUMAN_INTERACTION_PROXIMITY) {
                human.activeAction = 'moving';
                human.target = targetBush.id;
                human.direction = dirToTarget(human.position, targetBush.position, gameState.mapDimensions);
                return NodeStatus.RUNNING;
              }

              human.activeAction = 'gathering';
              human.target = targetBush.id;
              gameState.autopilotControls.activeAutopilotAction = undefined;
              return NodeStatus.SUCCESS;
            }

            // --- ATTACK ---
            case PlayerActionType.AutopilotAttack: {
              // Generic attack that works with any attackable entity
              return handleAutopilotAttack(gameState, human, activeAction);
            }

            // --- PROCREATE ---
            case PlayerActionType.AutopilotProcreate: {
              const target = gameState.entities.entities[activeAction.targetEntityId] as HumanEntity | undefined;

              if (!target || target.type !== 'human' || !canProcreate(human, target, context.gameState)) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              const distance = calculateWrappedDistance(
                human.position,
                target.position,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              if (distance <= AUTOPILOT_ACTION_PROXIMITY) {
                human.activeAction = 'procreating';
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.SUCCESS;
              }

              human.activeAction = 'moving';
              human.target = target.id;
              human.direction = dirToTarget(human.position, target.position, gameState.mapDimensions);
              return NodeStatus.RUNNING;
            }

            // --- PLANT ---
            case PlayerActionType.AutopilotPlant: {
              if (human.activeAction === 'planting') {
                return NodeStatus.RUNNING;
              }

              const plantTarget = activeAction.position;
              if (isPositionOccupied(plantTarget, gameState, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS, human.id)) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              const distance = calculateWrappedDistance(
                human.position,
                plantTarget,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              if (distance <= AUTOPILOT_ACTION_PROXIMITY) {
                human.activeAction = 'planting';
                human.target = plantTarget;
                gameState.autopilotControls.activeAutopilotAction = undefined;
                gameState.hasPlayerPlantedBush = true;
                return NodeStatus.RUNNING;
              }

              human.activeAction = 'moving';
              human.target = plantTarget;
              human.direction = dirToTarget(human.position, plantTarget, gameState.mapDimensions);
              return NodeStatus.RUNNING;
            }

            // --- FEED CHILD ---
            case PlayerActionType.AutopilotFeedChild: {
              const target = gameState.entities.entities[activeAction.targetEntityId] as HumanEntity | undefined;

              if (!target || target.type !== 'human' || target.isAdult || human.food.length === 0) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              const distance = calculateWrappedDistance(
                human.position,
                target.position,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              if (distance <= AUTOPILOT_ACTION_PROXIMITY) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                human.activeAction = 'feeding';
                return NodeStatus.SUCCESS;
              }

              human.activeAction = 'moving';
              human.target = target.id;
              human.direction = dirToTarget(human.position, target.position, gameState.mapDimensions);
              return NodeStatus.RUNNING;
            }

            // --- DEPOSIT ---
            case PlayerActionType.AutopilotDeposit: {
              const targetBuilding = gameState.entities.entities[activeAction.targetEntityId] as
                | BuildingEntity
                | undefined;

              // Validate building exists and is a constructed storage spot
              if (!targetBuilding || targetBuilding.buildingType !== 'storageSpot' || !targetBuilding.isConstructed) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              // Check if storage has capacity
              const capacity = targetBuilding.storageCapacity ?? 0;
              const currentStored = targetBuilding.storedFood?.length ?? 0;
              if (currentStored >= capacity) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              // Check if human belongs to the same tribe
              if (human.leaderId !== targetBuilding.ownerId) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              // Check if human has food to deposit
              if (human.food.length === 0) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              const depositDistance = calculateWrappedDistance(
                human.position,
                targetBuilding.position,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              if (depositDistance <= STORAGE_INTERACTION_RANGE) {
                human.activeAction = 'depositing';
                human.target = undefined;
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.SUCCESS;
              }

              human.activeAction = 'moving';
              human.target = targetBuilding.id;
              human.direction = dirToTarget(human.position, targetBuilding.position, gameState.mapDimensions);
              return NodeStatus.RUNNING;
            }

            // --- RETRIEVE ---
            case PlayerActionType.AutopilotRetrieve: {
              const targetBuilding = gameState.entities.entities[activeAction.targetEntityId] as
                | BuildingEntity
                | undefined;

              // Validate building exists, is a constructed storage spot, and has food
              if (
                !targetBuilding ||
                targetBuilding.buildingType !== 'storageSpot' ||
                !targetBuilding.isConstructed ||
                !targetBuilding.storedFood ||
                targetBuilding.storedFood.length === 0
              ) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              // Check if human belongs to the same tribe
              if (human.leaderId !== targetBuilding.ownerId) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              // Check if human has inventory space
              if (human.food.length >= human.maxFood) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              const retrieveDistance = calculateWrappedDistance(
                human.position,
                targetBuilding.position,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              if (retrieveDistance <= STORAGE_INTERACTION_RANGE) {
                human.activeAction = 'retrieving';
                human.target = undefined;
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.SUCCESS;
              }

              human.activeAction = 'moving';
              human.target = targetBuilding.id;
              human.direction = dirToTarget(human.position, targetBuilding.position, gameState.mapDimensions);
              return NodeStatus.RUNNING;
            }

            // --- TAKE OVER BUILDING ---
            case PlayerActionType.TakeOverBuilding: {
              const targetBuilding = gameState.entities.entities[activeAction.targetEntityId] as
                | BuildingEntity
                | undefined;

              // Validate building exists and is an enemy building
              if (
                !targetBuilding ||
                targetBuilding.type !== 'building' ||
                !isEnemyBuilding(human, targetBuilding, gameState)
              ) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              // Only leaders can take over buildings
              if (human.leaderId !== human.id) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              const takeoverDistance = calculateWrappedDistance(
                human.position,
                targetBuilding.position,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              if (takeoverDistance <= HUMAN_INTERACTION_RANGE) {
                human.activeAction = 'takingOverBuilding';
                human.target = targetBuilding.id;
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.SUCCESS;
              }

              human.activeAction = 'moving';
              human.target = targetBuilding.id;
              human.direction = dirToTarget(human.position, targetBuilding.position, gameState.mapDimensions);
              return NodeStatus.RUNNING;
            }

            // --- REMOVE ENEMY BUILDING ---
            case PlayerActionType.RemoveEnemyBuilding: {
              const targetBuilding = gameState.entities.entities[activeAction.targetEntityId] as
                | BuildingEntity
                | undefined;

              // Validate building exists and is an enemy building
              if (
                !targetBuilding ||
                targetBuilding.type !== 'building' ||
                !isEnemyBuilding(human, targetBuilding, gameState)
              ) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              // Only leaders can remove enemy buildings
              if (human.leaderId !== human.id) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              const removalDistance = calculateWrappedDistance(
                human.position,
                targetBuilding.position,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              if (removalDistance <= HUMAN_INTERACTION_RANGE) {
                human.activeAction = 'destroyingBuilding';
                human.target = targetBuilding.id;
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.SUCCESS;
              }

              human.activeAction = 'moving';
              human.target = targetBuilding.id;
              human.direction = dirToTarget(human.position, targetBuilding.position, gameState.mapDimensions);
              return NodeStatus.RUNNING;
            }

            // --- BUILDING PLACEMENT ---
            case PlayerActionType.AutopilotBuildingPlacement: {
              const targetPosition = activeAction.position;
              const buildingType = activeAction.buildingType;
              
              if (!buildingType) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              const distance = calculateWrappedDistance(
                human.position,
                targetPosition,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              const placementProximity = 100;

              if (distance <= placementProximity) {
                // Close enough to place building
                if (canPlaceBuilding(targetPosition, buildingType, human.leaderId, gameState, human.position, placementProximity)) {
                  createBuilding(targetPosition, buildingType, human.leaderId!, gameState);
                  gameState.autopilotControls.activeAutopilotAction = undefined;
                  human.activeAction = 'idle';
                  return NodeStatus.SUCCESS;
                } else {
                  // Cannot place building at this location
                  gameState.autopilotControls.activeAutopilotAction = undefined;
                  return NodeStatus.FAILURE;
                }
              }

              // Move towards placement location
              human.activeAction = 'moving';
              human.target = targetPosition;
              human.direction = dirToTarget(human.position, targetPosition, gameState.mapDimensions);
              return NodeStatus.RUNNING;
            }

            default:
              // Unknown or unhandled action, clear it.
              gameState.autopilotControls.activeAutopilotAction = undefined;
              return NodeStatus.FAILURE;
          }
        },
        'Execute Player Command',
        depth + 1,
      ),
    ],
    'Player Command Handler',
    depth,
  );
}
