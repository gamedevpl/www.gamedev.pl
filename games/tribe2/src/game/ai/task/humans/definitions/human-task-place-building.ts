import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../../world-types';
import { Task, TaskResult, TaskType } from '../../task-types';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { createBuilding } from '../../../../utils/building-placement-utils';
import { BuildingType } from '../../../../entities/buildings/building-consts';
import { LEADER_BUILDING_PLACEMENT_PROXIMITY, BORDER_POST_PLACEMENT_PROXIMITY } from '../../../../ai-consts';
import { Vector2D } from '../../../../utils/math-types';
import { defineHumanTask, getDistanceScore } from '../../task-utils';

/**
 * Common scorer for building placement tasks.
 * Prioritizes tasks created by the human's own tribe and scores based on proximity.
 */
function createPlacementScorer(human: HumanEntity, task: Task, context: UpdateContext): number | null {
  if (human.leaderId !== task.creatorEntityId) {
    return null;
  }

  if (!task.target || typeof task.target !== 'object' || !('x' in task.target)) {
    return null;
  }

  const distance = calculateWrappedDistance(
    human.position,
    task.target as Vector2D,
    context.gameState.mapDimensions.width,
    context.gameState.mapDimensions.height,
  );

  // Score increases as distance decreases (0 to 1 range)
  return getDistanceScore(distance);
}

/**
 * Common executor logic for building placement tasks.
 * Handles movement to the target and calls createBuilding upon arrival.
 */
function createPlacementExecutor(
  task: Task,
  human: HumanEntity,
  context: UpdateContext,
  buildingType: BuildingType,
  proximity: number,
): TaskResult {
  const target = task.target as Vector2D;

  const distance = calculateWrappedDistance(
    human.position,
    target,
    context.gameState.mapDimensions.width,
    context.gameState.mapDimensions.height,
  );

  if (distance > proximity) {
    human.target = target;
    human.activeAction = 'moving';
    return TaskResult.Running;
  }

  // At the target, place building
  createBuilding(target, buildingType, human.leaderId!, context.gameState);
  return TaskResult.Success;
}

export const humanPlaceStorageDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanPlaceStorage,
  requireAdult: true,
  autopilotBehavior: 'build',
  scorer: createPlacementScorer,
  executor: (task, human, context) =>
    createPlacementExecutor(task, human, context, BuildingType.StorageSpot, LEADER_BUILDING_PLACEMENT_PROXIMITY),
});

export const humanPlaceBonfireDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanPlaceBonfire,
  requireAdult: true,
  autopilotBehavior: 'build',
  scorer: createPlacementScorer,
  executor: (task, human, context) =>
    createPlacementExecutor(task, human, context, BuildingType.Bonfire, LEADER_BUILDING_PLACEMENT_PROXIMITY),
});

export const humanPlacePlantingZoneDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanPlacePlantingZone,
  requireAdult: true,
  autopilotBehavior: 'build',
  scorer: createPlacementScorer,
  executor: (task, human, context) =>
    createPlacementExecutor(task, human, context, BuildingType.PlantingZone, LEADER_BUILDING_PLACEMENT_PROXIMITY),
});

export const humanPlaceBorderPostDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanPlaceBorderPost,
  requireAdult: true,
  autopilotBehavior: 'build',
  scorer: createPlacementScorer,
  executor: (task, human, context) =>
    createPlacementExecutor(task, human, context, BuildingType.BorderPost, BORDER_POST_PLACEMENT_PROXIMITY),
});
