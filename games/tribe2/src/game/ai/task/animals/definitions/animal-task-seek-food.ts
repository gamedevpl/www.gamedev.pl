import { PredatorEntity } from '../../../../entities/characters/predator/predator-types';
import { PreyEntity } from '../../../../entities/characters/prey/prey-types';
import { Task, TaskResult, TaskType, TaskDefinition } from '../../task-types';
import { UpdateContext } from '../../../../world-types';
import { getDistanceScore } from '../../task-utils';
import { vectorDistance } from '../../../../utils/math-utils';
import {
  ANIMAL_CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
  PREY_HUNGER_DEATH,
  PREDATOR_HUNGER_DEATH,
} from '../../../../animal-consts';

export const animalSeekFoodProducer = (
  entity: PreyEntity | PredatorEntity,
  context: UpdateContext,
): Record<string, Task> => {
  // Only children (non-adults) seek food from parents when hungry
  if (entity.isAdult || entity.hunger < ANIMAL_CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD || !entity.motherId) {
    return {};
  }

  const mother = context.gameState.entities.entities[entity.motherId] as PreyEntity | PredatorEntity;
  if (!mother) return {};

  const tasks: Record<string, Task> = {};
  const taskId = `animal-seek-food-${entity.id}-${mother.id}`;

  tasks[taskId] = {
    id: taskId,
    type: TaskType.AnimalSeekFoodFromParent,
    position: mother.position,
    creatorEntityId: entity.id,
    target: mother.id,
    validUntilTime: context.gameState.time + 1,
  };

  return tasks;
};

export const animalSeekFoodScorer = (
  entity: PreyEntity | PredatorEntity,
  _task: Task,
  context: UpdateContext,
): number | null => {
  if (entity.isAdult || !entity.motherId) return null;

  const mother = context.gameState.entities.entities[entity.motherId] as PreyEntity | PredatorEntity;
  if (!mother) return null;

  const distance = vectorDistance(entity.position, mother.position);
  const distanceScore = getDistanceScore(distance);

  const maxHunger = entity.type === 'prey' ? PREY_HUNGER_DEATH : PREDATOR_HUNGER_DEATH;
  const hungerScore = Math.max(0, entity.hunger / maxHunger);

  // High priority when very hungry
  return distanceScore * hungerScore * 0.85;
};

export const animalSeekFoodExecutor = (
  task: Task,
  entity: PreyEntity | PredatorEntity,
  context: UpdateContext,
): TaskResult => {
  const mother = context.gameState.entities.entities[task.target as number] as PreyEntity | PredatorEntity;

  // If mother is gone or child is no longer hungry, task is done
  if (!mother || entity.hunger < ANIMAL_CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD / 2) {
    return TaskResult.Success;
  }

  const distance = vectorDistance(entity.position, mother.position);

  if (distance < 30) {
    // Reached mother, wait for feeding
    return TaskResult.Running;
  }

  // Move towards mother
  entity.activeAction = 'moving';
  entity.target = mother.id;

  return TaskResult.Running;
};

export const animalSeekFoodTask: TaskDefinition<PreyEntity | PredatorEntity> = {
  type: TaskType.AnimalSeekFoodFromParent,
  producer: animalSeekFoodProducer,
  scorer: animalSeekFoodScorer,
  executor: animalSeekFoodExecutor,
};
