import { PreyEntity } from '../../../../entities/characters/prey/prey-types';
import { Task, TaskResult, TaskType, TaskDefinition } from '../../task-types';
import { UpdateContext } from '../../../../world-types';
import { getDistanceScore } from '../../task-utils';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../../utils/math-utils';
import { IndexedWorldState } from '../../../../world-index/world-index-types';
import { PREY_INTERACTION_RANGE } from '../../../../animal-consts';
import { Vector2D } from '../../../../utils/math-types';

/**
 * Producer for the AnimalHerd task.
 * Identifies nearby prey of the same type and calculates a group center to move toward.
 */
export const animalHerdProducer = (
  entity: PreyEntity,
  context: UpdateContext,
): Record<string, Task> => {
  if (entity.type !== 'prey') return {};

  // Only engage in herding when safe and not busy
  if (
    entity.hunger > 90 || // Too hungry to socialize
    entity.hitpoints < entity.maxHitpoints * 0.3 || // Too injured
    entity.activeAction === 'grazing' ||
    entity.activeAction === 'procreating'
  ) {
    return {};
  }

  const tasks: Record<string, Task> = {};
  const indexedState = context.gameState as IndexedWorldState;
  const { width, height } = context.gameState.mapDimensions;

  // Find nearby prey of the same type to form/join herd
  const nearbyPrey = indexedState.search.prey.byRadius(entity.position, PREY_INTERACTION_RANGE * 5);
  const herdMembers: PreyEntity[] = [];

  for (const other of nearbyPrey) {
    if (other.id !== entity.id && other.hitpoints > 0 && other.isAdult) {
      herdMembers.push(other);
    }
  }

  // Find the center of the largest nearby group (requires at least 2 other members)
  if (herdMembers.length >= 2) {
    // Calculate herd center (average position)
    let centerX = 0;
    let centerY = 0;
    for (const member of herdMembers) {
      centerX += member.position.x;
      centerY += member.position.y;
    }
    centerX /= herdMembers.length;
    centerY /= herdMembers.length;

    const herdCenter: Vector2D = { x: centerX, y: centerY };
    const distanceToHerd = calculateWrappedDistance(entity.position, herdCenter, width, height);

    // Join herd if too far from the group
    if (distanceToHerd > PREY_INTERACTION_RANGE * 2) {
      const taskId = `animal-herd-${entity.id}`;
      tasks[taskId] = {
        id: taskId,
        type: TaskType.AnimalHerd,
        position: herdCenter,
        creatorEntityId: entity.id,
        target: herdCenter,
        validUntilTime: context.gameState.time + 1,
      };
    }
  }

  return tasks;
};

/**
 * Scorer for the AnimalHerd task.
 * Provides a low-medium priority for social grouping.
 */
export const animalHerdScorer = (
  entity: PreyEntity,
  task: Task,
  context: UpdateContext,
): number | null => {
  if (entity.type !== 'prey') return null;

  // Re-check basic safety and state conditions
  if (
    entity.hunger > 90 ||
    entity.hitpoints < entity.maxHitpoints * 0.3 ||
    entity.activeAction === 'grazing' ||
    entity.activeAction === 'procreating'
  ) {
    return null;
  }

  const herdCenter = task.target as Vector2D;
  const { width, height } = context.gameState.mapDimensions;
  const distance = calculateWrappedDistance(entity.position, herdCenter, width, height);

  // Already close enough
  if (distance <= PREY_INTERACTION_RANGE * 2) return null;

  // Lower priority than survival tasks like fleeing or grazing
  const distanceScore = getDistanceScore(distance);
  return distanceScore * 0.4;
};

/**
 * Executor for the AnimalHerd task.
 * Moves the entity towards the calculated herd center.
 */
export const animalHerdExecutor = (
  task: Task,
  entity: PreyEntity,
  context: UpdateContext,
): TaskResult => {
  if (entity.type !== 'prey') return TaskResult.Failure;

  const herdCenter = task.target as Vector2D;
  const { width, height } = context.gameState.mapDimensions;
  const distance = calculateWrappedDistance(entity.position, herdCenter, width, height);

  if (distance <= PREY_INTERACTION_RANGE * 2) {
    entity.activeAction = 'idle';
    entity.direction = { x: 0, y: 0 };
    return TaskResult.Success;
  }

  // Move towards herd center
  entity.activeAction = 'moving';
  entity.target = herdCenter;

  const directionToHerd = getDirectionVectorOnTorus(
    entity.position,
    herdCenter,
    width,
    height,
  );

  entity.direction = vectorNormalize(directionToHerd);

  return TaskResult.Running;
};

export const animalHerdTask: TaskDefinition<PreyEntity> = {
  type: TaskType.AnimalHerd,
  producer: animalHerdProducer,
  scorer: animalHerdScorer,
  executor: animalHerdExecutor,
};
