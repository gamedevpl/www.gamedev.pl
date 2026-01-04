import { PredatorEntity } from '../../../../entities/characters/predator/predator-types';
import { PreyEntity } from '../../../../entities/characters/prey/prey-types';
import { Task, TaskResult, TaskType, TaskDefinition } from '../../task-types';
import { UpdateContext } from '../../../../world-types';
import { getDistanceScore } from '../../task-utils';
import { vectorDistance } from '../../../../utils/math-utils';
import { IndexedWorldState } from '../../../../world-index/world-index-types';

const PROCREATION_DETECTION_RADIUS = 500;

export const animalProcreateProducer = (
  entity: PreyEntity | PredatorEntity,
  context: UpdateContext,
): Record<string, Task> => {
  if (!entity.isAdult || (entity.procreationCooldown && entity.procreationCooldown > 0) || entity.isPregnant) {
    return {};
  }

  const tasks: Record<string, Task> = {};
  const indexedState = context.gameState as IndexedWorldState;

  const partners = indexedState.search[entity.type]
    .byRadius(entity.position, PROCREATION_DETECTION_RADIUS)
    .filter((e) => {
      if (e.id === entity.id || e.type !== entity.type) return false;

      const other = e as PreyEntity | PredatorEntity;
      return (
        other.isAdult &&
        other.gender !== entity.gender &&
        (!other.procreationCooldown || other.procreationCooldown <= 0) &&
        !other.isPregnant
      );
    });

  for (const partner of partners) {
    const taskId = `animal-procreate-${entity.id}-${partner.id}`;
    tasks[taskId] = {
      id: taskId,
      type: TaskType.AnimalProcreate,
      position: partner.position,
      creatorEntityId: entity.id,
      target: partner.id,
      validUntilTime: context.gameState.time + 1,
    };
  }

  return tasks;
};

export const animalProcreateScorer = (
  entity: PreyEntity | PredatorEntity,
  task: Task,
  context: UpdateContext,
): number | null => {
  if (!entity.isAdult || (entity.procreationCooldown && entity.procreationCooldown > 0) || entity.isPregnant) {
    return null;
  }

  const partner = context.gameState.entities.entities[task.target as number] as PreyEntity | PredatorEntity;
  if (
    !partner ||
    !partner.isAdult ||
    partner.gender === entity.gender ||
    (partner.procreationCooldown && partner.procreationCooldown > 0) ||
    partner.isPregnant
  ) {
    return null;
  }

  const distance = vectorDistance(entity.position, partner.position);
  if (distance > PROCREATION_DETECTION_RADIUS) return null;

  // High priority when ready, but distance still matters
  return getDistanceScore(distance) * 0.6;
};

export const animalProcreateExecutor = (
  task: Task,
  entity: PreyEntity | PredatorEntity,
  context: UpdateContext,
): TaskResult => {
  const partner = context.gameState.entities.entities[task.target as number] as PreyEntity | PredatorEntity;
  if (!partner || partner.isPregnant || (partner.procreationCooldown && partner.procreationCooldown > 0)) {
    return TaskResult.Failure;
  }

  entity.activeAction = 'procreating';
  entity.target = partner.id;

  // If the entity is now pregnant or has cooldown, we are done.
  if (entity.isPregnant || (entity.procreationCooldown && entity.procreationCooldown > 0)) {
    return TaskResult.Success;
  }

  return TaskResult.Running;
};

export const animalProcreateTask: TaskDefinition<PreyEntity | PredatorEntity> = {
  type: TaskType.AnimalProcreate,
  producer: animalProcreateProducer,
  scorer: animalProcreateScorer,
  executor: animalProcreateExecutor,
};
