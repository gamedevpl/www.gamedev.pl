import { PredatorEntity } from '../../../../entities/characters/predator/predator-types';
import { Task, TaskResult, TaskType, TaskDefinition } from '../../task-types';
import { UpdateContext } from '../../../../world-types';
import { getDistanceScore } from '../../task-utils';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../../utils/math-utils';
import { IndexedWorldState } from '../../../../world-index/world-index-types';
import { PREDATOR_INTERACTION_RANGE } from '../../../../animal-consts';
import { EntityId } from '../../../../entities/entities-types';

/**
 * Producer for the AnimalPack task.
 * Identifies the pack leader (same father) and creates a task to follow them if too far.
 */
export const animalPackProducer = (
  entity: PredatorEntity,
  context: UpdateContext,
): Record<string, Task> => {
  if (entity.type !== 'predator') return {};

  // Only follow pack if not engaged in critical activities
  if (
    entity.hunger > 100 || // Too hungry to socialize
    entity.hitpoints < entity.maxHitpoints * 0.4 || // Too injured
    entity.activeAction === 'attacking' ||
    entity.activeAction === 'procreating'
  ) {
    return {};
  }

  // Must have a father to be part of a pack
  if (entity.fatherId === undefined) {
    return {};
  }

  const tasks: Record<string, Task> = {};
  const indexedState = context.gameState as IndexedWorldState;
  const { width, height } = context.gameState.mapDimensions;

  // Find pack members (predators with the same father)
  const nearbyPredators = indexedState.search.predator.byRadius(entity.position, PREDATOR_INTERACTION_RANGE * 4);
  
  let packLeader: PredatorEntity | null = null;

  for (const other of nearbyPredators) {
    if (
      other.id !== entity.id &&
      other.hitpoints > 0 &&
      other.isAdult &&
      other.fatherId === entity.fatherId &&
      // Prefer the oldest/strongest pack member as leader
      (other.age >= entity.age || other.hitpoints > entity.hitpoints)
    ) {
      // If we already found a potential leader, compare them
      if (!packLeader || other.age > packLeader.age) {
        packLeader = other;
      }
    }
  }

  if (packLeader) {
    const distance = calculateWrappedDistance(entity.position, packLeader.position, width, height);

    // Follow if too far from pack leader
    if (distance > PREDATOR_INTERACTION_RANGE * 2) {
      const taskId = `animal-pack-follow-${entity.id}-${packLeader.id}`;
      tasks[taskId] = {
        id: taskId,
        type: TaskType.AnimalPack,
        position: packLeader.position,
        creatorEntityId: entity.id,
        target: packLeader.id,
        validUntilTime: context.gameState.time + 1,
      };
    }
  }

  return tasks;
};

/**
 * Scorer for the AnimalPack task.
 * Provides a low-medium priority for pack coordination.
 */
export const animalPackScorer = (
  entity: PredatorEntity,
  task: Task,
  context: UpdateContext,
): number | null => {
  if (entity.type !== 'predator') return null;

  // Re-check basic safety and state conditions
  if (
    entity.hunger > 100 ||
    entity.hitpoints < entity.maxHitpoints * 0.4 ||
    entity.activeAction === 'attacking' ||
    entity.activeAction === 'procreating'
  ) {
    return null;
  }

  const leaderId = task.target as EntityId;
  const leader = context.gameState.entities.entities[leaderId] as PredatorEntity | undefined;
  
  if (!leader || leader.hitpoints <= 0) return null;

  const { width, height } = context.gameState.mapDimensions;
  const distance = calculateWrappedDistance(entity.position, leader.position, width, height);

  // Already close enough
  if (distance <= PREDATOR_INTERACTION_RANGE * 2) return null;

  const distanceScore = getDistanceScore(distance);
  
  // Low-medium priority
  return distanceScore * 0.35;
};

/**
 * Executor for the AnimalPack task.
 * Moves the entity towards the pack leader.
 */
export const animalPackExecutor = (
  task: Task,
  entity: PredatorEntity,
  context: UpdateContext,
): TaskResult => {
  if (entity.type !== 'predator') return TaskResult.Failure;

  const leaderId = task.target as EntityId;
  const leader = context.gameState.entities.entities[leaderId] as PredatorEntity | undefined;

  if (!leader || leader.hitpoints <= 0) {
    return TaskResult.Success; // Leader is gone or dead
  }

  const { width, height } = context.gameState.mapDimensions;
  const distance = calculateWrappedDistance(entity.position, leader.position, width, height);

  if (distance <= PREDATOR_INTERACTION_RANGE * 2) {
    entity.activeAction = 'idle';
    entity.direction = { x: 0, y: 0 };
    return TaskResult.Success;
  }

  // Move towards pack leader
  entity.activeAction = 'moving';
  entity.target = leader.id;

  const directionToLeader = getDirectionVectorOnTorus(
    entity.position,
    leader.position,
    width,
    height,
  );

  entity.direction = vectorNormalize(directionToLeader);

  return TaskResult.Running;
};

export const animalPackTask: TaskDefinition<PredatorEntity> = {
  type: TaskType.AnimalPack,
  producer: animalPackProducer,
  scorer: animalPackScorer,
  executor: animalPackExecutor,
};
