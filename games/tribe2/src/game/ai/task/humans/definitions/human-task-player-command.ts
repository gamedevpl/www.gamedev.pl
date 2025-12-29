import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { canPlaceBuilding, createBuilding } from '../../../../utils/building-placement-utils';
import { GameWorldState } from '../../../../world-types';
import { Entity } from '../../../../entities/entities-types';
import { calculateWrappedDistance, dirToTarget } from '../../../../utils/math-utils';
import { AUTOPILOT_ACTION_PROXIMITY, AUTOPILOT_MOVE_DISTANCE_THRESHOLD } from '../../../../ai-consts';
import { BERRY_BUSH_PLANTING_CLEARANCE_RADIUS } from '../../../../entities/plants/berry-bush/berry-bush-consts';
import {
  HUMAN_INTERACTION_PROXIMITY,
  HUMAN_INTERACTION_RANGE,
  HUMAN_ATTACK_MELEE_RANGE,
  HUMAN_ATTACK_RANGED_RANGE,
  HUMAN_CHOPPING_PROXIMITY,
} from '../../../../human-consts';
import { STORAGE_INTERACTION_RANGE } from '../../../../entities/buildings/storage-spot-consts';
import { PlayerActionType } from '../../../../ui/ui-types';
import { BerryBushEntity } from '../../../../entities/plants/berry-bush/berry-bush-types';
import { TreeEntity } from '../../../../entities/plants/tree/tree-types';
import {
  TREE_GROWING,
  TREE_FULL,
  TREE_SPREADING,
  TREE_FALLEN,
} from '../../../../entities/plants/tree/states/tree-state-types';
import { canProcreate, isPositionOccupied, isEnemyBuilding } from '../../../../utils';
import { BuildingEntity, BuildingType } from '../../../../entities/buildings/building-types';
import { ItemType } from '../../../../entities/item-types';
import { Task, TaskResult, TaskType } from '../../task-types';
import { defineHumanTask } from '../../task-utils';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { CorpseEntity } from '../../../../entities/characters/corpse-types';

/**
 * Shared autopilot attack task logic.
 */
function handleAutopilotAttackTask(
  gameState: GameWorldState,
  human: HumanEntity,
  activeAction: { targetEntityId: number },
  targetValidator?: (target: Entity) => boolean,
): TaskResult {
  const target = gameState.entities.entities[activeAction.targetEntityId];

  // Validate target existence, hitpoints, and optional type-specific validation
  if (!target || !('hitpoints' in target) || (target as { hitpoints: number }).hitpoints <= 0) {
    gameState.autopilotControls.activeAutopilotAction = undefined;
    return TaskResult.Failure;
  }

  // Apply optional target validation (e.g., type === 'prey')
  if (targetValidator && !targetValidator(target)) {
    gameState.autopilotControls.activeAutopilotAction = undefined;
    return TaskResult.Failure;
  }

  const distance = calculateWrappedDistance(
    human.position,
    target.position,
    gameState.mapDimensions.width,
    gameState.mapDimensions.height,
  );

  const rangedReady = (human.attackCooldown?.ranged ?? 0) <= 0;
  const effectiveRange = rangedReady ? HUMAN_ATTACK_RANGED_RANGE : HUMAN_ATTACK_MELEE_RANGE;

  if (distance <= effectiveRange) {
    human.activeAction = 'attacking';
    human.attackTargetId = target.id;
    gameState.autopilotControls.activeAutopilotAction = undefined;
    return TaskResult.Success;
  }

  human.activeAction = 'moving';
  human.target = target.id;
  human.direction = dirToTarget(human.position, target.position, gameState.mapDimensions);
  return TaskResult.Running;
}

/**
 * Task definition for human player commands (autopilot).
 */
