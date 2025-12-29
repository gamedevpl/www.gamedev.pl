import { PredatorEntity } from '../../../entities/characters/predator/predator-types';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';
import { UpdateContext } from '../../../world-types';
import { animalTaskDefinitions } from './definitions';
import { TaskType } from '../task-types';

export function updateAnimalTaskAI(entity: PreyEntity | PredatorEntity, context: UpdateContext): void {
  for (const definition of Object.values(animalTaskDefinitions)) {
    if (definition && definition.producer) {
      // Check if this animal type should produce this task
      const isPreyTask = definition.type === TaskType.HumanHuntPrey;
      const isPredatorTask = definition.type === TaskType.HumanHuntPredator;

      if ((isPreyTask && entity.type === 'prey') || (isPredatorTask && entity.type === 'predator')) {
        const producedTasks = definition.producer(entity as any, context);
        for (const [taskId, task] of Object.entries(producedTasks)) {
          // Add produced tasks to the global task pool if not already present
          if (!context.gameState.tasks[taskId]) {
            context.gameState.tasks[taskId] = task;
          }
        }
      }
    }
  }
}
