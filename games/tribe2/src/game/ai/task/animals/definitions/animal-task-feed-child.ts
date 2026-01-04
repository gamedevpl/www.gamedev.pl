import { PredatorEntity } from '../../../../entities/characters/predator/predator-types';
import { PreyEntity } from '../../../../entities/characters/prey/prey-types';
import { Task, TaskResult, TaskType, TaskDefinition } from '../../task-types';
import { UpdateContext } from '../../../../world-types';
import { getDistanceScore } from '../../task-utils';
import { vectorDistance } from '../../../../utils/math-utils';
import { IndexedWorldState } from '../../../../world-index/world-index-types';
import {
  ANIMAL_CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
  PREY_HUNGER_DEATH,
  PREDATOR_HUNGER_DEATH,
} from '../../../../animal-consts';

// Note: Feeding state might need to be added to the state machine if not already present.
// For now, we assume it's handled or we'll trigger a movement towards the child.
// In the current behavior tree, it likely uses an interaction.

export const animalFeedChildProducer = (
  entity: PreyEntity | PredatorEntity,
  context: UpdateContext,
): Record<string, Task> => {
  // Only female adults can feed children
  if (
    entity.gender !== 'female' ||
    !entity.isAdult ||
    (entity.feedChildCooldownTime && entity.feedChildCooldownTime > 0)
  ) {
    return {};
  }

  const tasks: Record<string, Task> = {};
  const indexedState = context.gameState as IndexedWorldState;

  // Find nearby children that belong to this mother and are hungry
  const children = indexedState.search[entity.type].byRadius(entity.position, 600).filter((e) => {
    if (e.type !== entity.type) return false;
    const child = e as PreyEntity | PredatorEntity;
    return child.motherId === entity.id && child.hunger >= ANIMAL_CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD;
  });

  for (const child of children) {
    const taskId = `animal-feed-child-${entity.id}-${child.id}`;
    tasks[taskId] = {
      id: taskId,
      type: TaskType.AnimalFeedChild,
      position: child.position,
      creatorEntityId: entity.id,
      target: child.id,
      validUntilTime: context.gameState.time + 1,
    };
  }

  return tasks;
};

export const animalFeedChildScorer = (
  entity: PreyEntity | PredatorEntity,
  task: Task,
  context: UpdateContext,
): number | null => {
  if (
    entity.gender !== 'female' ||
    !entity.isAdult ||
    (entity.feedChildCooldownTime && entity.feedChildCooldownTime > 0)
  ) {
    return null;
  }

  const child = context.gameState.entities.entities[task.target as number] as PreyEntity | PredatorEntity;
  if (!child || child.motherId !== entity.id) return null;

  const distance = vectorDistance(entity.position, child.position);
  const distanceScore = getDistanceScore(distance);

  const maxHunger = entity.type === 'prey' ? PREY_HUNGER_DEATH : PREDATOR_HUNGER_DEATH;
  const hungerScore = Math.max(0, child.hunger / maxHunger);

  return distanceScore * hungerScore * 0.9;
};

export const animalFeedChildExecutor = (
  task: Task,
  entity: PreyEntity | PredatorEntity,
  context: UpdateContext,
): TaskResult => {
  const child = context.gameState.entities.entities[task.target as number] as PreyEntity | PredatorEntity;
  if (!child || child.hunger < ANIMAL_CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD / 2) {
    return TaskResult.Success;
  }

  const distance = vectorDistance(entity.position, child.position);

  if (distance < 30) {
    // Within feeding range. The interaction system or animal update should handle the actual hunger reduction.
    // For now, we set the active action to 'feeding' if supported.
    entity.activeAction = 'feeding';
    return TaskResult.Running;
  }

  // Move towards child
  entity.activeAction = 'moving';
  entity.target = child.id;
  return TaskResult.Running;
};

export const animalFeedChildTask: TaskDefinition<PreyEntity | PredatorEntity> = {
  type: TaskType.AnimalFeedChild,
  producer: animalFeedChildProducer,
  scorer: animalFeedChildScorer,
  executor: animalFeedChildExecutor,
};
