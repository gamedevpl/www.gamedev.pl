import { PredatorEntity } from '../../../entities/characters/predator/predator-types';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';
import { UpdateContext } from '../../../world-types';
import { animalTaskDefinitions } from './definitions';
import { executeTask, getCurrentTask, produceEntityTasks, setCurrentTask } from '../task-utils';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { TaskDefinition, TaskType } from '../task-types';

export function prepareAnimalTaskAI(entity: PreyEntity | PredatorEntity, context: UpdateContext): void {
  produceEntityTasks<PreyEntity | PredatorEntity>(
    entity,
    context,
    Object.values(animalTaskDefinitions) as TaskDefinition<PreyEntity | PredatorEntity>[],
  );
}

export function updateAnimalTaskAI(entity: PreyEntity | PredatorEntity, context: UpdateContext): void {
  let currentTaskId = getCurrentTask(entity);

  // Validate current task still exists and hasn't been claimed by someone else
  if (currentTaskId) {
    const task = context.gameState.tasks[currentTaskId];
    if (!task || (task.claimedByEntityId && task.claimedByEntityId !== entity.id)) {
      setCurrentTask(entity, null);
      currentTaskId = null;
    }
  }

  // Task Picking
  if (!currentTaskId) {
    const bestTaskId = pickTaskForAnimal(entity, context);
    if (bestTaskId && context.gameState.tasks[bestTaskId]) {
      const bestTask = context.gameState.tasks[bestTaskId];
      currentTaskId = bestTaskId;
      setCurrentTask(entity, currentTaskId);
      if (bestTask) {
        bestTask.claimedByEntityId = entity.id;
      }
    }
  }

  // Execute current task
  if (currentTaskId) {
    const task = context.gameState.tasks[currentTaskId];
    if (task) {
      executeTask<PreyEntity | PredatorEntity>(
        entity,
        task,
        context,
        animalTaskDefinitions as Record<TaskType, TaskDefinition<PreyEntity | PredatorEntity>>,
      );
    } else {
      setCurrentTask(entity, null);
    }
  }
}

function pickTaskForAnimal(entity: PreyEntity | PredatorEntity, context: UpdateContext): string | null {
  let bestTaskId: string | null = null;
  let bestScore = -Infinity;

  const closeTasks = (context.gameState as IndexedWorldState).search.tasks.byRadius(entity.position, 1000);

  for (let task of closeTasks) {
    if (!task) {
      continue;
    }

    // Skip tasks already claimed by others
    if (task.claimedByEntityId && task.claimedByEntityId !== entity.id) {
      continue;
    }

    const definition = animalTaskDefinitions[task.type] as TaskDefinition<PreyEntity | PredatorEntity>;
    if (!definition || !definition.scorer) {
      continue;
    }

    const score = definition.scorer(entity, task, context);
    if (score !== null && score > bestScore) {
      bestScore = score;
      bestTaskId = task.id;
    }
  }

  // Only return if we found a positive utility task
  return bestScore > 0 ? bestTaskId : null;
}
