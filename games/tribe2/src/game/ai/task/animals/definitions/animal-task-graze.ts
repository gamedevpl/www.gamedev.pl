import { PreyEntity } from '../../../../entities/characters/prey/prey-types';
import { Task, TaskResult, TaskType, TaskDefinition } from '../../task-types';
import { UpdateContext } from '../../../../world-types';
import { getDistanceScore } from '../../task-utils';
import { vectorDistance } from '../../../../utils/math-utils';
import { IndexedWorldState } from '../../../../world-index/world-index-types';
import { BerryBushEntity } from '../../../../entities/plants/berry-bush/berry-bush-types';
import { PREY_HUNGER_DEATH } from '../../../../animal-consts';

const GRAZE_DETECTION_RADIUS = 600;

export const animalGrazeProducer = (entity: PreyEntity, context: UpdateContext): Record<string, Task> => {
  if (entity.type !== 'prey') return {};

  const tasks: Record<string, Task> = {};
  const indexedState = context.gameState as IndexedWorldState;

  // Find berry bushes with food
  const bushes = indexedState.search['berryBush']
    .byRadius(entity.position, GRAZE_DETECTION_RADIUS)
    .filter((e) => (e as BerryBushEntity).food.length > 0);

  for (const bush of bushes) {
    const taskId = `animal-graze-${entity.id}-${bush.id}`;
    tasks[taskId] = {
      id: taskId,
      type: TaskType.AnimalGraze,
      position: bush.position,
      creatorEntityId: entity.id,
      target: bush.id,
      validUntilTime: context.gameState.time + 1,
    };
  }

  return tasks;
};

export const animalGrazeScorer = (entity: PreyEntity, task: Task, context: UpdateContext): number | null => {
  if (entity.type !== 'prey') return null;

  const bush = context.gameState.entities.entities[task.target as number] as BerryBushEntity;
  if (!bush || bush.food.length === 0) return null;

  const distance = vectorDistance(entity.position, bush.position);
  if (distance > GRAZE_DETECTION_RADIUS) return null;

  const distanceScore = getDistanceScore(distance);

  // Higher hunger = higher score.
  const hungerScore = Math.max(0, entity.hunger / PREY_HUNGER_DEATH);

  // Only graze if somewhat hungry, unless it's very close
  if (entity.hunger < 20 && distance > 100) return null;

  return distanceScore * hungerScore * 0.65;
};

export const animalGrazeExecutor = (task: Task, entity: PreyEntity, context: UpdateContext): TaskResult => {
  if (entity.type !== 'prey') return TaskResult.Failure;

  const bush = context.gameState.entities.entities[task.target as number] as BerryBushEntity;
  if (!bush || bush.food.length === 0) return TaskResult.Success; // Success because task is done (no more food)

  // Trigger grazing state
  entity.activeAction = 'grazing';
  entity.target = bush.id;

  // Grazing state handles movement and eating. If hunger is low, we are done.
  if (entity.hunger < 5) return TaskResult.Success;

  return TaskResult.Running;
};

export const animalGrazeTask: TaskDefinition<PreyEntity> = {
  type: TaskType.AnimalGraze,
  producer: animalGrazeProducer,
  scorer: animalGrazeScorer,
  executor: animalGrazeExecutor,
};
