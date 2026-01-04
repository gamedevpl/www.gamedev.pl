import { PredatorEntity } from '../../../../entities/characters/predator/predator-types';
import { Task, TaskResult, TaskType, TaskDefinition } from '../../task-types';
import { UpdateContext } from '../../../../world-types';
import { getDistanceScore } from '../../task-utils';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../../utils/math-utils';
import { IndexedWorldState } from '../../../../world-index/world-index-types';
import { PREDATOR_ATTACK_RANGE, PREDATOR_TERRITORIAL_RANGE } from '../../../../animal-consts';
import { EntityId } from '../../../../entities/entities-types';

/**
 * Producer for the AnimalTerritorial task.
 * Identifies rival predators from different packs to engage in territorial disputes.
 */
export const animalTerritorialProducer = (
  entity: PredatorEntity,
  context: UpdateContext,
): Record<string, Task> => {
  if (entity.type !== 'predator') return {};

  // Only adult predators with sufficient health engage in territorial fights
  if (
    !entity.isAdult ||
    entity.hitpoints < entity.maxHitpoints * 0.6 ||
    entity.hunger > 120 || // Too hungry to fight
    (entity.attackCooldown && entity.attackCooldown > 0)
  ) {
    return {};
  }

  const tasks: Record<string, Task> = {};
  const indexedState = context.gameState as IndexedWorldState;

  // Find nearby predators with different fathers (rival territorial groups)
  const rivals = indexedState.search.predator.byRadius(entity.position, PREDATOR_TERRITORIAL_RANGE);
  
  let closestRival: PredatorEntity | null = null;
  let minDistance = Infinity;

  for (const rival of rivals) {
    if (
      rival.id !== entity.id &&
      rival.hitpoints > 0 &&
      rival.isAdult &&
      // Different territorial groups (different fathers)
      entity.fatherId !== rival.fatherId &&
      entity.gender === rival.gender && // Same gender
      // Both must have fathers to determine territorial allegiance
      entity.fatherId !== undefined &&
      rival.fatherId !== undefined
    ) {
      const distance = calculateWrappedDistance(
        entity.position,
        rival.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestRival = rival;
      }
    }
  }

  if (closestRival) {
    const taskId = `animal-territorial-${entity.id}-${closestRival.id}`;
    tasks[taskId] = {
      id: taskId,
      type: TaskType.AnimalTerritorial,
      position: closestRival.position,
      creatorEntityId: entity.id,
      target: closestRival.id,
      validUntilTime: context.gameState.time + 1,
    };
  }

  return tasks;
};

/**
 * Scorer for the AnimalTerritorial task.
 * Provides a medium priority for territorial defense.
 */
export const animalTerritorialScorer = (
  entity: PredatorEntity,
  task: Task,
  context: UpdateContext,
): number | null => {
  if (entity.type !== 'predator') return null;

  // Re-check basic safety and state conditions
  if (
    !entity.isAdult ||
    entity.hitpoints < entity.maxHitpoints * 0.6 ||
    entity.hunger > 120
  ) {
    return null;
  }

  const targetId = task.target as EntityId;
  const target = context.gameState.entities.entities[targetId] as PredatorEntity | undefined;
  
  if (!target || target.hitpoints <= 0) return null;

  const distance = calculateWrappedDistance(
    entity.position,
    target.position,
    context.gameState.mapDimensions.width,
    context.gameState.mapDimensions.height,
  );

  if (distance > PREDATOR_TERRITORIAL_RANGE * 1.2) return null;

  const distanceScore = getDistanceScore(distance);
  
  // Medium base priority for territorial disputes
  return distanceScore * 0.7;
};

/**
 * Executor for the AnimalTerritorial task.
 * Initiates an attack or approaches the rival predator.
 */
export const animalTerritorialExecutor = (
  task: Task,
  entity: PredatorEntity,
  context: UpdateContext,
): TaskResult => {
  if (entity.type !== 'predator') return TaskResult.Failure;

  const targetId = task.target as EntityId;
  const target = context.gameState.entities.entities[targetId] as PredatorEntity | undefined;

  if (!target || target.hitpoints <= 0) {
    return TaskResult.Success; // Rival is gone or dead
  }

  const { width, height } = context.gameState.mapDimensions;
  const distance = calculateWrappedDistance(entity.position, target.position, width, height);

  if (distance <= PREDATOR_ATTACK_RANGE) {
    // Within fighting range, engage in territorial combat
    entity.activeAction = 'attacking';
    entity.attackTargetId = target.id;
    entity.target = target.id;
    entity.direction = { x: 0, y: 0 };
    return TaskResult.Running;
  } else {
    // Need to move closer to the rival
    entity.activeAction = 'moving';
    entity.target = target.id;

    const directionToTarget = getDirectionVectorOnTorus(
      entity.position,
      target.position,
      width,
      height,
    );

    entity.direction = vectorNormalize(directionToTarget);
    return TaskResult.Running;
  }
};

export const animalTerritorialTask: TaskDefinition<PredatorEntity> = {
  type: TaskType.AnimalTerritorial,
  producer: animalTerritorialProducer,
  scorer: animalTerritorialScorer,
  executor: animalTerritorialExecutor,
};
