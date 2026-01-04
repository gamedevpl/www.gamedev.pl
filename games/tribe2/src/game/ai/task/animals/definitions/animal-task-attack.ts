import { PredatorEntity } from '../../../../entities/characters/predator/predator-types';
import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { Task, TaskResult, TaskType, TaskDefinition } from '../../task-types';
import { UpdateContext } from '../../../../world-types';
import { getDistanceScore } from '../../task-utils';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../../utils/math-utils';
import { IndexedWorldState } from '../../../../world-index/world-index-types';
import { PREDATOR_ATTACK_RANGE } from '../../../../animal-consts';
import { EntityId } from '../../../../entities/entities-types';

/**
 * Producer for the AnimalAttack task.
 * Identifies nearby humans to attack if the predator is hungry or defensive.
 */
export const animalAttackProducer = (
  entity: PredatorEntity,
  context: UpdateContext,
): Record<string, Task> => {
  if (entity.type !== 'predator') return {};

  // Only attack if very hungry or if humans are very close (defensive)
  const isVeryHungry = entity.hunger > 100;
  const isDefensive = entity.hitpoints < entity.maxHitpoints * 0.5;

  if (!isVeryHungry && !isDefensive) {
    return {};
  }

  // Check attack cooldown
  if (entity.attackCooldown && entity.attackCooldown > 0) {
    return {};
  }

  const tasks: Record<string, Task> = {};
  const indexedState = context.gameState as IndexedWorldState;

  // Find nearby humans within detection range
  const humans = indexedState.search.human.byRadius(entity.position, PREDATOR_ATTACK_RANGE * 2);
  
  let closestHuman: HumanEntity | null = null;
  let minDistance = Infinity;

  for (const human of humans) {
    if (human.hitpoints > 0) {
      const distance = calculateWrappedDistance(
        entity.position,
        human.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestHuman = human;
      }
    }
  }

  if (closestHuman) {
    const taskId = `animal-attack-human-${entity.id}-${closestHuman.id}`;
    tasks[taskId] = {
      id: taskId,
      type: TaskType.AnimalAttack,
      position: closestHuman.position,
      creatorEntityId: entity.id,
      target: closestHuman.id,
      validUntilTime: context.gameState.time + 1,
    };
  }

  return tasks;
};

/**
 * Scorer for the AnimalAttack task.
 * High priority for survival-based interactions.
 */
export const animalAttackScorer = (
  entity: PredatorEntity,
  task: Task,
  context: UpdateContext,
): number | null => {
  if (entity.type !== 'predator') return null;

  const targetId = task.target as EntityId;
  const target = context.gameState.entities.entities[targetId] as HumanEntity | undefined;
  
  if (!target || target.hitpoints <= 0) return null;

  const distance = calculateWrappedDistance(
    entity.position,
    target.position,
    context.gameState.mapDimensions.width,
    context.gameState.mapDimensions.height,
  );

  if (distance > PREDATOR_ATTACK_RANGE * 2.5) return null;

  const distanceScore = getDistanceScore(distance);
  
  // High base priority for combat
  return distanceScore * 0.75;
};

/**
 * Executor for the AnimalAttack task.
 * Initiates an attack or approaches the human target.
 */
export const animalAttackExecutor = (
  task: Task,
  entity: PredatorEntity,
  context: UpdateContext,
): TaskResult => {
  if (entity.type !== 'predator') return TaskResult.Failure;

  const targetId = task.target as EntityId;
  const target = context.gameState.entities.entities[targetId] as HumanEntity | undefined;

  if (!target || target.hitpoints <= 0) {
    return TaskResult.Success; // Target is gone or dead
  }

  const { width, height } = context.gameState.mapDimensions;
  const distance = calculateWrappedDistance(entity.position, target.position, width, height);

  if (distance <= PREDATOR_ATTACK_RANGE) {
    // Within attack range, start attacking
    entity.activeAction = 'attacking';
    entity.attackTargetId = target.id;
    entity.target = target.id;
    entity.direction = { x: 0, y: 0 };
    return TaskResult.Running;
  } else {
    // Need to move closer to the human
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

export const animalAttackTask: TaskDefinition<PredatorEntity> = {
  type: TaskType.AnimalAttack,
  producer: animalAttackProducer,
  scorer: animalAttackScorer,
  executor: animalAttackExecutor,
};
