import { PredatorEntity } from '../../../../entities/characters/predator/predator-types';
import { PreyEntity } from '../../../../entities/characters/prey/prey-types';
import { Task, TaskResult, TaskType, TaskDefinition } from '../../task-types';
import { UpdateContext } from '../../../../world-types';
import { getDistanceScore } from '../../task-utils';
import { vectorDistance } from '../../../../utils/math-utils';
import { IndexedWorldState } from '../../../../world-index/world-index-types';
import { PREDATOR_HUNGER_DEATH } from '../../../../animal-consts';

const HUNT_DETECTION_RADIUS = 800;

export const animalHuntProducer = (entity: PredatorEntity, context: UpdateContext): Record<string, Task> => {
  if (entity.type !== 'predator') return {};

  const tasks: Record<string, Task> = {};
  const indexedState = context.gameState as IndexedWorldState;

  // Find prey entities
  const preys = indexedState.search['prey']
    .byRadius(entity.position, HUNT_DETECTION_RADIUS)
    .filter((e) => e.type === 'prey');

  for (const prey of preys) {
    const taskId = `animal-hunt-${entity.id}-${prey.id}`;
    tasks[taskId] = {
      id: taskId,
      type: TaskType.AnimalHunt,
      position: prey.position,
      creatorEntityId: entity.id,
      target: prey.id,
      validUntilTime: context.gameState.time + 1,
    };
  }

  return tasks;
};

export const animalHuntScorer = (entity: PredatorEntity, task: Task, context: UpdateContext): number | null => {
  if (entity.type !== 'predator') return null;

  const prey = context.gameState.entities.entities[task.target as number] as PreyEntity;
  if (!prey || prey.hitpoints <= 0) return null;

  const distance = vectorDistance(entity.position, prey.position);
  if (distance > HUNT_DETECTION_RADIUS) return null;

  const distanceScore = getDistanceScore(distance);

  // Higher hunger = higher score
  const hungerScore = Math.max(0, entity.hunger / PREDATOR_HUNGER_DEATH);

  // Predators only hunt if they are somewhat hungry, unless the prey is very close
  if (entity.hunger < 30 && distance > 200) return null;

  return distanceScore * hungerScore * 0.8;
};

export const animalHuntExecutor = (task: Task, entity: PredatorEntity, context: UpdateContext): TaskResult => {
  if (entity.type !== 'predator') return TaskResult.Failure;

  const prey = context.gameState.entities.entities[task.target as number] as PreyEntity;
  if (!prey || prey.hitpoints <= 0) return TaskResult.Success; // Prey is gone or dead

  // Trigger attacking state
  entity.activeAction = 'attacking';
  entity.target = prey.id;

  // If predator is no longer hungry, we are done hunting
  if (entity.hunger < 10) return TaskResult.Success;

  return TaskResult.Running;
};

export const animalHuntTask: TaskDefinition<PredatorEntity> = {
  type: TaskType.AnimalHunt,
  producer: animalHuntProducer,
  scorer: animalHuntScorer,
  executor: animalHuntExecutor,
};