export const humanPlayerCommandDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanPlayerCommand,
  producer: (human, context) => {
    const tasks: Record<string, Task> = {};

    if (human.isPlayer && context.gameState.autopilotControls.activeAutopilotAction) {
      const taskId = `player-command-${human.id}`;
      tasks[taskId] = {
        id: taskId,
        type: TaskType.HumanPlayerCommand,
        creatorEntityId: human.id,
        validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
      };
    }

    return tasks;
  },
  scorer: (human, task) => {
    // Player commands always have the highest priority
    if (task.type === TaskType.HumanPlayerCommand && human.isPlayer) {
      return 1000;
    }
    return null;
  },
  executor: (_task, human, context) => {
    const { gameState } = context;
    const activeAction = gameState.autopilotControls.activeAutopilotAction;

    // Should always be true due to the preceding scorer/producer, but as a safeguard:
    if (!activeAction) {
      return TaskResult.Failure;
    }

    // Use a switch to handle the various player commands
    switch (activeAction.action) {
      // --- MOVE ---
      case PlayerActionType.AutopilotMove: {
        if (!('position' in activeAction)) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }
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
          return TaskResult.Success;
        }

        human.activeAction = 'moving';
        human.target = targetPosition;
        human.direction = dirToTarget(human.position, targetPosition, gameState.mapDimensions);
        return TaskResult.Running;
      }

      // --- GATHER ---
      case PlayerActionType.AutopilotGather: {
        if (!('targetEntityId' in activeAction)) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }
        const target = gameState.entities.entities[activeAction.targetEntityId];

        if (!target) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }

        let isDepleted = false;
        if (target.type === 'berryBush') {
          isDepleted = (target as BerryBushEntity).food.length === 0;
        } else if (target.type === 'corpse') {
          isDepleted = (target as CorpseEntity).food.length === 0;
        } else if (target.type === 'tree') {
          const tree = target as TreeEntity;
          isDepleted = tree.stateMachine?.[0] !== TREE_FALLEN || tree.wood.length === 0;
        } else {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }

        if (isDepleted) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }

        const distance = calculateWrappedDistance(
          human.position,
          target.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );

        if (distance > HUMAN_INTERACTION_PROXIMITY) {
          human.activeAction = 'moving';
          human.target = target.id;
          human.direction = dirToTarget(human.position, target.position, gameState.mapDimensions);
          return TaskResult.Running;
        }

        human.activeAction = 'gathering';
        human.target = target.id;
        gameState.autopilotControls.activeAutopilotAction = undefined;
        return TaskResult.Success;
      }

      // --- CHOP ---
      case PlayerActionType.AutopilotChop: {
        if (!('targetEntityId' in activeAction)) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }
        const tree = gameState.entities.entities[activeAction.targetEntityId] as TreeEntity | undefined;

        if (!tree || tree.type !== 'tree') {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }

        const [treeState] = tree.stateMachine ?? [];
        const isStanding = treeState === TREE_GROWING || treeState === TREE_FULL || treeState === TREE_SPREADING;

        if (!isStanding || human.heldItem) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }

        const distance = calculateWrappedDistance(
          human.position,
          tree.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );

        if (distance > HUMAN_CHOPPING_PROXIMITY) {
          human.activeAction = 'moving';
          human.target = tree.id;
          human.direction = dirToTarget(human.position, tree.position, gameState.mapDimensions);
          return TaskResult.Running;
        }

        human.activeAction = 'chopping';
        human.target = tree.id;
        gameState.autopilotControls.activeAutopilotAction = undefined;
        return TaskResult.Success;
      }

      // --- ATTACK ---
      case PlayerActionType.AutopilotAttack: {
        if (!('targetEntityId' in activeAction)) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }
        // Generic attack that works with any attackable entity
        return handleAutopilotAttackTask(gameState, human, activeAction);
      }

      // --- PROCREATE ---
      case PlayerActionType.AutopilotProcreate: {
        if (!('targetEntityId' in activeAction)) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }
        const target = gameState.entities.entities[activeAction.targetEntityId] as HumanEntity | undefined;

        if (!target || target.type !== 'human' || !canProcreate(human, target, gameState)) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
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
          return TaskResult.Success;
        }

        human.activeAction = 'moving';
        human.target = target.id;
        human.direction = dirToTarget(human.position, target.position, gameState.mapDimensions);
        return TaskResult.Running;
      }

      // --- PLANT ---
      case PlayerActionType.AutopilotPlant: {
        if (human.activeAction === 'planting') {
          return TaskResult.Running;
        }

        if (!('position' in activeAction)) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }
        const plantTarget = activeAction.position;
        if (isPositionOccupied(plantTarget, gameState, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS, human.id)) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
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
          return TaskResult.Running;
        }

        human.activeAction = 'moving';
        human.target = plantTarget;
        human.direction = dirToTarget(human.position, plantTarget, gameState.mapDimensions);
        return TaskResult.Running;
      }

      // --- FEED CHILD ---
      case PlayerActionType.AutopilotFeedChild: {
        if (!('targetEntityId' in activeAction)) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }
        const target = gameState.entities.entities[activeAction.targetEntityId] as HumanEntity | undefined;

        if (!target || target.type !== 'human' || target.isAdult || human.food.length === 0) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
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
          return TaskResult.Success;
        }

        human.activeAction = 'moving';
        human.target = target.id;
        human.direction = dirToTarget(human.position, target.position, gameState.mapDimensions);
        return TaskResult.Running;
      }

      // --- DEPOSIT ---
      case PlayerActionType.AutopilotDeposit: {
        if (!('targetEntityId' in activeAction)) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }
        const targetBuilding = gameState.entities.entities[activeAction.targetEntityId] as BuildingEntity | undefined;

        // Validate building exists and is a constructed storage spot or bonfire
        if (
          !targetBuilding ||
          (targetBuilding.buildingType !== BuildingType.StorageSpot &&
            targetBuilding.buildingType !== BuildingType.Bonfire) ||
          !targetBuilding.isConstructed
        ) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }

        // Check if storage has capacity
        const capacity = targetBuilding.storageCapacity ?? 0;
        const currentStored = targetBuilding.storedItems.length;
        if (currentStored >= capacity) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }

        // Check if human belongs to the same tribe
        if (human.leaderId !== targetBuilding.ownerId) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }

        // Check if human has something to deposit
        const hasFood = human.food.length > 0;
        const hasHeldItem = !!human.heldItem;

        if (targetBuilding.buildingType === BuildingType.Bonfire) {
          // Bonfires only accept wood
          if (human.heldItem?.type !== ItemType.Wood) {
            gameState.autopilotControls.activeAutopilotAction = undefined;
            return TaskResult.Failure;
          }
        } else {
          // Storage spots accept food or held items
          if (!hasFood && !hasHeldItem) {
            gameState.autopilotControls.activeAutopilotAction = undefined;
            return TaskResult.Failure;
          }
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
          return TaskResult.Success;
        }

        human.activeAction = 'moving';
        human.target = targetBuilding.id;
        human.direction = dirToTarget(human.position, targetBuilding.position, gameState.mapDimensions);
        return TaskResult.Running;
      }

      // --- RETRIEVE ---
      case PlayerActionType.AutopilotRetrieve: {
        if (!('targetEntityId' in activeAction)) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }
        const targetBuilding = gameState.entities.entities[activeAction.targetEntityId] as BuildingEntity | undefined;

        // Validate building exists, is a constructed storage spot, and has food
        if (
          !targetBuilding ||
          targetBuilding.buildingType !== BuildingType.StorageSpot ||
          !targetBuilding.isConstructed ||
          targetBuilding.storedItems.length === 0
        ) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }

        // Check if human belongs to the same tribe
        if (human.leaderId !== targetBuilding.ownerId) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }

        // Check if human has inventory space
        if (human.food.length >= human.maxFood) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
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
          return TaskResult.Success;
        }

        human.activeAction = 'moving';
        human.target = targetBuilding.id;
        human.direction = dirToTarget(human.position, targetBuilding.position, gameState.mapDimensions);
        return TaskResult.Running;
      }

      // --- TAKE OVER BUILDING ---
      case PlayerActionType.TakeOverBuilding: {
        if (!('targetEntityId' in activeAction)) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }
        const targetBuilding = gameState.entities.entities[activeAction.targetEntityId] as BuildingEntity | undefined;

        // Validate building exists and is an enemy building
        if (
          !targetBuilding ||
          targetBuilding.type !== 'building' ||
          !isEnemyBuilding(human, targetBuilding, gameState)
        ) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }

        // Only leaders can take over buildings
        if (human.leaderId !== human.id) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
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
          return TaskResult.Success;
        }

        human.activeAction = 'moving';
        human.target = targetBuilding.id;
        human.direction = dirToTarget(human.position, targetBuilding.position, gameState.mapDimensions);
        return TaskResult.Running;
      }

      // --- REMOVE ENEMY BUILDING ---
      case PlayerActionType.RemoveEnemyBuilding: {
        if (!('targetEntityId' in activeAction)) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }
        const targetBuilding = gameState.entities.entities[activeAction.targetEntityId] as BuildingEntity | undefined;

        // Validate building exists and is an enemy building
        if (
          !targetBuilding ||
          targetBuilding.type !== 'building' ||
          !isEnemyBuilding(human, targetBuilding, gameState)
        ) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }

        // Only leaders can remove enemy buildings
        if (human.leaderId !== human.id) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
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
          return TaskResult.Success;
        }

        human.activeAction = 'moving';
        human.target = targetBuilding.id;
        human.direction = dirToTarget(human.position, targetBuilding.position, gameState.mapDimensions);
        return TaskResult.Running;
      }

      // --- BUILDING PLACEMENT ---
      case PlayerActionType.AutopilotBuildingPlacement: {
        if (!('position' in activeAction) || !('buildingType' in activeAction)) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
        }
        const targetPosition = activeAction.position;
        const buildingType = activeAction.buildingType;

        if (!buildingType) {
          gameState.autopilotControls.activeAutopilotAction = undefined;
          return TaskResult.Failure;
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
          if (
            canPlaceBuilding(
              targetPosition,
              buildingType,
              human.leaderId,
              gameState,
              human.position,
              placementProximity,
            )
          ) {
            createBuilding(targetPosition, buildingType, human.leaderId!, gameState);
            gameState.autopilotControls.activeAutopilotAction = undefined;
            human.activeAction = 'idle';
            return TaskResult.Success;
          } else {
            // Cannot place building at this location
            gameState.autopilotControls.activeAutopilotAction = undefined;
            return TaskResult.Failure;
          }
        }

        // Move towards placement location
        human.activeAction = 'moving';
        human.target = targetPosition;
        human.direction = dirToTarget(human.position, targetPosition, gameState.mapDimensions);
        return TaskResult.Running;
      }

      default:
        // Unknown or unhandled action, clear it.
        gameState.autopilotControls.activeAutopilotAction = undefined;
        return TaskResult.Failure;
    }
  },
});
