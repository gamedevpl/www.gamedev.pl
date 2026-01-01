import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../../world-types';
import { Task, TaskResult, TaskType } from '../../task-types';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { createBuilding } from '../../../../utils/building-placement-utils';
import { BuildingType } from '../../../../entities/buildings/building-consts';
import { LEADER_BUILDING_PLACEMENT_PROXIMITY, BORDER_POST_PLACEMENT_PROXIMITY } from '../../../../ai-consts';
import { Vector2D } from '../../../../utils/math-types';
import { getDistanceScore } from '../../task-utils';
import { defineHumanTask } from '../human-task-utils';
import { getTribeCenter } from '../../../../utils/spatial-utils';
import { convertPositionToTerritoryGrid } from '../../../../entities/tribe/territory-utils';
import { TERRITORY_OWNERSHIP_RESOLUTION } from '../../../../entities/tribe/territory-consts';

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
 * Specialized scorer for border post placement.
 * Producer handles "architectural" quality (roundness/convexity), 
 * so worker focuses more on efficiency (proximity).
 */
function borderPostScorer(human: HumanEntity, task: Task, context: UpdateContext): number | null {
  if (human.leaderId !== task.creatorEntityId || !human.leaderId) {
    return null;
  }

  const target = task.target as Vector2D;
  if (!target) return null;

  const { width, height } = context.gameState.mapDimensions;

  // 1. Worker Proximity (50%) - Focus on efficiency
  const distanceToWorker = calculateWrappedDistance(human.position, target, width, height);
  const distanceScore = getDistanceScore(distanceToWorker) * 0.5;

  // 2. Roundness (25%) - Prioritize filling dents closer to center
  const tribeCenter = getTribeCenter(human.leaderId, context.gameState);
  const distanceToCenter = calculateWrappedDistance(tribeCenter, target, width, height);
  // Normalize by 800px - points closer to center score higher
  const roundnessScore = Math.max(0, 1 - distanceToCenter / 800) * 0.25;

  // 3. Convexity (25%) - Count friendly neighbors in territory grid
  const gridWidth = Math.ceil(width / TERRITORY_OWNERSHIP_RESOLUTION);
  const gridHeight = Math.ceil(height / TERRITORY_OWNERSHIP_RESOLUTION);
  const gridPos = convertPositionToTerritoryGrid(target);

  let friendlyNeighbors = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const gx = (((gridPos.x + dx) % gridWidth) + gridWidth) % gridWidth;
      const gy = (((gridPos.y + dy) % gridHeight) + gridHeight) % gridHeight;
      if (context.gameState.terrainOwnership[gy * gridWidth + gx] === human.leaderId) {
        friendlyNeighbors++;
      }
    }
  }
  const convexityScore = (friendlyNeighbors / 8) * 0.25;

  return distanceScore + roundnessScore + convexityScore;
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
  scorer: borderPostScorer,
  requireAdult: true,
  autopilotBehavior: 'build',
  executor: (task, human, context) =>
    createPlacementExecutor(task, human, context, BuildingType.BorderPost, BORDER_POST_PLACEMENT_PROXIMITY),
});
