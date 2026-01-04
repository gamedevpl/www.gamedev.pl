import { PredatorEntity } from '../../../../entities/characters/predator/predator-types';
import { PreyEntity } from '../../../../entities/characters/prey/prey-types';
import { Task, TaskResult, TaskType, TaskDefinition } from '../../task-types';
import { UpdateContext } from '../../../../world-types';
import { vectorDistance } from '../../../../utils/math-utils';

const WANDER_RADIUS = 200;

export const animalWanderProducer = (
  entity: PreyEntity | PredatorEntity,
  context: UpdateContext,
): Record<string, Task> => {
  const taskId = `animal-wander-${entity.id}`;

  // Generate a random position nearby
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * WANDER_RADIUS;
  const wanderPosition = {
    x: entity.position.x + Math.cos(angle) * distance,
    y: entity.position.y + Math.sin(angle) * distance,
  };

  // Keep within bounds
  wanderPosition.x = Math.max(0, Math.min(context.gameState.mapDimensions.width, wanderPosition.x));
  wanderPosition.y = Math.max(0, Math.min(context.gameState.mapDimensions.height, wanderPosition.y));

  const tasks: Record<string, Task> = {};
  tasks[taskId] = {
    id: taskId,
    type: TaskType.AnimalWander,
    position: wanderPosition,
    creatorEntityId: entity.id,
    validUntilTime: context.gameState.time + 5, // Longer validity for wandering
  };

  return tasks;
};

export const animalWanderScorer = (): number | null => {
  // Always a low fallback priority
  return 0.1;
};

export const animalWanderExecutor = (task: Task, entity: PreyEntity | PredatorEntity): TaskResult => {
  const distance = vectorDistance(entity.position, task.position);

  if (distance < 10) {
    // Arrived at wander destination
    entity.activeAction = 'idle';
    return TaskResult.Success;
  }

  // Move towards wander target
  entity.activeAction = 'moving';
  entity.target = task.position;

  return TaskResult.Running;
};

export const animalWanderTask: TaskDefinition<PreyEntity | PredatorEntity> = {
  type: TaskType.AnimalWander,
  producer: animalWanderProducer,
  scorer: animalWanderScorer,
  executor: animalWanderExecutor,
};
